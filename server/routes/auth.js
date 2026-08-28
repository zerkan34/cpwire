// routes/auth.js — identité : connexion, session courante, déconnexion, activation de
// compte invité (claim + confirmation e-mail), invitation lecture seule. Extrait de
// app.js pour réduire sa taille ; testé par test/auth-enabled.test.js, test/sessions.test.js
// et test/admin.test.js (le comportement, pas l'emplacement du fichier, est ce qui compte).
import express from "express";
import crypto from "crypto";
import { dataDirInfo } from "../paths.js";
import { persistenceActive } from "../persist.js";
import { ME } from "../config.js";
import { verifyUser, createUser, setUserConfirmed } from "../users.js";
import { sendMail, msConfigured } from "../microsoft.js";
import { AUTH_EMAIL, AUTH_PASSWORD, AUTH_ENABLED, sessions, saveSessions, loginLimiter,
  OWNER_TTL_MS, CONFIRM_TTL_MS,
  makeOwnerToken, checkInviteToken, makeConfirmToken, checkConfirmToken,
  baseUrl, confirmEmailHtml, confirmPageHtml, makeGuestToken,
  guard, writeGuard, poserCookieJeton, retirerCookieJeton } from "../auth-core.js";

const isPersistent = () => dataDirInfo().persistent || persistenceActive();

export const authRouter = express.Router();

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!AUTH_ENABLED) {
    const t = crypto.randomUUID(); sessions.set(t, { role: "owner", email: ME, lastSeen: Date.now() }); saveSessions();
    poserCookieJeton(res, t); return res.json({ token: t, me: ME, role: "owner", note: "Auth non configurée côté serveur." });
  }
  if (email === AUTH_EMAIL && password === AUTH_PASSWORD) {
    const t = makeOwnerToken(Date.now() + OWNER_TTL_MS);
    poserCookieJeton(res, t); return res.json({ token: t, me: ME, role: "owner" });
  }
  try {
    const u = await verifyUser(email, password);
    if (u) {
      if (u.confirmed === false) return res.status(403).json({ error: "Compte non confirmé. Cliquez le lien de confirmation reçu par e-mail, ou demandez à un administrateur de valider votre accès." });
      const t = crypto.randomUUID(); sessions.set(t, { role: u.role, email: u.email, lastSeen: Date.now() }); saveSessions();
      poserCookieJeton(res, t); return res.json({ token: t, me: u.email, role: u.role });
    }
  } catch (e) {
    console.error("[POST /api/login]", e && e.message ? e.message : e); return res.status(502).json({ error: "Base de comptes indisponible : " + String(e.message || e) }); }
  return res.status(401).json({ error: "Identifiants incorrects." });
});

// Activation d'un compte invité : la personne arrive avec un lien (token) et choisit email + mot de passe.
// Le compte est créé NON CONFIRMÉ ; un e-mail de confirmation est envoyé. Pas de session tant que non confirmé.
authRouter.post("/account/claim", loginLimiter, async (req, res) => {
  const { token, email, password } = req.body || {};
  const inv = checkInviteToken(token);
  if (!inv) return res.status(400).json({ error: "Lien d'invitation invalide ou expiré." });
  try {
    const u = await createUser(email, password, inv.role || "consultation", false); // non confirmé
    const link = `${baseUrl(req)}/api/account/confirm?token=${encodeURIComponent(makeConfirmToken(u.email, Date.now() + CONFIRM_TTL_MS))}`;
    let emailed = false;
    if (msConfigured()) {
      try { await sendMail({ to: u.email, subject: "Confirmez votre accès à cp|WIRE", html: confirmEmailHtml(u.email, link) }); emailed = true; }
      catch (e) { console.error("[claim] envoi e-mail de confirmation échoué:", e.message); }
    }
    if (emailed) {
      return res.json({ pending: true, email: u.email, message: `Compte créé. Un e-mail de confirmation a été envoyé à ${u.email}. Cliquez le lien pour activer votre accès, puis connectez-vous.` });
    }
    console.warn(`[claim] e-mail non configuré — lien de confirmation pour ${u.email} : ${link}`);
    return res.json({ pending: true, email: u.email, message: "Compte créé, en attente de confirmation. L'envoi d'e-mail n'est pas configuré : un administrateur doit valider votre accès." });
  } catch (e) {
    console.error("[POST /api/account/claim]", e && e.message ? e.message : e); res.status(400).json({ error: String(e.message || e) }); }
});

// Lien cliqué dans l'e-mail : confirme l'adresse et affiche une page de retour.
authRouter.get("/account/confirm", async (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  const info = checkConfirmToken(req.query.token);
  if (!info) return res.status(400).send(confirmPageHtml(false));
  try { await setUserConfirmed(info.email); return res.send(confirmPageHtml(true, info.email)); }
  catch (e) { console.error("[confirm]", e.message); return res.status(502).send(confirmPageHtml(false)); }
});

// Battement de cœur (présence). guard met déjà à jour lastSeen pour la session.
authRouter.post("/ping", guard, (_req, res) => res.json({ ok: true }));

// Rôle de la session courante : l'interface s'en sert pour adapter les onglets et masquer les outils CR.
authRouter.get("/session", guard, (req, res) => { res.json({ role: req.role || "owner", me: req.userEmail || ME, persistent: isPersistent() }); });

// Déconnexion : retire la session stockée si présente (comptes invités). Le jeton owner
// étant auto-vérifiable, sa révocation fine viendra avec l'audit ; le client efface le
// jeton dans tous les cas, et un changement de mot de passe invalide tout immédiatement.
authRouter.post("/logout", guard, (req, res) => {
  retirerCookieJeton(res);   // la déconnexion doit aussi effacer le cookie de session
  const t = req.headers["x-access-token"];
  if (t && sessions.has(t)) { sessions.delete(t); saveSessions(); }
  res.json({ ok: true });
});

// Génère un lien d'invitation en lecture seule (réservé à l'owner). hours = durée de validité.
authRouter.post("/invite", guard, writeGuard, (req, res) => {
  const raw = Number(req.body?.hours);
  const hours = Math.min(Math.max(Number.isFinite(raw) ? raw : 24, 1), 720); // 1 h … 30 jours
  const expMs = Date.now() + hours * 3600 * 1000;
  const token = makeGuestToken(expMs);
  res.json({ token, expiresAt: new Date(expMs).toISOString(), hours });
});
