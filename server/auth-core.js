// auth-core.js — infrastructure d'authentification de cp|WIRE : jetons signés (owner,
// invité lecture seule, invitation compte, confirmation e-mail), sessions persistées
// (comptes invités), et les trois middlewares de garde (guard/writeGuard/adminGuard).
// Extrait de app.js (qui ne faisait QUE grossir) pour que cette brique — la plus
// sensible de l'app — vive dans son propre fichier, testable isolément
// (voir test/auth-enabled.test.js, test/sessions.test.js).
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { dataDir } from "./paths.js";
import { saveBlob, restoreBlob } from "./persist.js";
import { ME } from "./config.js";
import { rateLimiter } from "./limits.js";

export const AUTH_EMAIL = process.env.AUTH_EMAIL || "";
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "";
export const AUTH_ENABLED = Boolean(AUTH_EMAIL && AUTH_PASSWORD);
export const sessions = new Map(); // token -> { role, email, lastSeen }

// ---- Persistance des sessions (comptes invités) ------------------------------
// Sans ceci, chaque redéploiement (Render "Clear build cache & deploy") déconnectait
// silencieusement tous les comptes invités — le jeton owner, lui, est auto-vérifiable
// (HMAC) et n'en a jamais eu besoin. Même principe que connaissance.js : fichier
// DATA_DIR (survit si disque persistant) + miroir Neon (survit toujours), restauré
// au démarrage. 100 % défensif : une panne de persistance ne bloque jamais l'auth,
// elle retombe simplement sur des sessions vides (reconnexion normale demandée).
const SESSIONS_FILE = path.join(dataDir(), "sessions.json");
export function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([...sessions]));
    try { saveBlob("sessions", JSON.stringify([...sessions])); } catch (e) { console.error("[sessions] miroir Neon impossible:", e.message || e); }
  } catch (e) { console.error("[sessions] écriture fichier impossible:", e.message || e); }
}
// Durée d'inactivité au-delà de laquelle une session invitée est abandonnée.
// Sans cela, lastSeen était écrit à chaque requête mais jamais relu : une session
// créée une fois restait valable indéfiniment, et survivait désormais aux
// redéploiements puisqu'elle est persistée. Les comptes les moins fiables avaient
// donc la durée de vie la plus longue, alors que le jeton owner expire à 30 jours.
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

// Retire les sessions inactives depuis plus de SESSION_IDLE_MS. Renvoie le nombre purgé.
export function purgeSessions() {
  const limite = Date.now() - SESSION_IDLE_MS;
  let n = 0;
  for (const [t, s] of sessions) {
    const vu = Number(s && s.lastSeen) || 0;
    if (vu < limite) { sessions.delete(t); n++; }
  }
  if (n) saveSessions();
  return n;
}

export async function initSessions() {
  let raw = null;
  try { raw = await restoreBlob("sessions"); } catch (e) { console.error("[sessions] restauration Neon impossible:", e.message || e); }
  if (!raw) { try { raw = fs.readFileSync(SESSIONS_FILE, "utf8"); } catch { /* premier démarrage : rien à restaurer */ } }
  if (!raw) return false;
  try {
    const entries = JSON.parse(raw);
    if (Array.isArray(entries)) for (const [t, s] of entries) if (t && s) sessions.set(t, s);
    const purgees = purgeSessions();
    if (purgees) console.log(`[sessions] ${purgees} session(s) inactive(s) purgée(s) au démarrage.`);
    return sessions.size > 0;
  } catch (e) { console.error("[sessions] JSON invalide, on repart à vide:", e.message || e); return false; }
}
// Secret de signature des liens d'invitation (dérivé du mot de passe : pas de config en plus).
// [Sécurité v346] Plus de secret en dur : si AUTH_PASSWORD est défini il sert de
// secret (et de levier de révocation) ; sinon on génère un secret aléatoire,
// persisté dans DATA_DIR (ou éphémère par session si le FS est en lecture seule).
// Objectif : aucun secret de signature présent dans le code source.
const SIGN_SECRET = AUTH_PASSWORD || (() => {
  try {
    const p = path.join(dataDir(), ".sign-secret");
    if (fs.existsSync(p)) { const v = fs.readFileSync(p, "utf8").trim(); if (v) return v; }
    const s = crypto.randomBytes(32).toString("hex");
    try { fs.writeFileSync(p, s, { mode: 0o600 }); } catch { /* FS en lecture seule → secret de session */ }
    return s;
  } catch { return crypto.randomBytes(32).toString("hex"); }
})();

// Routes interdites au rôle « consultation » : aucun récap, aucun CR, aucune réunion.
export const CONSULT_FORBIDDEN = [/^\/api\/cr\//, /^\/api\/recap$/, /^\/api\/meeting\//, /^\/api\/reunion\//];

// Durée de vie d'une session « owner » : 30 jours, puis reconnexion demandée.
export const OWNER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---- Invitation lecture seule : jeton "invité" signé, avec expiration ----
// Format : g.<expirationMs>.<signature>  — auto-vérifiable, sans stockage (survit aux redémarrages).
export function sign(payload) {
  return crypto.createHmac("sha256", SIGN_SECRET).update(payload).digest("hex");
}
export function safeEqual(a, b) {
  try {
    const ba = Buffer.from(a || "", "utf8"), bb = Buffer.from(b || "", "utf8");
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}
export function makeGuestToken(expMs) {
  return `g.${expMs}.${sign(`guest|${expMs}`)}`;
}
export function checkGuestToken(t) {
  if (!t || typeof t !== "string" || !t.startsWith("g.")) return null;
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const expMs = Number(parts[1]);
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;       // expiré
  if (!safeEqual(parts[2], sign(`guest|${expMs}`))) return null;        // signature invalide
  return { expMs };
}
// ---- Invitation "compte" : jeton signé encodant un rôle (la personne crée ensuite email + mot de passe) ----
// Format : i.<expirationMs>.<role>.<signature>
export function makeInviteToken(expMs, role = "consultation") {
  return `i.${expMs}.${role}.${sign(`invite|${expMs}|${role}`)}`;
}
export function checkInviteToken(t) {
  if (!t || typeof t !== "string" || !t.startsWith("i.")) return null;
  const parts = t.split(".");
  if (parts.length !== 4) return null;
  const expMs = Number(parts[1]); const role = parts[2];
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;
  if (!safeEqual(parts[3], sign(`invite|${expMs}|${role}`))) return null;
  return { expMs, role };
}

// ---- Confirmation d'e-mail : jeton SIGNÉ + EXPIRANT encodant l'adresse ----
// Format : c.<expirationMs>.<email base64url>.<signature>. Auto-vérifiable (aucun stockage).
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours pour cliquer le lien
const b64url = (s) => Buffer.from(String(s), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => { try { return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return ""; } };
export function makeConfirmToken(email, expMs) {
  const e = String(email).toLowerCase();
  return `c.${expMs}.${b64url(e)}.${sign(`confirm|${e}|${expMs}`)}`;
}
export function checkConfirmToken(t) {
  if (!t || typeof t !== "string" || !t.startsWith("c.")) return null;
  const parts = t.split(".");
  if (parts.length !== 4) return null;
  const expMs = Number(parts[1]); const email = unb64url(parts[2]).toLowerCase();
  if (!email || !Number.isFinite(expMs) || Date.now() > expMs) return null;
  if (!safeEqual(parts[3], sign(`confirm|${email}|${expMs}`))) return null;
  return { email, expMs };
}
// URL publique de l'app, pour bâtir les liens de confirmation (env APP_URL prioritaire, sinon l'hôte appelé).
export function baseUrl(req) {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  return `${proto}://${req.get("host")}`;
}
// E-mail de confirmation (charte Armonie).
function escHtmlAuth(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
export function confirmEmailHtml(email, link) {
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#1F1B33;max-width:520px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#2E2A5D,#4B3F8F);color:#fff;padding:22px 24px;border-bottom:3px solid #A8884E;border-radius:12px 12px 0 0">
      <div style="font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:18px">cp|WIRE — Confirmation d'accès</div>
    </div>
    <div style="border:1px solid #ece9f3;border-top:none;border-radius:0 0 12px 12px;padding:22px 24px">
      <p>Bonjour,</p>
      <p>Un accès cp|WIRE a été créé pour <b>${escHtmlAuth(email)}</b>. Pour l'activer et sécuriser votre compte, confirmez votre adresse e-mail :</p>
      <p style="text-align:center;margin:22px 0">
        <a href="${escHtmlAuth(link)}" style="background:#4B3F8F;color:#fff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:9px;display:inline-block">Confirmer mon e-mail</a>
      </p>
      <p style="font-size:12px;color:#6E6A86">Ou copiez ce lien : ${escHtmlAuth(link)}</p>
      <p style="font-size:12px;color:#6E6A86">Ce lien expire dans 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
    </div>
  </div>`;
}
// Petite page affichée après le clic sur le lien.
export function confirmPageHtml(ok, email = "") {
  const msg = ok
    ? `<h1 style="color:#2F7D4F">E-mail confirmé ✓</h1><p>L'accès${email ? " de <b>" + escHtmlAuth(email) + "</b>" : ""} est activé. Vous pouvez maintenant vous connecter à cp|WIRE.</p>`
    : `<h1 style="color:#C0392B">Lien invalide ou expiré</h1><p>Le lien de confirmation n'est plus valable. Demandez un nouveau lien à un administrateur.</p>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>cp|WIRE — Confirmation</title></head>
    <body style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#1F1B33;background:#f4f2fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
      <div style="max-width:460px;background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(46,42,93,.18);overflow:hidden">
        <div style="background:linear-gradient(135deg,#2E2A5D,#4B3F8F);color:#fff;padding:18px 24px;border-bottom:3px solid #A8884E;font-family:Poppins,Inter,sans-serif;font-weight:700">cp|WIRE</div>
        <div style="padding:26px 24px">${msg}</div>
      </div>
    </body></html>`;
}

// ---- Session « owner » : jeton SIGNÉ + EXPIRANT (remplace l'ancien jeton statique) ----
// Format : o.<expirationMs>.<signature>. Auto-vérifiable → survit aux redémarrages Render
// (pas de déconnexion intempestive). La signature dépend du mot de passe : changer
// AUTH_PASSWORD invalide donc TOUS les jetons d'un coup = levier de révocation globale.
export function makeOwnerToken(expMs) {
  return `o.${expMs}.${sign(`owner|${expMs}|${AUTH_PASSWORD}`)}`;
}
export function checkOwnerToken(t) {
  if (!t || typeof t !== "string" || !t.startsWith("o.")) return null;
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const expMs = Number(parts[1]);
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;                 // expiré
  if (!safeEqual(parts[2], sign(`owner|${expMs}|${AUTH_PASSWORD}`))) return null;  // signature invalide
  return { expMs };
}

// Détermine le rôle de la requête : "owner" (total), "consultation" (lecture, sans récap/CR) ou "guest".
export const COOKIE_JETON = "cpw_tok";

/** Lit le jeton de session dans les cookies, sans dépendance externe. */
export function jetonDuCookie(req) {
  const brut = req && req.headers && req.headers.cookie;
  if (!brut) return "";
  for (const part of String(brut).split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === COOKIE_JETON) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}

/** Pose le cookie de session à la connexion. httpOnly : inaccessible au JavaScript. */
export function poserCookieJeton(res, token, maxAgeMs) {
  const bits = [
    `${COOKIE_JETON}=${encodeURIComponent(token)}`,
    "Path=/", "HttpOnly", "SameSite=Strict",
    `Max-Age=${Math.floor((maxAgeMs || 30 * 24 * 3600e3) / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") bits.push("Secure");
  res.append("Set-Cookie", bits.join("; "));
}

/** Retire le cookie à la déconnexion. */
export function retirerCookieJeton(res) {
  res.append("Set-Cookie", `${COOKIE_JETON}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function guard(req, res, next) {
  if (!AUTH_ENABLED) { req.role = "owner"; req.userEmail = ME; return next(); }
  // Le jeton arrive normalement dans l'en-tête « x-access-token », posé par le front.
  // Mais ShareFly et l'Atelier de flux s'ouvrent par une NAVIGATION PLEINE PAGE : le
  // navigateur n'envoie alors aucun en-tête personnalisé, et ces pages étaient donc
  // impossibles à protéger. D'où le repli sur un cookie de session, posé à la connexion.
  // SameSite=Strict : le navigateur ne l'envoie jamais depuis un autre site, ce qui
  // ferme la porte au CSRF que l'usage d'un cookie ouvrirait autrement.
  const t = req.headers["x-access-token"] || jetonDuCookie(req);
  let role = null, email = null;
  if (checkOwnerToken(t)) { role = "owner"; email = AUTH_EMAIL; }
  else if (t && sessions.has(t)) {
    const s = sessions.get(t);
    // Session dormante au-delà du seuil : on la refuse et on la retire, sans attendre la purge.
    if ((Number(s.lastSeen) || 0) < Date.now() - SESSION_IDLE_MS) { sessions.delete(t); }
    else { role = s.role; email = s.email; s.lastSeen = Date.now(); }
  }
  else if (checkGuestToken(t)) { role = "guest"; }
  if (!role) {
    // Deux publics, deux réponses. Un appel d'API attend du JSON ; une NAVIGATION
    // (ShareFly, Atelier de flux, ouverts en pleine page) affichait jusqu'ici
    // « {"error":"Authentification requise."} » en texte brut, ce qui laisse
    // l'utilisateur devant une page blanche sans savoir quoi faire. On le renvoie
    // vers l'application, qui sait le faire se connecter, avec l'adresse demandée
    // en mémoire pour l'y ramener ensuite.
    const veutHtml = String(req.headers.accept || "").includes("text/html");
    if (veutHtml && req.method === "GET") {
      const retour = encodeURIComponent(req.originalUrl || req.url || "/");
      return res.redirect(302, `/?retour=${retour}`);
    }
    return res.status(401).json({ error: "Authentification requise." });
  }
  req.role = role; req.userEmail = email;

  // Le cookie de session n'était posé qu'à la CONNEXION : les personnes déjà
  // connectées avant sa mise en place n'en avaient pas, et se voyaient refuser
  // ShareFly et l'Atelier de flux jusqu'à une reconnexion manuelle. Dès qu'une
  // requête authentifiée arrive avec le jeton en en-tête, on pose le cookie :
  // la session se répare d'elle-même, sans que personne n'ait à se déconnecter.
  if (t && !jetonDuCookie(req)) {
    try { poserCookieJeton(res, t); } catch (e) { /* en-têtes déjà envoyés : sans gravité */ }
  }
  // Verrou serveur : ni le rôle consultation ni le rôle invité (lien partagé) ne peuvent
  // atteindre un récap/CR/réunion, même en forçant l'URL. Le rôle "guest" était omis :
  // un lien qui circule avait donc plus de droits qu'un compte nominatif.
  if ((role === "consultation" || role === "guest") && CONSULT_FORBIDDEN.some((re) => re.test(req.path))) {
    return res.status(403).json({ error: "Accès non autorisé pour ce rôle." });
  }
  next();
}

// Rôles à droits complets : le propriétaire (owner) et les administrateurs invités (admin).
export const isAdmin = (role) => role === "owner" || role === "admin";

// À placer APRÈS guard sur toute route qui modifie des données ou déclenche un envoi :
// seuls l'owner et les admins écrivent. Les rôles consultation/guest sont en lecture seule → 403.
export function writeGuard(req, res, next) {
  if (!isAdmin(req.role)) {
    return res.status(403).json({ error: "Action non autorisée : accès en lecture seule." });
  }
  next();
}

// Réservé aux administrateurs (owner ou admin invité = droits complets).
export function adminGuard(req, res, next) {
  if (!isAdmin(req.role)) return res.status(403).json({ error: "Réservé à l'administrateur." });
  next();
}

// Plafond de tentatives de connexion — comptes ET mot de passe owner, même limiteur.
export const loginLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 15, message: "Trop de tentatives de connexion. Réessayez dans quelques minutes." });
