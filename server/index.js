// index.js — serveur CPwire.
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";

import { searchIssues, isConfigured, fetchIssueDescription, fetchIssueActivity, fetchDevWork, fetchChangesSummary, fetchCRA, fetchStatusTransitions } from "./jira.js";
import { loadSnapshot, saveSnapshot } from "./store.js";
import { STATUTS, ME, TARGET_DONE, CATEGORY_LABEL } from "./config.js";
import { DEMO_ISSUES } from "./demo-data.js";
import { findProgram } from "./programmes.js";
import { buildSlaReport, slaStatus } from "./sla.js";
import { buildHygiene } from "./hygiene.js";
import { buildCadence } from "./cadence.js";
import { buildRecapChiffres } from "./recapChiffres.js";
import { readConnaissance, saveConnaissance } from "./connaissance.js";
import { listUsers, createUser, verifyUser, removeUser } from "./users.js";
import { probe as dolibarrProbe, dolibarrStatus } from "./dolibarr.js";
import { crossReferentiel, referentielClients } from "./referentiel.js";
import { buildProjets, projetsWorkbookBuffer, projetsDocHtml, loadAcces } from "./projets.js";
import { recentMailsFor, mailsConfigured } from "./mails.js";
import { dailyReport, writtenDailyReport, writtenDateReport, morningReport, ticketReport, meetingReport, meetingPrep, globalReport, explainTicket, aiAvailable, runAutoLearn } from "./ai.js";
import { addComment, transition } from "./jira-write.js";
import { transcribe, sttAvailable } from "./stt.js";
import { logEvent, read as readHistory } from "./history.js";
import { readDeleted, addDeleted, removeDeleted } from "./devmeta.js";
import { readAll as readDossiers, saveOne as saveDossier } from "./dossiers.js";
import { parseCraXlsx } from "./cra-xlsx.js";
import { sendMail, uploadToSharePoint, msConfigured, spConfigured, spListChildren, spPreviewUrl } from "./microsoft.js";
import { analyzeDocument, applyImport, listImports, getDataset } from "./import.js";

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const PROJECTS = (process.env.PROJECTS || "TEDL,PEM,TDSS,PDFP,TMT,PTAF,TBEL,TBAL,TIMA,PIMA2,TDIA").split(",").map((s) => s.trim()).filter(Boolean);
// Import EXHAUSTIF : tous les tickets des projets, aucun filtre excluant.
const DEFAULT_JQL = process.env.JQL || `project in (${PROJECTS.join(",")}) ORDER BY created ASC`;
const ALLOW_DEMO = process.env.ALLOW_DEMO === "1";

// ---- Authentification ----
const AUTH_EMAIL = process.env.AUTH_EMAIL || "";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "";
const AUTH_ENABLED = Boolean(AUTH_EMAIL && AUTH_PASSWORD);
const sessions = new Map(); // token -> { role, email, lastSeen }
// Secret de signature des liens d'invitation (dérivé du mot de passe : pas de config en plus).
const SIGN_SECRET = AUTH_PASSWORD || "cpwire-invite-secret";

// Routes interdites au rôle « consultation » : aucun récap, aucun CR, aucune réunion.
const CONSULT_FORBIDDEN = [/^\/api\/cr\//, /^\/api\/recap$/, /^\/api\/meeting\//];

// Jeton déterministe (dérivé des identifiants) : il reste valable même après
// un redémarrage de Render, contrairement à l'ancien jeton aléatoire stocké en mémoire.
function expectedToken() {
  return crypto.createHash("sha256").update(`cpwire|${AUTH_EMAIL}|${AUTH_PASSWORD}`).digest("hex");
}

// ---- Invitation lecture seule : jeton "invité" signé, avec expiration ----
// Format : g.<expirationMs>.<signature>  — auto-vérifiable, sans stockage (survit aux redémarrages).
function sign(payload) {
  return crypto.createHmac("sha256", SIGN_SECRET).update(payload).digest("hex");
}
function safeEqual(a, b) {
  try {
    const ba = Buffer.from(a || "", "utf8"), bb = Buffer.from(b || "", "utf8");
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}
function makeGuestToken(expMs) {
  return `g.${expMs}.${sign(`guest|${expMs}`)}`;
}
function checkGuestToken(t) {
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
function makeInviteToken(expMs, role = "consultation") {
  return `i.${expMs}.${role}.${sign(`invite|${expMs}|${role}`)}`;
}
function checkInviteToken(t) {
  if (!t || typeof t !== "string" || !t.startsWith("i.")) return null;
  const parts = t.split(".");
  if (parts.length !== 4) return null;
  const expMs = Number(parts[1]); const role = parts[2];
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;
  if (!safeEqual(parts[3], sign(`invite|${expMs}|${role}`))) return null;
  return { expMs, role };
}

// Détermine le rôle de la requête : "owner" (total), "consultation" (lecture, sans récap/CR) ou "guest".
function guard(req, res, next) {
  if (!AUTH_ENABLED) { req.role = "owner"; req.userEmail = ME; return next(); }
  const t = req.headers["x-access-token"];
  let role = null, email = null;
  if (t && t === expectedToken()) { role = "owner"; email = AUTH_EMAIL; }
  else if (t && sessions.has(t)) { const s = sessions.get(t); role = s.role; email = s.email; s.lastSeen = Date.now(); }
  else if (checkGuestToken(t)) { role = "guest"; }
  if (!role) return res.status(401).json({ error: "Authentification requise." });
  req.role = role; req.userEmail = email;
  // Verrou serveur : le rôle consultation ne peut PAS atteindre un récap/CR/réunion, même en forçant l'URL.
  if (role === "consultation" && CONSULT_FORBIDDEN.some((re) => re.test(req.path))) {
    return res.status(403).json({ error: "Accès non autorisé pour ce rôle." });
  }
  next();
}

// Rôles à droits complets : le propriétaire (owner) et les administrateurs invités (admin).
const isAdmin = (role) => role === "owner" || role === "admin";

// À placer APRÈS guard sur toute route qui modifie des données ou déclenche un envoi :
// seuls l'owner et les admins écrivent. Les rôles consultation/guest sont en lecture seule → 403.
function writeGuard(req, res, next) {
  if (!isAdmin(req.role)) {
    return res.status(403).json({ error: "Action non autorisée : accès en lecture seule." });
  }
  next();
}

// Réservé aux administrateurs (owner ou admin invité = droits complets).
function adminGuard(req, res, next) {
  if (!isAdmin(req.role)) return res.status(403).json({ error: "Réservé à l'administrateur." });
  next();
}

app.use(cors());
app.use(express.json({ limit: "8mb" }));

// Verrou global (ceinture + bretelles) : un consultant ne peut atteindre AUCUN récap/CR/réunion,
// quelle que soit la méthode HTTP, même si une route oubliait le middleware guard.
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next();
  const t = req.headers["x-access-token"];
  const s = t && sessions.has(t) ? sessions.get(t) : null;
  if (s && s.role === "consultation" && CONSULT_FORBIDDEN.some((re) => re.test(req.path))) {
    return res.status(403).json({ error: "Accès non autorisé pour ce rôle." });
  }
  next();
});

// Photo persistante du portefeuille (chargée au démarrage si elle existe).
let snap = loadSnapshot();                                   // { syncedAt, issues }
let snapMap = new Map((snap.issues || []).map((i) => [i.cle, i]));
let importing = false;       // un import complet tourne-t-il en arrière-plan ?
let importError = null;      // dernière erreur d'import (affichée à l'utilisateur)

// Import complet EN ARRIÈRE-PLAN : ne bloque jamais une requête HTTP (évite les coupures
// proxy de Render sur requête longue, et donc le gel de la barre à 92 %).
async function runFullImport() {
  if (importing) return;
  importing = true; importError = null;
  const t0 = Date.now();
  console.log("[import] arrière-plan : démarrage");
  try {
    const issues = await searchIssues(DEFAULT_JQL);
    snapMap = new Map(issues.map((i) => [i.cle, i]));
    snap = { syncedAt: new Date().toISOString(), issues };
    saveSnapshot(snap);
    console.log(`[import] arrière-plan : PRÊT — ${issues.length} tickets en ${Date.now() - t0} ms`);
  } catch (e) {
    importError = String(e.message || e);
    console.error(`[import] arrière-plan : ÉCHEC — ${importError}`);
  } finally {
    importing = false;
  }
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function aggregate(issues, source) {
  const by = (key) => {
    const m = {};
    issues.forEach((i) => {
      const k = i[key];
      m[k] = m[k] || { total: 0, ...Object.fromEntries(STATUTS.map((s) => [s, 0])), enRetard: 0 };
      m[k].total += 1; m[k][i.statut] += 1; if (i.enRetard) m[k].enRetard += 1;
    });
    return m;
  };
  const total = issues.length;
  const termines = issues.filter((i) => i.statut === "Terminé").length;
  const parProjet = {};
  issues.forEach((i) => { parProjet[i.projet] = (parProjet[i.projet] || 0) + 1; });
  // Diagnostic d'import : un projet configuré qui remonte 0 = clé erronée ou accès manquant.
  const manquants = PROJECTS.filter((pk) => !parProjet[pk]);
  return {
    source, generatedAt: new Date().toISOString(), me: ME,
    diagnostic: { configuredProjects: PROJECTS, parProjet, projetsSansTicket: manquants, totalImporte: total },
    kpis: {
      total, "À faire": issues.filter((i) => i.statut === "À faire").length,
      "En cours": issues.filter((i) => i.statut === "En cours").length,
      "Bloqué": issues.filter((i) => i.statut === "Bloqué").length, "Terminé": termines,
      enRetard: issues.filter((i) => i.enRetard).length, mine: issues.filter((i) => i.mine).length,
      avancement: total ? Math.round((termines / total) * 100) : 0,
    },
    parDossier: by("dossier"), issues,
  };
}

// Format de date attendu par JQL : "yyyy/MM/dd HH:mm".
function jqlDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// JQL incrémental : uniquement les tickets modifiés depuis la dernière synchro (avec 5 min de marge).
function incrementalJql(sinceIso) {
  const d = new Date(new Date(sinceIso).getTime() - 5 * 60 * 1000);
  return `project in (${PROJECTS.join(",")}) AND updated >= "${jqlDate(d)}" ORDER BY updated DESC`;
}
// Recalcule "en retard" à la lecture (la date du jour avance même sans mouvement du ticket).
function withLate(issues) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return issues.map((i) => {
    const due = i.echeance ? new Date(i.echeance) : null;
    const enRetard = Boolean(due && due < today && i.statut !== "Terminé");
    return enRetard === i.enRetard ? i : { ...i, enRetard };
  });
}

// Récupère les tickets. Stratégie :
//  - 1er chargement (aucune photo) ou « Tout recharger » -> récupération COMPLÈTE depuis Jira.
//  - lecture simple -> on sert la mémoire (aucun appel réseau).
//  - actualisation -> INCRÉMENTALE : on ne va chercher que ce qui a bougé.
async function getIssues(arg, jqlArg) {
  const opts = (typeof arg === "object" && arg !== null) ? arg : { refresh: Boolean(arg), jql: jqlArg };

  if (isConfigured()) {
    // Requête personnalisée (avancé) : recherche complète sans toucher à la photo.
    if (opts.jql) {
      const issues = await searchIssues(opts.jql);
      return { issues: withLate(issues), source: "Jira (requête)", changed: [] };
    }

    const haveSnap = snapMap.size > 0 && snap.syncedAt;
    if (opts.full || !haveSnap) {
      // Déclenche l'import EN ARRIÈRE-PLAN (réponse immédiate). On ne relance pas à chaque sondage :
      //  - full demandé -> on force (re)l'import ;
      //  - sinon, on ne lance que s'il n'y a ni import en cours ni erreur précédente (sinon on rapporte l'état).
      if (opts.full || (!importing && !importError)) runFullImport();
      return {
        issues: withLate(snap.issues || []),
        source: haveSnap ? "mémoire (réimport en cours)" : (importing ? "import initial en cours" : (importError ? "import en échec" : "import initial")),
        changed: [],
        importing,
        importError,
      };
    }

    if (!opts.refresh) {
      return { issues: withLate(snap.issues), source: "mémoire", changed: [], importing, importError };
    }

    // Actualisation incrémentale.
    console.log(`[getIssues] incrémental depuis ${snap.syncedAt}`);
    const updated = await searchIssues(incrementalJql(snap.syncedAt));
    const changed = [];
    for (const it of updated) {
      const prev = snapMap.get(it.cle);
      if (!prev || prev.maj !== it.maj || prev.statut !== it.statut || prev.categorie !== it.categorie) changed.push(it.cle);
      snapMap.set(it.cle, it);
    }
    snap = { syncedAt: new Date().toISOString(), issues: Array.from(snapMap.values()) };
    saveSnapshot(snap);
    return {
      issues: withLate(snap.issues),
      source: `Jira (incrémental · ${updated.length} vérifié${updated.length > 1 ? "s" : ""})`,
      changed,
      importing,
      importError,
    };
  }

  if (ALLOW_DEMO) return { issues: DEMO_ISSUES.map((i) => ({ ...i, mine: i.assigne === ME, prog: findProgram(i.resume) })), source: "DÉMO (ALLOW_DEMO=1)", changed: [] };
  return null; // ni Jira, ni démo -> écran de configuration
}

// ---- Auth ----
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!AUTH_ENABLED) {
    const t = crypto.randomUUID(); sessions.set(t, { role: "owner", email: ME, lastSeen: Date.now() });
    return res.json({ token: t, me: ME, role: "owner", note: "Auth non configurée côté serveur." });
  }
  if (email === AUTH_EMAIL && password === AUTH_PASSWORD) {
    const t = expectedToken(); sessions.set(t, { role: "owner", email: AUTH_EMAIL, lastSeen: Date.now() });
    return res.json({ token: t, me: ME, role: "owner" });
  }
  try {
    const u = await verifyUser(email, password);
    if (u) {
      const t = crypto.randomUUID(); sessions.set(t, { role: u.role, email: u.email, lastSeen: Date.now() });
      return res.json({ token: t, me: u.email, role: u.role });
    }
  } catch (e) { return res.status(502).json({ error: "Base de comptes indisponible : " + String(e.message || e) }); }
  return res.status(401).json({ error: "Identifiants incorrects." });
});

// Activation d'un compte invité : la personne arrive avec un lien (token) et choisit email + mot de passe.
app.post("/api/account/claim", async (req, res) => {
  const { token, email, password } = req.body || {};
  const inv = checkInviteToken(token);
  if (!inv) return res.status(400).json({ error: "Lien d'invitation invalide ou expiré." });
  try {
    const u = await createUser(email, password, inv.role || "consultation");
    const t = crypto.randomUUID(); sessions.set(t, { role: u.role, email: u.email, lastSeen: Date.now() });
    res.json({ token: t, me: u.email, role: u.role });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Battement de cœur (présence). guard met déjà à jour lastSeen pour la session.
app.post("/api/ping", guard, (_req, res) => res.json({ ok: true }));

// Rôle de la session courante : l'interface s'en sert pour adapter les onglets et masquer les outils CR.
app.get("/api/session", guard, (req, res) => res.json({ role: req.role || "owner", me: req.userEmail || ME }));

// Génère un lien d'invitation en lecture seule (réservé à l'owner). hours = durée de validité.
app.post("/api/invite", guard, writeGuard, (req, res) => {
  const raw = Number(req.body?.hours);
  const hours = Math.min(Math.max(Number.isFinite(raw) ? raw : 24, 1), 720); // 1 h … 30 jours
  const expMs = Date.now() + hours * 3600 * 1000;
  const token = makeGuestToken(expMs);
  res.json({ token, expiresAt: new Date(expMs).toISOString(), hours });
});

// ---- Admin : comptes invités + présence (owner/admin uniquement) ----
// Génère un lien d'invitation à copier. La personne l'ouvre et crée son email + mot de passe.
// Durée : soit `hours`, soit `days`, soit `indefinite` (validité ~1000 ans). Rôle : "consultation"
// (lecture seule, par défaut) ou "admin" (droits complets, comme l'owner).
app.post("/api/admin/invite", guard, adminGuard, (req, res) => {
  const b = req.body || {};
  const role = b.role === "admin" ? "admin" : "consultation";
  let expMs, scope;
  if (b.indefinite) {
    expMs = Date.now() + 1000 * 365 * 86400000; // ~1000 ans = pratiquement « indéfiniment »
    scope = { indefinite: true };
  } else if (Number.isFinite(Number(b.hours))) {
    const hours = Math.min(Math.max(Number(b.hours), 1), 8760); // 1 h … 1 an
    expMs = Date.now() + hours * 3600 * 1000;
    scope = { hours };
  } else {
    const days = Math.min(Math.max(Number.isFinite(Number(b.days)) ? Number(b.days) : 14, 1), 365); // 1 … 365 j
    expMs = Date.now() + days * 86400000;
    scope = { days };
  }
  res.json({ token: makeInviteToken(expMs, role), expiresAt: new Date(expMs).toISOString(), role, ...scope });
});

// Liste des comptes + présence (qui est en ligne / vu pour la dernière fois). Silencieux côté invité.
app.get("/api/admin/users", guard, adminGuard, async (_req, res) => {
  const now = Date.now();
  const seen = {};
  for (const s of sessions.values()) {
    if (s.email && (!seen[s.email] || s.lastSeen > seen[s.email])) seen[s.email] = s.lastSeen;
  }
  try {
    const list = await listUsers();
    const users = list.map((u) => ({
      ...u,
      lastSeen: seen[u.email] || null,
      online: seen[u.email] ? now - seen[u.email] < 75000 : false,
    }));
    res.json({ users });
  } catch (e) { res.status(502).json({ error: "Base de comptes indisponible : " + String(e.message || e) }); }
});

// Révoque un compte invité (et coupe ses sessions en cours).
app.post("/api/admin/users/remove", guard, adminGuard, async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  try { await removeUser(email); } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  for (const [t, s] of sessions) if (s.email === email) sessions.delete(t);
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "CPwire", authEnabled: AUTH_ENABLED, jiraConfigured: isConfigured(),
    ai: aiAvailable(), stt: sttAvailable(), microsoft: msConfigured(), me: ME, projects: PROJECTS, allowDemo: ALLOW_DEMO }));

app.get("/api/portfolio", guard, async (req, res) => {
  try {
    const got = await getIssues({ refresh: req.query.refresh === "1", full: req.query.full === "1", jql: req.query.jql });
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const payload = aggregate(got.issues, got.source);
    payload.inactiveDevs = inactiveDevNames(got.issues, INACTIVE_MONTHS);
    payload.inactiveMonths = INACTIVE_MONTHS;
    payload.changed = got.changed || [];
    payload.syncedAt = snap.syncedAt || null;
    payload.importing = Boolean(got.importing);
    payload.importError = got.importError || null;
    res.json(payload);
    // Mémoire auto-apprenante : en tâche de fond, throttlé, sans bloquer la réponse (ne fait rien sans clé IA).
    if (aiAvailable() && !got.importing) { runAutoLearn(got.issues).catch(() => {}); }
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Retire des tickets les personnes SANS activité depuis N mois (par défaut 2) :
// elles ne doivent plus apparaître comme développeurs nulle part dans l'app.
// L'activité = dernière mise à jour (maj) d'un ticket où la personne intervient,
// calculée sur TOUT le jeu de tickets (donc une personne active ailleurs est conservée).
const INACTIVE_MONTHS = Number(process.env.DEV_INACTIVITY_MONTHS) || 2;
function pruneInactiveDevs(issues, months = INACTIVE_MONTHS) {
  if (!Array.isArray(issues) || !issues.length || months <= 0) return issues;
  const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000; // ~N mois
  const last = new Map(); // personne -> date de dernière activité (ms)
  const bump = (name, t) => { if (!name || name === "Non assigné") return; if (t > (last.get(name) || 0)) last.set(name, t); };
  for (const i of issues) {
    const t = new Date(i.maj || i.resolu || i.cree || 0).getTime();
    if (isNaN(t)) continue;
    bump(i.dev, t); bump(i.assigne, t);
    for (const c of (i.contributors || [])) bump(c, t);
  }
  let any = false; for (const t of last.values()) if (t < cutoff) { any = true; break; }
  if (!any) return issues;
  const stale = (name) => !!name && name !== "Non assigné" && (last.get(name) || 0) < cutoff;
  return issues.map((i) => {
    const dev = stale(i.dev) ? "" : i.dev;
    const assigne = stale(i.assigne) ? "" : i.assigne;
    const contributors = (i.contributors || []).filter((c) => !stale(c));
    if (dev === i.dev && assigne === i.assigne && contributors.length === (i.contributors || []).length) return i;
    return { ...i, dev, assigne, contributors };
  });
}

// Renvoie la LISTE des personnes sans activité depuis N mois (même calcul que le prune),
// mais SANS vider leur nom : on les signale pour les ranger en « Anciens développeurs ».
function inactiveDevNames(issues, months = INACTIVE_MONTHS) {
  if (!Array.isArray(issues) || !issues.length || months <= 0) return [];
  const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000;
  const last = new Map();
  const bump = (name, t) => { if (!name || name === "Non assigné") return; if (t > (last.get(name) || 0)) last.set(name, t); };
  for (const i of issues) {
    const t = new Date(i.maj || i.resolu || i.cree || 0).getTime();
    if (isNaN(t)) continue;
    bump(i.dev, t); bump(i.assigne, t);
    for (const c of (i.contributors || [])) bump(c, t);
  }
  const out = [];
  for (const [name, t] of last.entries()) if (t < cutoff) out.push(name);
  return out;
}

// Exclut les tickets dont le développeur (ou l'assigné) a été supprimé/masqué :
// ces personnes ne doivent plus apparaître dans les récaps ni les comptes rendus.
// On y applique aussi le filtrage des développeurs inactifs (> 2 mois).
function withoutDeletedDevs(issues) {
  const pruned = pruneInactiveDevs(issues);
  const del = new Set(readDeleted());
  if (!del.size) return pruned;
  return pruned.filter((i) => !del.has(i.dev) && !del.has(i.assigne));
}

app.get("/api/recap", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const visible = withoutDeletedDevs(got.issues);
    const useToday = visible.some((i) => isToday(i.maj));
    const todays = useToday ? visible.filter((i) => isToday(i.maj)) : visible;
    const byDossier = {};
    todays.forEach((i) => { (byDossier[i.dossier] ||= []).push(i); });
    res.json({ generatedAt: new Date().toISOString(), basis: useToday ? "aujourd'hui" : "tout l'historique", byDossier });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Récap DU JOUR = mouvements du jour, par dossier — 100 % déterministe (aucune IA).
// On lit les vraies transitions de statut Jira de la journée : qui a fait quoi, où ça a atterri.
app.get("/api/recap/chiffres", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const issues = withoutDeletedDevs(got.issues);
    // Fenêtre = aujourd'hui (00:00 → 24:00, heure locale serveur).
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const startISO = start.toISOString(), endISO = end.toISOString();
    const sT = start.getTime(), eT = end.getTime();
    const inR = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return !isNaN(t) && t >= sT && t < eT; };
    const keys = issues.filter((i) => inR(i.maj) || inR(i.resolu)).map((i) => i.cle);
    const tr = await fetchStatusTransitions(keys, startISO, endISO);
    const html = buildRecapChiffres(issues, tr.items, { dateISO: startISO, capped: tr.capped });
    logEvent("recap_chiffres", "Récap du jour — mouvements (tous dossiers)", { mouvements: (tr.items || []).filter((x) => (x.transitions || []).length).length, scanned: tr.scanned, capped: tr.capped });
    res.json({ generatedAt: new Date().toISOString(), html });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/daily", guard, async (req, res) => {
  try {
    const dossier = req.body.dossier;
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = withoutDeletedDevs(got.issues).filter((i) => i.dossier === dossier);
    // Qui a réellement fait avancer les tickets aujourd'hui (historique Jira).
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const todayKeys = sub.filter((i) => i.maj && new Date(i.maj) >= startToday).map((i) => i.cle);
    const tr = await fetchStatusTransitions(todayKeys, startToday.toISOString(), null);
    const out = await dailyReport(dossier, sub, null, tr.items);
    logEvent("cr_journalier", `CR journalier - ${dossier}`, { dossier, count: sub.length, via: out.generatedBy });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/daily-period", guard, async (req, res) => {
  try {
    const { dossier, startISO, endISO, label } = req.body || {};
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const scope = (!dossier || dossier === "Tous" || dossier === "Tous les clients") ? null : dossier;
    const sub = withoutDeletedDevs(got.issues).filter((i) => !scope || i.dossier === scope);
    // Candidats = tickets modifiés sur la période ; on lit leur historique pour créditer le bon acteur.
    const sT = startISO ? new Date(startISO).getTime() : -Infinity;
    const eT = endISO ? new Date(endISO).getTime() : Infinity;
    const inR = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return !isNaN(t) && t >= sT && t < eT; };
    const keys = sub.filter((i) => inR(i.maj) || inR(i.resolu)).map((i) => i.cle);
    const tr = await fetchStatusTransitions(keys, startISO, endISO);
    const out = await dailyReport(scope || "Tous les clients", sub, { startISO, endISO, label }, tr.items);
    logEvent("cr_journalier", `CR détaillé - ${scope || "Tous"} - ${label || "?"}`, { dossier: scope || "Tous", periode: label, count: sub.length, scanned: tr.scanned, capped: tr.capped, via: out.generatedBy });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Pilotage des engagements (SLA) : respect du GTR par dossier, calculé depuis le snapshot.
app.get("/api/sla", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = withoutDeletedDevs(got.issues);
    res.json(buildSlaReport(sub));
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Contrôle qualité : on lit le snapshot BRUT (pas de filtre devs) pour pouvoir
// justement signaler les tickets encore assignés à un parti.
app.get("/api/hygiene", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    res.json(buildHygiene(got.issues, readDeleted()));
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Rythme/cadence de l'équipe — calculé depuis Jira (déterministe, aucune IA).
app.get("/api/cadence", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const weeks = Math.min(16, Math.max(4, parseInt(req.query.weeks, 10) || 8));
    res.json(buildCadence(withoutDeletedDevs(got.issues), { weeks }));
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Dolibarr (lecture seule) — sonde de découverte : que des noms de champs, aucune valeur client.
app.get("/api/dolibarr/status", guard, (_req, res) => res.json(dolibarrStatus()));
app.get("/api/dolibarr/probe", guard, async (_req, res) => {
  try { res.json(await dolibarrProbe()); }
  catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Référentiel Recette (socle) : Domaine → Option → Programmes → tickets Jira (rapprochement auto).
app.get("/api/referentiel/clients", guard, (_req, res) => res.json({ clients: referentielClients() }));
app.get("/api/projets", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    const data = buildProjets(got ? withoutDeletedDevs(got.issues) : []);
    res.json(data);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});
// Derniers échanges (mails) d'un client — lecture seule, Gmail via variables d'env.
app.get("/api/client/mails", guard, async (req, res) => {
  try {
    const dossier = String(req.query.dossier || "");
    const acces = loadAcces();
    const domaines = (acces[dossier] && acces[dossier].domaines) || [];
    const out = await recentMailsFor(domaines);
    res.json(out);
  } catch (err) { res.json({ configured: mailsConfigured(), mails: [], note: String(err.message || err) }); }
});
app.get("/api/projets/export", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    const buf = await projetsWorkbookBuffer(got ? withoutDeletedDevs(got.issues) : []);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Suivi_de_projets.xlsx"');
    res.send(buf);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});
app.get("/api/projets/doc", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    const html = projetsDocHtml(got ? withoutDeletedDevs(got.issues) : []);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});
app.get("/api/referentiel", guard, async (req, res) => {
  try {
    const client = req.query.client || (referentielClients()[0] || "");
    if (!client) return res.json({ client: "", domaines: [], nbOptions: 0, nbProgrammes: 0 });
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const data = crossReferentiel(got.issues, client);
    if (!data) return res.status(404).json({ error: `Aucun référentiel pour « ${client} ».` });
    res.json(data);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/written", guard, async (req, res) => {
  try {
    const dossier = req.body.dossier;
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = withoutDeletedDevs(got.issues).filter((i) => i.dossier === dossier);
    const out = await writtenDailyReport(dossier, sub);
    logEvent("cr_ecrit", `CR écrit - ${dossier}`, { dossier, count: sub.length, via: out.generatedBy });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/date", guard, async (req, res) => {
  try {
    const { dossier, dateISO, startISO, endISO, label } = req.body || {};
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const visible = withoutDeletedDevs(got.issues);
    const range = (startISO || endISO || label) ? { startISO, endISO, label } : dateISO; // plage, sinon compat jour unique
    const out = await writtenDateReport(dossier, range, visible);
    logEvent("cr_date", `CR rédigé - ${dossier || "Tous"} - ${label || dateISO || "?"}`, { dossier: dossier || "Tous", periode: label || dateISO, via: out.generatedBy });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/morning", guard, async (req, res) => {
  try {
    const dossier = req.body.dossier;
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = dossier && dossier !== "Tous" ? got.issues.filter((i) => i.dossier === dossier) : got.issues;
    // Ensemble des contacts côté CLIENT (pour ne garder que les gens d'Armonie dans le brief).
    const clientNames = new Set();
    try {
      for (const d of readDossiers()) {
        for (const m of (d.team || [])) {
          if (m && m.cote === "Client" && m.nom) clientNames.add(m.nom.trim().toLowerCase());
        }
      }
    } catch {}
    const out = await morningReport(dossier || "Tous les clients", sub, clientNames);
    logEvent("brief_matin", `Brief matinal - ${dossier || "tous"}`, { dossier: dossier || "Tous", count: sub.length });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Cache des explications (clé + date de maj) pour ne pas régénérer/repayer inutilement.
const explainCache = new Map();

// Explication SIMPLE d'un ticket, pour non-technique.
app.post("/api/ticket/explain", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    const t = (got?.issues || []).find((i) => i.cle === req.body.cle);
    if (!t) return res.status(404).json({ error: "Ticket introuvable." });
    const cacheKey = `${t.cle}@${t.maj}`;
    if (explainCache.has(cacheKey)) return res.json({ explication: explainCache.get(cacheKey), cached: true });
    // La description n'est plus chargée en masse : on va la chercher pour CE ticket.
    let ticket = t;
    if (isConfigured() && !t.descriptionText) {
      const desc = await fetchIssueDescription(t.cle);
      if (desc) ticket = { ...t, descriptionText: desc };
    }
    const explication = await explainTicket(ticket);
    explainCache.set(cacheKey, explication);
    res.json({ explication, cached: false });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Historique (qui a fait quoi, quand) + heures saisies (worklogs) d'un ticket — à la demande.
app.post("/api/ticket/activity", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, timeline: [], worklogs: [], totalTime: "0h" });
    const out = await fetchIssueActivity(req.body.cle);
    res.json({ configured: true, ...out });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/dev/work", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, items: [] });
    const { dev, keys } = req.body || {};
    const out = await fetchDevWork(dev, Array.isArray(keys) ? keys : []);
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/changes/summary", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, items: [] });
    const { keys } = req.body || {};
    const out = await fetchChangesSummary(Array.isArray(keys) ? keys : []);
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// CRA — Compte rendu d'activité : temps saisis consolidés par projet et par personne sur une période.
app.post("/api/cra", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, byPerson: [], byProject: [], totalSeconds: 0, totalTime: "0h" });
    const { start, end } = req.body || {};
    const out = await fetchCRA({ start, end });
    res.json({ configured: true, ...out });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// CRA depuis un fichier Excel/CSV importé (sans Jira). Renvoie la même structure que /api/cra.
app.post("/api/cra/import", guard, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    const basis = Number(req.body?.basis) || 7;
    const out = parseCraXlsx(req.file.buffer, { basis });
    logEvent("cra_import", "CRA importé depuis Excel", { lignes: out.scanned, fichier: req.file.originalname });
    res.json(out);
  } catch (err) { res.status(400).json({ error: String(err.message || err) }); }
});

// ----- Import de documents : analyse IA (proposition) puis validation -----
app.post("/api/import/analyze", guard, writeGuard, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    const out = await analyzeDocument({ filename: req.file.originalname, buffer: req.file.buffer });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/import/apply", guard, writeGuard, async (req, res) => {
  try {
    const { filename, proposal, apercu, dataset } = req.body || {};
    if (!proposal) return res.status(400).json({ error: "Proposition manquante." });
    const entry = applyImport({ filename, proposal, apercu, dataset, by: req.userEmail });
    try { logEvent("import_applique", `Import validé : ${filename || "document"}`, { type: proposal.type, client: proposal.client }); } catch (e) { /* journal best-effort */ }
    res.json({ ok: true, entry });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/import/history", guard, (_req, res) => res.json({ items: listImports() }));
app.get("/api/import/dataset/:name", guard, (req, res) => res.json(getDataset(req.params.name) || { rows: [] }));


// Rapport global : tous les clients, organisé par client.
app.post("/api/cr/global", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const byDossier = {};
    withoutDeletedDevs(got.issues).forEach((i) => { (byDossier[i.dossier] ||= []).push(i); });
    const out = await globalReport(byDossier);
    logEvent("cr_global", "Rapport journalier global", { clients: Object.keys(byDossier).length });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/ticket/report", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    const t = (got?.issues || []).find((i) => i.cle === req.body.cle) || { cle: req.body.cle, resume: req.body.resume || "" };
    const text = await ticketReport(t, req.body.note);
    res.json({ text });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/ticket/push", guard, writeGuard, async (req, res) => {
  try {
    const { cle, comment, markDone } = req.body;
    if (!isConfigured()) return res.status(409).json({ error: "Jira non configuré : impossible d'écrire dans le ticket." });
    const result = {};
    if (comment) result.comment = await addComment(cle, comment);
    if (markDone) result.transition = await transition(cle, TARGET_DONE);
    logEvent("ticket_push", `Mise a jour Jira - ${cle}`, { cle, markDone: !!markDone });
    res.json({ ok: true, ...result });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/transcribe", guard, writeGuard, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier audio." });
    res.json({ text: await transcribe(req.file.buffer, req.file.originalname, req.file.mimetype) });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// Construit le bloc de CHIFFRES VÉRIFIÉS (par dossier × catégorie) depuis les mêmes
// issues que le pilotage de bout en bout. Sert de source de vérité au CR généré par l'IA.
function buildJiraFacts(issues, focusDossier) {
  if (!Array.isArray(issues) || !issues.length) return "";
  const order = Object.keys(CATEGORY_LABEL);
  const byD = {};
  for (const i of issues) {
    const d = i.dossier || "Autre";
    (byD[d] ||= { total: 0, cats: {} });
    byD[d].total += 1;
    byD[d].cats[i.categorie] = (byD[d].cats[i.categorie] || 0) + 1;
  }
  let names = Object.keys(byD).sort();
  if (focusDossier && byD[focusDossier]) names = [focusDossier, ...names.filter((n) => n !== focusDossier)];
  const line = (d) => {
    const r = byD[d];
    const parts = order.filter((k) => r.cats[k]).map((k) => `${CATEGORY_LABEL[k]} ${r.cats[k]}`);
    return `• ${d} — total ${r.total} : ${parts.join(", ") || "aucun ticket"}`;
  };
  return names.map(line).join("\n");
}

app.post("/api/meeting/report", guard, writeGuard, upload.fields([{ name: "audio", maxCount: 1 }, { name: "images", maxCount: 8 }]), async (req, res) => {
  try {
    const { titre, participants, notes, equipe, consigne, dossier } = req.body;
    let transcript = req.body.transcript || "";
    const audio = req.files?.audio?.[0];
    if (audio && !transcript && sttAvailable()) transcript = await transcribe(audio.buffer, audio.originalname, audio.mimetype);
    const images = (req.files?.images || []).map((f) => ({ media_type: f.mimetype, dataBase64: f.buffer.toString("base64") }));
    // Chiffres VÉRIFIÉS depuis Jira (mêmes données que le pilotage de bout en bout) → source de vérité de l'IA.
    let jiraFacts = "";
    try {
      const got = await getIssues(false);
      if (got) jiraFacts = buildJiraFacts(withoutDeletedDevs(got.issues), dossier);
    } catch { /* pas de Jira → on rédige sans bloc chiffres */ }
    const out = await meetingReport({ titre, participants, notes, transcript, images, equipe, consigne, jiraFacts });
    logEvent("cr_reunion", `CR reunion - ${titre || "sans titre"}`, { via: out.generatedBy, images: images.length, audio: !!audio, consigne: !!(consigne && consigne.trim()) });
    res.json({ ...out, transcript });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

// ---- Fiches dossiers (éditables) ----
app.post("/api/meeting/prep", guard, async (req, res) => {
  try {
    const { dossier, sujet, type, notes, importedText } = req.body || {};
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = dossier && dossier !== "Tous" ? got.issues.filter((i) => i.dossier === dossier) : got.issues;
    const clientNames = new Set();
    try {
      for (const d of readDossiers()) {
        for (const m of (d.team || [])) {
          if (m && m.cote === "Client" && m.nom) clientNames.add(m.nom.trim().toLowerCase());
        }
      }
    } catch {}
    const out = await meetingPrep({ dossier: dossier || "Tous les clients", sujet, type, notes, importedText, issues: sub, clientNames });
    logEvent("prep_reunion", `Préparation réunion - ${dossier || "tous"}${sujet ? " · " + sujet : ""}`, { dossier: dossier || "Tous", sujet: sujet || type || "" });
    res.json(out);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/dossiers", guard, (_req, res) => res.json({ dossiers: readDossiers() }));
app.put("/api/dossiers/:nom", guard, writeGuard, (req, res) => {
  try {
    const saved = saveDossier(req.params.nom, req.body || {});
    logEvent("fiche_dossier", `Fiche mise à jour - ${req.params.nom}`, {});
    res.json({ ok: true, fiche: saved });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// Mémoire d'équipe (connaissance) — lue par l'IA à chaque rapport.
app.get("/api/connaissance", guard, (_req, res) => res.json(readConnaissance()));
// Déclenchement manuel de l'apprentissage IA (owner). Force l'analyse de tous les clients.
app.post("/api/connaissance/learn", guard, writeGuard, async (_req, res) => {
  try {
    if (!aiAvailable()) return res.status(409).json({ error: "Aucune clé IA configurée : l'apprentissage automatique nécessite une IA (Qwen, Mistral ou Anthropic)." });
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const r = await runAutoLearn(got.issues, { force: true });
    res.json({ ok: true, learned: r.learned, connaissance: readConnaissance() });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});
app.put("/api/connaissance", guard, writeGuard, (req, res) => {
  try {
    const k = saveConnaissance(req.body || {});
    logEvent("connaissance", "Mémoire d'équipe mise à jour", {});
    res.json({ ok: true, connaissance: k });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// ---- Partage Microsoft 365 (optionnel, nécessite app Azure) ----
app.post("/api/share/mail", guard, writeGuard, async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    const r = await sendMail({ to, subject, html });
    logEvent("partage_mail", `E-mail Outlook envoyé`, { to });
    res.json(r);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/share/sharepoint", guard, writeGuard, async (req, res) => {  try {
    const { folderPath, filename, html } = req.body;
    const r = await uploadToSharePoint({ folderPath, filename, html });
    logEvent("partage_sharepoint", `Rapport déposé sur SharePoint`, { folderPath, filename });
    res.json(r);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/history", guard, (_req, res) => res.json({ events: readHistory() }));

// ---- Explorateur SharePoint (lecture en direct des fichiers, dont les Excel des devs) ----
// Nécessite MS_* + SP_SITE_ID (app Azure, permission Sites.Read.All / Sites.ReadWrite.All).
app.get("/api/sharepoint/list", guard, async (req, res) => {
  try {
    if (!spConfigured()) return res.status(409).json({ error: "SharePoint non configuré : variables MS_* et SP_SITE_ID à renseigner.", needsConfig: true });
    const items = await spListChildren(req.query.path || "");
    res.json({ path: req.query.path || "", items });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});
app.post("/api/sharepoint/preview", guard, async (req, res) => {
  try {
    if (!spConfigured()) return res.status(409).json({ error: "SharePoint non configuré.", needsConfig: true });
    const url = await spPreviewUrl((req.body || {}).id);
    res.json({ url });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});
app.get("/api/sharepoint/status", guard, (_req, res) => res.json({ configured: spConfigured() }));


// Fiches développeur supprimées (soft-delete : on masque, on ne perd rien).
app.get("/api/devs/deleted", guard, (_req, res) => res.json({ deleted: readDeleted() }));
app.post("/api/devs/delete", guard, writeGuard, (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nom manquant." });
  const deleted = addDeleted(name);
  logEvent("dev_delete", `Fiche développeur masquée : ${name}`);
  res.json({ deleted });
});
app.post("/api/devs/restore", guard, writeGuard, (req, res) => {
  const name = (req.body?.name || "").trim();
  const deleted = removeDeleted(name);
  logEvent("dev_restore", `Fiche développeur restaurée : ${name}`);
  res.json({ deleted });
});

// ---- Sert l'interface (build) en production : un seul service à déployer ----
const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST || path.join(__dirname2, "../web/dist");
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
  console.log(`Interface servie depuis ${WEB_DIST}`);
}

app.listen(PORT, () => {
  console.log(`CPwire API sur http://localhost:${PORT}`);
  console.log(`Auth: ${AUTH_ENABLED ? "oui" : "non"} | Jira: ${isConfigured() ? "oui" : (ALLOW_DEMO ? "démo" : "non configuré")} | IA: ${aiAvailable() ? "oui" : "gabarit"} | moi: ${ME}`);
});
