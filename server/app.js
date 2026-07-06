// index.js — serveur CPwire.
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import os from "os";
import "dotenv/config";

import { searchIssues, isConfigured, fetchIssueDescription, fetchIssueActivity, fetchDevWork, fetchChangesSummary, fetchCRA, fetchStatusTransitions, fetchBlockerSince } from "./jira.js";
import { loadSnapshot, saveSnapshot } from "./store.js";
import { dataDirInfo, dataDir } from "./paths.js";
import shareflyRouter, { resync as resyncSharefly } from "./sharefly.js";
import { recordDeliverable } from "./deliverables.js";
import { persistenceActive, saveBlob, restoreBlob } from "./persist.js";
import { initMemory } from "./connaissance.js";
const isPersistent = () => dataDirInfo().persistent || persistenceActive();
import { recordDay as recordPointDay, recordMonth as recordPointMonth, baselineFor as pointBaselineFor, deriveFromPointHistory } from "./pointHistory.js";
import { STATUTS, ME, TARGET_DONE, CATEGORY_LABEL, categoryFromStatus } from "./config.js";
import { DEMO_ISSUES } from "./demo-data.js";
import { findProgram } from "./programmes.js";
import { buildSlaReport, slaStatus } from "./sla.js";
import { buildHygiene } from "./hygiene.js";
import { buildCadence } from "./cadence.js";
import { buildRecapChiffres } from "./recapChiffres.js";
import { readConnaissance, saveConnaissance, addNote, forgetLearned } from "./connaissance.js";
import { probe as dolibarrProbe, dolibarrStatus } from "./dolibarr.js";
import { crossReferentiel, referentielClients } from "./referentiel.js";
import { buildProjets, projetsWorkbookBuffer, projetsDocHtml, loadAcces } from "./projets.js";
import { recentMailsFor, mailsConfigured } from "./mails.js";
import { dailyReport, writtenDailyReport, writtenDateReport, morningReport, ticketReport, meetingReport, meetingPrep, globalReport, explainTicket, aiAvailable, runAutoLearn } from "./ai.js";
import { assistantAnswer, analyzeFile } from "./assistant.js";
import { addComment, transition, listTransitions } from "./jira-write.js";
import { transcribe, sttAvailable } from "./stt.js";
import { logEvent, read as readHistory } from "./history.js";
import { readDeleted, addDeleted, removeDeleted } from "./devmeta.js";
import { readAll as readDossiers, saveOne as saveDossier } from "./dossiers.js";
import { buildDeadlineRadar } from "./deadlines.js";
import { buildProjections } from "./projections.js";
import { buildCoherence } from "./coherence.js";
import { computeSignals, recordSignals, readSignals, signalsStats, signalsSummary } from "./signals.js";
import { buildDigest, digestText, digestHtml } from "./digest.js";
import { buildRiskScores } from "./risk.js";
import { buildCharge } from "./charge.js";
import { buildDossierCrHtml } from "./crArmonie.js";
import { buildQuotes } from "./quotes.js";
import { analyticsRouter } from "./routes/analytics.js";
import { parseCraXlsx } from "./cra-xlsx.js";
import { sendMail, uploadToSharePoint, msConfigured, spConfigured, spListChildren, spPreviewUrl, spListItems, spListInfo } from "./microsoft.js";
import { analyzeDocument, applyImport, listImports, getDataset, bufferToText, initImports } from "./import.js";

// Durcissement : bloque toute pollution de prototype (Object.prototype.__proto__ = ...),
// la classe de vulnérabilité visée par le CVE xlsx (GHSA-4r6h-8v6p-xvw6) tant que le
// dépôt npm n'héberge pas la version corrigée (cf. server/package.json). Protège aussi
// contre toute pollution future via n'importe quelle autre dépendance qui parserait du
// contenu non maîtrisé. Une tentative lève désormais une TypeError propre, rattrapée par
// le filet de sécurité global plus bas, au lieu de réussir silencieusement.
Object.freeze(Object.prototype);

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const PROJECTS = (process.env.PROJECTS || "TEDL,PEM,TDSS,PDFP,TMT,PTAF,TBEL,TBAL,TIMA,PIMA2,TDIA").split(",").map((s) => s.trim()).filter(Boolean);
// Import EXHAUSTIF : tous les tickets des projets, aucun filtre excluant.
const DEFAULT_JQL = process.env.JQL || `project in (${PROJECTS.join(",")}) ORDER BY created ASC`;
const ALLOW_DEMO = process.env.ALLOW_DEMO === "1";

// ---- Authentification : voir auth-core.js (jetons, sessions persistées, guards) ----
import { AUTH_ENABLED, sessions, initSessions, CONSULT_FORBIDDEN, guard, writeGuard } from "./auth-core.js";

// Derrière le proxy Render : faire confiance au premier saut pour obtenir la vraie IP cliente
// (nécessaire au plafond de tentatives de connexion ci-dessous).
app.set("trust proxy", 1);

// CORS restreint par liste blanche (env ALLOWED_ORIGINS = origines séparées par des virgules).
// Non configuré -> permissif (aucune régression). Le front étant servi par CE service, les appels
// sont en général same-origin ; la liste blanche durcit le cas où un autre domaine appellerait l'API.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                  // same-origin, curl, sondes de santé
    if (!ALLOWED_ORIGINS.length) return cb(null, true);  // liste vide -> permissif (pas de régression)
    return cb(null, ALLOWED_ORIGINS.includes(origin));
  },
}));

// En-têtes de sécurité (équivalent minimal de helmet, sans dépendance) : anti-sniffing MIME,
// anti-clickjacking, pas de fuite de referer, capacités navigateur réduites (micro autorisé en same-origin
// car l'app enregistre l'audio des réunions).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // SAMEORIGIN (et non DENY) : cp|WIRE encadre ses propres pages en iframe
  // (ShareFly, GANTT Bellion) en même origine ; le framing cross-origin reste bloqué.
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(self)");
  next();
});

// Plafond de tentatives (anti-acharnement) : en mémoire, par IP. Réinitialisé au redémarrage,
// ce qui suffit à casser le brute-force d'un mot de passe sans dépendance externe.
import { rateLimiter } from "./limits.js";
// Routes IA (CR rédigés, assistant, ticket/réunion, transcription, import) : coûtent de
// vrais crédits sur les fournisseurs configurés (Anthropic/OpenAI/Mistral/Groq/Qwen).
// Généreux pour un usage normal (plusieurs dizaines de CR/jour en période chargée),
// mais bloque vite une boucle qui s'emballerait.
const aiLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 40, message: "Trop d'appels IA en peu de temps. Réessayez dans quelques minutes." });
// Mise à jour de l'apprentissage global : UNE requête boucle déjà sur TOUS les clients
// (un appel IA par dossier) — donc plafond bien plus bas que les autres routes IA.
const learnLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 6, message: "Apprentissage déjà relancé récemment. Patientez quelques minutes avant de recommencer." });
// Exports PDF/portefeuille : coût CPU serveur (WeasyPrint/Chromium), pas de coût IA,
// donc plafond plus large — sert surtout à éviter un export-spam accidentel.
const exportLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 60, message: "Trop d'exports en peu de temps. Réessayez dans quelques minutes." });

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
// Démarrage à chaud : si une photo du portefeuille existe déjà sur disque, on amorce
// l'historique du jour pour le « point du soir » (la baseline se constitue même si
// aucune actualisation n'a lieu aujourd'hui).
if (snap.issues && snap.issues.length) { try { recordPointDay(snap.issues); recordPointMonth(snap.issues); } catch { /* best-effort */ } }
// Journal de signaux (boucle d'apprentissage) : dérive les signaux du jour à partir de
// faits déjà calculés (régressions/SLA/stagnation/divergences) et les archive. Best-effort.
function recordSignalsBest(issues) {
  try {
    if (!Array.isArray(issues) || !issues.length) return;
    const pointDerived = deriveFromPointHistory();
    const slaReport = buildSlaReport(issues);
    const radar = buildDeadlineRadar(readDossiers(), readConnaissance());
    recordSignals(computeSignals({ issues, slaReport, radar, pointDerived }));
  } catch { /* best-effort */ }
}
if (snap.issues && snap.issues.length) { try { recordSignalsBest(snap.issues); } catch { /* best-effort */ } }
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
    recordPointDay(snap.issues); recordPointMonth(snap.issues); // instantané daté (jour + cumul mensuel)
    recordSignalsBest(snap.issues); // + archivage des signaux du jour
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
    recordPointDay(snap.issues); recordPointMonth(snap.issues); // instantané daté (jour + cumul mensuel)
    recordSignalsBest(snap.issues); // + archivage des signaux du jour
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

// ---- Auth + Admin : voir routes/auth.js et routes/admin.js ----
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
app.use("/api", authRouter);
app.use("/api", adminRouter);

// Points bloquants : date EXACTE d'entrée dans l'état bloquant (transition de statut / pose du
// drapeau), lue dans le changelog. Bornée + mise en cache → appelée à l'ouverture du voyant.
app.post("/api/blockers/since", guard, async (req, res) => {
  try {
    const tickets = Array.isArray(req.body?.tickets) ? req.body.tickets : [];
    const since = await fetchBlockerSince(tickets);
    res.json({ since });
  } catch (err) {
    console.error("[POST /api/blockers/since]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "CPwire", authEnabled: AUTH_ENABLED, jiraConfigured: isConfigured(),
    ai: aiAvailable(), stt: sttAvailable(), microsoft: msConfigured(), allowDemo: ALLOW_DEMO,
    persistent: isPersistent(), dataDir: dataDirInfo().dir }));

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
    // Mémoire auto-apprenante : en tâche de fond, throttlé, sans bloquer la réponse.
    // Tourne TOUJOURS — avec IA si une clé est configurée, sinon en extraction déterministe.
    if (!got.importing) { runAutoLearn(got.issues).catch(() => {}); }
  } catch (err) {
    console.error("[GET /api/portfolio]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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
  } catch (err) {
    console.error("[GET /api/recap]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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
  } catch (err) {
    console.error("[GET /api/recap/chiffres]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Flux d'activité du jour — MOUVEMENTS RÉELS (transitions de statut Jira) + apparitions.
// Même fenêtre (aujourd'hui 00:00→24:00) et même source (changelog) que le récap, mais renvoie
// des ÉVÉNEMENTS horodatés BRUTS (pas d'HTML) pour un flux vivant côté client.
// Règle sacrée : zéro invention. from/to/who/at viennent du changelog ; apparition = date de création réelle.
app.get("/api/activite", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const issues = withoutDeletedDevs(got.issues);
    const now = new Date();
    // Déclencheur auto (Lot 3) : comptages Jira RÉELS par dossier -> ShareFly.
    try {
      const jc = {};
      for (const i of issues) {
        const d = i.dossier; if (!d || d === "Autre") continue;
        if (i.categorie === "annule") continue;
        const r = (jc[d] ||= { total: 0, open: 0 });
        r.total++;
        if (i.categorie !== "termine" && i.categorie !== "miseEnProd") r.open++;
      }
      resyncSharefly({ jira: jc });
    } catch (e) { console.error("[sharefly] comptages activite:", e && e.message); }
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const startISO = start.toISOString(), endISO = end.toISOString();
    const sT = start.getTime(), eT = end.getTime();
    const inR = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return !isNaN(t) && t >= sT && t < eT; };
    const byKey = {}; for (const i of issues) byKey[i.cle] = i;
    const devOf = (i) => (i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne && i.assigne !== "Non assigné" ? i.assigne : ""));

    // Rang de progression d'une catégorie (plus haut = plus avancé) → détection de régression (retour en arrière).
    const CAT_RANK = { afaire: 0, encours: 1, retourTest: 1, retourProd: 1, attenteClient: 2, recetteArmonie: 2, recetteClient: 3, miseEnProd: 4, termine: 5, annule: 9 };
    const isReg = (fc, tc) => {
      if (!fc || !tc || fc === "annule" || tc === "annule") return false;
      const a = CAT_RANK[fc], b = CAT_RANK[tc];
      return (a != null && b != null && b < a);
    };

    // 1) Transitions de statut réelles du jour (changelog), plafonnées (cap interne à fetchStatusTransitions).
    const movers = issues.filter((i) => inR(i.maj) || inR(i.resolu)).map((i) => i.cle);
    const tr = await fetchStatusTransitions(movers, startISO, endISO);
    const events = [];
    for (const it of (tr.items || [])) {
      const iss = byKey[it.cle] || {};
      for (const t of (it.transitions || [])) {
        const fromCat = t.from ? categoryFromStatus(t.from) : "";
        const toCat = t.to ? categoryFromStatus(t.to) : "";
        events.push({
          kind: "transition", cle: it.cle,
          dossier: iss.dossier || "Autre", resume: iss.resume || "", statut: iss.statut || "",
          from: t.from || "", to: t.to || "", fromCat, toCat, regression: isReg(fromCat, toCat),
          who: (t.who && t.who !== "—") ? t.who : "", dev: devOf(iss),
          at: t.date || null,
        });
      }
    }
    // 2) Apparitions : tickets créés aujourd'hui (donnée réelle : date de création).
    for (const i of issues) {
      if (inR(i.cree)) {
        events.push({
          kind: "creation", cle: i.cle,
          dossier: i.dossier || "Autre", resume: i.resume || "", statut: i.statut || "",
          from: "", to: "", fromCat: "", toCat: "", regression: false, who: "", dev: devOf(i),
          at: i.cree || null,
        });
      }
    }
    // Tri chronologique décroissant (le plus récent en tête).
    events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

    // 3) Traîne des jours précédents (au jour) + pouls par client, dérivés des relevés quotidiens (0 appel Jira).
    let history = { days: [], pulse: {} };
    try {
      const der = deriveFromPointHistory(14);
      der.days = (der.days || []).map((d) => ({
        ...d,
        movements: (d.movements || []).map((m) => ({
          ...m,
          resume: (byKey[m.cle] && byKey[m.cle].resume) || "",
          regression: isReg(m.fromCat, m.toCat),
        })),
      }));
      history = der;
    } catch (e) { console.error("[activite] traîne pointHistory:", e && e.message); }

    res.json({
      generatedAt: new Date().toISOString(), dateISO: startISO,
      capped: !!tr.capped, scanned: tr.scanned || 0, total: tr.total || movers.length,
      count: events.length, events,
      history: history.days, pulse: history.pulse,
    });
  } catch (err) {
    console.error("[GET /api/activite]", err && err.message ? err.message : err);
    res.status(502).json({ error: String(err.message || err) });
  }
});

// Baseline du « point du soir » : dernier relevé d'un jour ANTÉRIEUR pour (dossier, scope),
// servie depuis l'historique serveur (partagé/persistant). Renvoie { baseline:{date,cats}|null }.
// Aucun calcul Jira ici : lecture pure de l'historique déjà enregistré au fil des synchros.
app.get("/api/point/baseline", guard, (req, res) => {
  try {
    const dossier = String(req.query.dossier || "").trim();
    const scope = String(req.query.scope || "").trim(); // "" = tout ; "::PREFIXE" = un projet
    if (!dossier) return res.status(400).json({ error: "Paramètre 'dossier' manquant." });
    res.json({ baseline: pointBaselineFor(dossier, scope) });
  } catch (err) {
    console.error("[GET /api/point/baseline]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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
    try { if (dossier && !/^tous/i.test(dossier) && out && out.html) { recordDeliverable({ client: dossier, type: "CR journalier", title: `CR journalier — ${dossier} — ${new Date().toLocaleDateString("fr-FR")}`, html: out.html, ext: "html" }); resyncSharefly(); } } catch (e) { console.error("[sharefly] record cr/daily:", e && e.message); }
    res.json(out);
  } catch (err) {
    console.error("[POST /api/cr/daily]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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
  } catch (err) {
    console.error("[POST /api/cr/daily-period]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Pilotage des engagements (SLA) : respect du GTR par dossier, calculé depuis le snapshot.
app.get("/api/sla", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = withoutDeletedDevs(got.issues);
    res.json(buildSlaReport(sub));
  } catch (err) {
    console.error("[GET /api/sla]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Contrôle qualité : on lit le snapshot BRUT (pas de filtre devs) pour pouvoir
// justement signaler les tickets encore assignés à un parti.
app.get("/api/hygiene", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    res.json(buildHygiene(got.issues, readDeleted()));
  } catch (err) {
    console.error("[GET /api/hygiene]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Rythme/cadence de l'équipe — calculé depuis Jira (déterministe, aucune IA).
app.get("/api/cadence", guard, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const weeks = Math.min(16, Math.max(4, parseInt(req.query.weeks, 10) || 8));
    res.json(buildCadence(withoutDeletedDevs(got.issues), { weeks }));
  } catch (err) {
    console.error("[GET /api/cadence]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Dolibarr (lecture seule) — sonde de découverte : que des noms de champs, aucune valeur client.
app.get("/api/dolibarr/status", guard, (_req, res) => res.json(dolibarrStatus()));
app.get("/api/dolibarr/probe", guard, async (_req, res) => {
  try { res.json(await dolibarrProbe()); }
  catch (err) {
    console.error("[GET /api/dolibarr/probe]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Référentiel Recette (socle) : Domaine → Option → Programmes → tickets Jira (rapprochement auto).
app.get("/api/referentiel/clients", guard, (_req, res) => res.json({ clients: referentielClients() }));
app.get("/api/projets", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    const data = buildProjets(got ? withoutDeletedDevs(got.issues) : []);
    res.json(data);
  } catch (err) {
    console.error("[GET /api/projets]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});
// Derniers échanges (mails) d'un client — lecture seule, Gmail via variables d'env.
app.get("/api/client/mails", guard, async (req, res) => {
  try {
    const dossier = String(req.query.dossier || "");
    const acces = loadAcces();
    const domaines = (acces[dossier] && acces[dossier].domaines) || [];
    const out = await recentMailsFor(domaines);
    res.json(out);
  } catch (err) {
    console.error("[GET /api/client/mails]", err && err.message ? err.message : err); res.json({ configured: mailsConfigured(), mails: [], note: String(err.message || err) }); }
});
app.get("/api/projets/export", guard, exportLimiter, async (_req, res) => {
  try {
    const got = await getIssues(false);
    const buf = await projetsWorkbookBuffer(got ? withoutDeletedDevs(got.issues) : []);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Suivi_de_projets.xlsx"');
    res.send(buf);
  } catch (err) {
    console.error("[GET /api/projets/export]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Rendu PDF SERVEUR à la charte exacte (WeasyPrint). Le client envoie les données
// déjà préparées ({meta, clients}) ; on les passe à render.py qui produit le PDF.
// Donne le rendu 1:1 du document de référence (couverture pleine, pied numéroté n/total).
app.post("/api/export/pdf", guard, exportLimiter, async (req, res) => {
  try {
    const { kind = "blockers", data, filename } = req.body || {};
    if (!data || typeof data !== "object") return res.status(400).json({ error: "Données manquantes." });
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = path.join(here, "pdf", "render.py");
    const out = path.join(os.tmpdir(), `cpwire_${kind}_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    const py = spawn(process.env.PYTHON_BIN || "python3", [script, out], { stdio: ["pipe", "ignore", "pipe"] });
    const errs = [];
    py.stderr.on("data", (d) => errs.push(d));
    py.on("error", (e) => { try { res.status(500).json({ error: "Moteur PDF indisponible : " + (e.message || e) }); } catch {} });
    py.on("close", async (code) => {
      try {
        const fs = await import("fs");
        if (code !== 0 || !fs.existsSync(out)) {
          return res.status(500).json({ error: "Rendu PDF échoué. " + Buffer.concat(errs).toString().slice(0, 400) });
        }
        const pdf = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${(filename || "Points-bloquants.pdf").replace(/[^\w.-]+/g, "_")}"`);
        res.send(pdf);
      } catch (e) {
        console.error("[POST /api/export/pdf]", e && e.message ? e.message : e); try { res.status(502).json({ error: String(e.message || e) }); } catch {} }
    });
    py.stdin.write(JSON.stringify(data));
    py.stdin.end();
  } catch (err) {
    console.error("[POST /api/export/pdf]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});
// Rendu PDF générique : reçoit un HTML autonome, renvoie un PDF téléchargeable
// (remplace l'ouverture de la boîte d'impression pour les récaps, CR, etc.).
app.post("/api/pdf/render", guard, exportLimiter, async (req, res) => {
  try {
    const { html, filename } = req.body || {};
    if (!html || typeof html !== "string") return res.status(400).json({ error: "HTML manquant." });
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = path.join(here, "pdf", "html2pdf.py");
    const out = path.join(os.tmpdir(), `cpwire_html_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    const py = spawn(process.env.PYTHON_BIN || "python3", [script, out], { stdio: ["pipe", "ignore", "pipe"] });
    const errs = [];
    py.stderr.on("data", (d) => errs.push(d));
    py.on("error", (e) => { try { res.status(500).json({ error: "Moteur PDF indisponible : " + (e.message || e) }); } catch {} });
    py.on("close", (code) => {
      try {
        if (code !== 0 || !fs.existsSync(out)) {
          return res.status(500).json({ error: "Rendu PDF échoué. " + Buffer.concat(errs).toString().slice(0, 400) });
        }
        const pdf = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${(filename || "Document.pdf").replace(/[^\w.-]+/g, "_")}"`);
        res.send(pdf);
      } catch (e) {
        console.error("[POST /api/pdf/render]", e && e.message ? e.message : e); try { res.status(502).json({ error: String(e.message || e) }); } catch {} }
    });
    py.stdin.write(html);
    py.stdin.end();
  } catch (err) {
    console.error("[POST /api/pdf/render]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});
app.get("/api/projets/doc", guard, exportLimiter, async (_req, res) => {
  try {
    const got = await getIssues(false);
    const html = projetsDocHtml(got ? withoutDeletedDevs(got.issues) : []);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("[GET /api/projets/doc]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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
  } catch (err) {
    console.error("[GET /api/referentiel]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/written", guard, aiLimiter, async (req, res) => {
  try {
    const dossier = req.body.dossier;
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = withoutDeletedDevs(got.issues).filter((i) => i.dossier === dossier);
    const out = await writtenDailyReport(dossier, sub);
    logEvent("cr_ecrit", `CR écrit - ${dossier}`, { dossier, count: sub.length, via: out.generatedBy });
    res.json(out);
  } catch (err) {
    console.error("[POST /api/cr/written]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/date", guard, aiLimiter, async (req, res) => {
  try {
    const { dossier, dateISO, startISO, endISO, label } = req.body || {};
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const visible = withoutDeletedDevs(got.issues);
    const range = (startISO || endISO || label) ? { startISO, endISO, label } : dateISO; // plage, sinon compat jour unique
    const out = await writtenDateReport(dossier, range, visible);
    logEvent("cr_date", `CR rédigé - ${dossier || "Tous"} - ${label || dateISO || "?"}`, { dossier: dossier || "Tous", periode: label || dateISO, via: out.generatedBy });
    res.json(out);
  } catch (err) {
    console.error("[POST /api/cr/date]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/morning", guard, aiLimiter, async (req, res) => {
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
  } catch (err) {
    console.error("[POST /api/cr/morning]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Cache des explications (clé + date de maj) pour ne pas régénérer/repayer inutilement.
const explainCache = new Map();

// Assistant ancré : répond UNIQUEMENT à partir des vraies données cp|WIRE
// (chiffres du point du soir, tickets Jira, référentiel programmes, méthodologie TMA).
// Aucune invention : si l'info n'est pas dans les données, il le dit.
app.post("/api/assistant", guard, aiLimiter, async (req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const out = await assistantAnswer(req.body.question || "", got.issues, req.body.history || []);
    logEvent("assistant", "Assistant — question", { q: String(req.body.question || "").slice(0, 120), tickets: (out.sources && out.sources.tickets || []).length });
    res.json(out);
  } catch (err) {
    console.error("[POST /api/assistant]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Copilote — analyse d'un fichier déposé (glisser-déposer). Extrait le texte (CSV/TXT/
// JSON/MD/XLSX), l'analyse de façon ANCRÉE (rien d'inventé), et propose une fiche + le
// dossier deviné pour un éventuel import au corpus.
app.post("/api/assistant/analyze", guard, aiLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    const name = req.file.originalname || "fichier";
    let text = bufferToText(req.file.buffer, name);
    if (text == null && /\.(xlsx|xls)$/i.test(name)) {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        text = wb.SheetNames.map((n) => `# ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n");
      } catch {}
    }
    if (text == null && /\.docx$/i.test(name)) {
      try {
        const mod = await import("mammoth");
        const mammoth = mod.default || mod;
        const r = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = r && r.value ? r.value : null;
      } catch {}
    }
    if (text == null && /\.pdf$/i.test(name)) {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
        const r = await parser.getText();
        text = r && r.text ? r.text : null;
        try { await parser.destroy(); } catch {}
      } catch {}
    }
    if (text == null && /\.pptx$/i.test(name)) {
      try {
        const { pptxToText } = await import("./pptx.js");
        text = await pptxToText(req.file.buffer);
      } catch {}
    }
    if (text == null && /\.one$/i.test(name)) {
      try {
        const os = await import("os"); const { spawn } = await import("child_process");
        const here = path.dirname(fileURLToPath(import.meta.url));
        const tmp = path.join(os.tmpdir(), `cpwire_one_${Date.now()}.one`);
        fs.writeFileSync(tmp, req.file.buffer);
        text = await new Promise((resolve) => {
          const py = spawn(process.env.PYTHON_BIN || "python3", [path.join(here, "onenote.py"), tmp]);
          const out = []; py.stdout.on("data", (d) => out.push(d));
          py.on("error", () => resolve(null));
          py.on("close", () => { try { fs.unlinkSync(tmp); } catch {} resolve(Buffer.concat(out).toString("utf8") || null); });
        });
      } catch {}
    }
    if (text == null || !String(text).trim()) {
      return res.json({ error: "Format non géré pour l'analyse (CSV, TXT, JSON, MD, XLSX, Word .docx, PowerPoint .pptx, OneNote .one, PDF). Pour un ancien .doc/.ppt, un .msg ou une vidéo, copie-colle le texte dans le chat." });
    }
    const got = await getIssues(false);
    const out = await analyzeFile({ filename: name, text, question: req.body.question || "", issues: got ? got.issues : [] });
    logEvent("assistant_analyse", `Copilote — analyse fichier ${name}`, { name, chars: String(text).length });
    res.json({ ok: true, filename: name, ...out });
  } catch (err) {
    console.error("[POST /api/assistant/analyze]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Copilote — import au corpus : mémorise une fiche (issue d'une analyse) dans la base de
// connaissance d'un dossier, pour enrichir les réponses futures.
app.post("/api/assistant/import", guard, aiLimiter, async (req, res) => {
  try {
    const dossier = String(req.body.dossier || "").trim();
    const note = String(req.body.note || "").trim();
    if (!dossier || !note) return res.status(400).json({ error: "Dossier et fiche requis." });
    addNote(dossier, note);
    logEvent("assistant_import", `Copilote — import corpus (${dossier})`, { dossier });
    res.json({ ok: true, dossier });
  } catch (err) {
    console.error("[POST /api/assistant/import]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Explication SIMPLE d'un ticket, pour non-technique.
app.post("/api/ticket/explain", guard, aiLimiter, async (req, res) => {
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
  } catch (err) {
    console.error("[POST /api/ticket/explain]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Historique (qui a fait quoi, quand) + heures saisies (worklogs) d'un ticket — à la demande.
app.post("/api/ticket/activity", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, timeline: [], worklogs: [], totalTime: "0h" });
    const out = await fetchIssueActivity(req.body.cle);
    res.json({ configured: true, ...out });
  } catch (err) {
    console.error("[POST /api/ticket/activity]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/dev/work", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, items: [] });
    const { dev, keys } = req.body || {};
    const out = await fetchDevWork(dev, Array.isArray(keys) ? keys : []);
    res.json(out);
  } catch (err) {
    console.error("[POST /api/dev/work]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/changes/summary", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, items: [] });
    const { keys } = req.body || {};
    const out = await fetchChangesSummary(Array.isArray(keys) ? keys : []);
    res.json(out);
  } catch (err) {
    console.error("[POST /api/changes/summary]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// CRA — Compte rendu d'activité : temps saisis consolidés par projet et par personne sur une période.
app.post("/api/cra", guard, async (req, res) => {
  try {
    if (!isConfigured()) return res.json({ configured: false, byPerson: [], byProject: [], totalSeconds: 0, totalTime: "0h" });
    const { start, end } = req.body || {};
    const out = await fetchCRA({ start, end });
    res.json({ configured: true, ...out });
  } catch (err) {
    console.error("[POST /api/cra]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// CRA depuis un fichier Excel/CSV importé (sans Jira). Renvoie la même structure que /api/cra.
app.post("/api/cra/import", guard, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    const basis = Number(req.body?.basis) || 7;
    const out = parseCraXlsx(req.file.buffer, { basis });
    logEvent("cra_import", "CRA importé depuis Excel", { lignes: out.scanned, fichier: req.file.originalname });
    res.json(out);
  } catch (err) {
    console.error("[POST /api/cra/import]", err && err.message ? err.message : err); res.status(400).json({ error: String(err.message || err) }); }
});

// ----- Import de documents : analyse IA (proposition) puis validation -----
app.post("/api/import/analyze", guard, writeGuard, aiLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    const out = await analyzeDocument({ filename: req.file.originalname, buffer: req.file.buffer });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json(out);
  } catch (err) {
    console.error("[POST /api/import/analyze]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/import/apply", guard, writeGuard, async (req, res) => {
  try {
    const { filename, proposal, apercu, dataset, diff } = req.body || {};
    if (!proposal) return res.status(400).json({ error: "Proposition manquante." });
    const entry = applyImport({ filename, proposal, apercu, dataset, diff, by: req.userEmail });
    try { resyncSharefly(); } catch {}
    try { logEvent("import_applique", `Import validé : ${filename || "document"}`, { type: proposal.type, client: proposal.client }); } catch (e) {
      console.error("[POST /api/import/apply]", e && e.message ? e.message : e); /* journal best-effort */ }
    res.json({ ok: true, entry });
  } catch (err) {
    console.error("[POST /api/import/apply]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/import/history", guard, (_req, res) => res.json({ items: listImports() }));
app.get("/api/import/dataset/:name", guard, (req, res) => res.json(getDataset(req.params.name) || { rows: [] }));


// Rapport global : tous les clients, organisé par client.
app.post("/api/cr/global", guard, aiLimiter, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const byDossier = {};
    withoutDeletedDevs(got.issues).forEach((i) => { (byDossier[i.dossier] ||= []).push(i); });
    const out = await globalReport(byDossier);
    logEvent("cr_global", "Rapport journalier global", { clients: Object.keys(byDossier).length });
    res.json(out);
  } catch (err) {
    console.error("[POST /api/cr/global]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/ticket/report", guard, aiLimiter, async (req, res) => {
  try {
    const got = await getIssues(false);
    const t = (got?.issues || []).find((i) => i.cle === req.body.cle) || { cle: req.body.cle, resume: req.body.resume || "" };
    const text = await ticketReport(t, req.body.note);
    res.json({ text });
  } catch (err) {
    console.error("[POST /api/ticket/report]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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
  } catch (err) {
    console.error("[POST /api/ticket/push]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/transcribe", guard, writeGuard, aiLimiter, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier audio." });
    res.json({ text: await transcribe(req.file.buffer, req.file.originalname, req.file.mimetype) });
  } catch (err) {
    console.error("[POST /api/transcribe]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
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

app.post("/api/meeting/report", guard, writeGuard, aiLimiter, upload.fields([{ name: "audio", maxCount: 1 }, { name: "images", maxCount: 8 }]), async (req, res) => {
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
    try { const cl = String(dossier || "").trim(); if (cl && !/^tous/i.test(cl) && out && out.html) { recordDeliverable({ client: cl, type: "CR réunion", title: (titre && titre.trim()) ? `CR réunion — ${titre.trim()}` : `CR réunion — ${cl}`, html: out.html, ext: "html" }); resyncSharefly(); } } catch (e) { console.error("[sharefly] record meeting:", e && e.message); }
    res.json({ ...out, transcript });
  } catch (err) {
    console.error("[POST /api/meeting/report]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// ---- Fiches dossiers (éditables) ----
app.post("/api/meeting/prep", guard, aiLimiter, async (req, res) => {
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
  } catch (err) {
    console.error("[POST /api/meeting/prep]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/dossiers", guard, (_req, res) => res.json({ dossiers: readDossiers() }));

// Routes analytiques (échéances, signaux, projections, cohérence, risque, charge,
// cote) extraites dans ./routes/analytics.js (v347) pour alléger app.js — chemins inchangés.
app.use(analyticsRouter({ getIssues, withoutDeletedDevs }));

// CR de dossier à la charte Armonie : compose le HTML autonome (à passer à /api/pdf/render).
const CR_TYPES = {
  COMOP: "Comité opérationnel", COPIL: "Comité de pilotage", GONOGO: "Bilan Go / No-Go",
  RECAP: "Récapitulatif", CR: "Compte rendu", COMEX: "Comité exécutif",
};
app.get("/api/cr/dossier", guard, async (req, res) => {
  try {
    const nom = String(req.query.nom || "").trim();
    if (!nom) return res.status(400).json({ error: "Paramètre 'nom' (dossier) manquant." });
    const typeKey = String(req.query.type || "COMOP").toUpperCase().replace(/[^A-Z]/g, "");
    const typeLabel = CR_TYPES[typeKey] || CR_TYPES.CR;
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const canon = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const all = withoutDeletedDevs(got.issues);
    const sub = all.filter((i) => canon(i.dossier) === canon(nom));
    if (!sub.length) return res.status(404).json({ error: `Aucun ticket pour le dossier « ${nom} ».` });

    // KPIs + répartition par catégorie (ordre logique de flux).
    const CAT_ORDER = ["afaire", "encours", "retourTest", "recetteArmonie", "recetteClient", "attenteClient", "termine", "miseEnProd"];
    const catCount = {}; for (const i of sub) catCount[i.categorie] = (catCount[i.categorie] || 0) + 1;
    const categories = CAT_ORDER.filter((c) => catCount[c]).map((c) => ({ label: CATEGORY_LABEL[c] || c, n: catCount[c] }));
    const termines = (catCount.termine || 0) + (catCount.miseEnProd || 0);
    const encours = (catCount.encours || 0) + (catCount.retourTest || 0) + (catCount.recetteArmonie || 0);
    const suivi = sub.filter((i) => i.categorie !== "annule").length;
    const kpis = { suivis: suivi, termines, encours, afaire: catCount.afaire || 0, tauxTermine: suivi ? Math.round((termines / suivi) * 100) : null };

    // SLA / attention / échéances / risque — sur le sous-ensemble réel.
    const slaReport = buildSlaReport(sub);
    const over = (slaReport.alerts || []).filter((a) => a.state === "over");
    const gtiOver = (slaReport.gtiAlerts || []).filter((a) => a.state === "over");
    const CLOSED = new Set(["termine", "miseEnProd", "annule"]);
    const ageJ = (d) => { const t = Date.parse(d || ""); return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000); };
    const figes = sub.filter((i) => !CLOSED.has(i.categorie)).map((i) => ({ cle: i.cle, resume: i.resume, jours: ageJ(i.statutDepuis || i.maj) }))
      .filter((f) => f.jours != null && f.jours >= 30).sort((a, b) => b.jours - a.jours);
    const coherence = buildCoherence(sub);
    const incoherences = (coherence.checks || []).filter((c) => c.severity === "alerte").map((c) => ({ label: c.label, items: c.items }));
    const radarAll = buildDeadlineRadar(readDossiers(), readConnaissance());
    const radar = radarAll.filter((r) => canon(r.dossier) === canon(nom));
    const echeances = radar.map((r) => ({ label: r.label || "échéance", statut: r.statut, jours: r.joursRestants }));
    const pointDerived = deriveFromPointHistory();
    const risk = (buildRiskScores({ issues: sub, slaReport, radar, coherence, pointDerived }).dossiers[0]) || null;

    // Frise du cycle : macro-étapes réelles (pivot = étape la plus chargée).
    const macro = [
      { label: "À faire", n: catCount.afaire || 0 },
      { label: "En cours", n: (catCount.encours || 0) + (catCount.retourTest || 0) },
      { label: "Recette", n: (catCount.recetteArmonie || 0) + (catCount.recetteClient || 0) + (catCount.attenteClient || 0) },
      { label: "Terminé / mis en prod", n: (catCount.termine || 0) + (catCount.miseEnProd || 0) },
    ].filter((s) => s.n > 0);
    const maxN = Math.max(0, ...macro.map((s) => s.n));
    const cycle = macro.map((s) => ({ label: `${s.label} — ${s.n}`, key: s.n === maxN }));

    const data = {
      client: nom, type: typeKey, typeLabel, date: new Date().toISOString().slice(0, 10),
      titre: `${typeLabel} — ${nom}`,
      kpis,
      categories,
      cycle,
      sla: { over, gtiOver, risk: slaReport.global ? slaReport.global.ouvRisque : 0 },
      attention: { figes, incoherences },
      echeances,
      risk,
    };
    const html = buildDossierCrHtml(data);
    const filename = `ARMONIE-${nom.toUpperCase().replace(/[^A-Z0-9]/gi, "_")}-${typeKey}-${data.date}.pdf`;
    // Livrable réel produit par cp|WIRE : on héberge le HTML charté -> ouvrable dans ShareFly.
    try { recordDeliverable({ client: nom, type: typeLabel, title: `${typeLabel} — ${nom} (${data.date})`, html, ext: "html" }); resyncSharefly(); } catch (e) { console.error("[sharefly] record livrable:", e && e.message); }
    res.json({ html, filename, resume: { tickets: sub.length, termines, over: over.length, figes: figes.length, risk: risk ? risk.score : null } });
  } catch (err) {
    console.error("[GET /api/cr/dossier]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Transitions Jira disponibles pour un ticket (pour agir depuis le cockpit).
app.get("/api/ticket/transitions", guard, async (req, res) => {
  try {
    const cle = String(req.query.cle || "").trim();
    if (!cle) return res.status(400).json({ error: "Paramètre 'cle' manquant." });
    res.json({ transitions: await listTransitions(cle) });
  } catch (err) {
    console.error("[GET /api/ticket/transitions]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Appliquer une transition de statut (action rapide depuis une alerte).
app.post("/api/ticket/transition", guard, writeGuard, async (req, res) => {
  try {
    const { cle, to } = req.body || {};
    if (!cle || !to) return res.status(400).json({ error: "Paramètres 'cle' et 'to' requis." });
    if (!isConfigured()) return res.status(409).json({ error: "Jira non configuré : impossible d'écrire dans le ticket." });
    const result = await transition(cle, to);
    logEvent("ticket_transition", `Transition Jira - ${cle} -> ${to}`, { cle, to });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST /api/ticket/transition]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Digest quotidien : composition à partir des données réelles. ?send=mail pour l'envoyer si
// Microsoft 365 est configuré (sinon on renvoie le digest sans prétendre l'avoir envoyé).
// Compose le digest à partir des données réelles, et l'envoie si demandé + configuré.
// Réutilisé par la route /api/digest, l'endpoint cron et le planificateur du soir.
// Honnête de bout en bout : ne prétend jamais avoir envoyé ce qu'il n'a pas pu envoyer.
export async function runDigest({ send = false, to = "" } = {}) {
  const got = await getIssues(false);
  if (!got) throw Object.assign(new Error("Jira non configuré."), { code: 409 });
  const issues = withoutDeletedDevs(got.issues);
  const pointDerived = deriveFromPointHistory();
  const slaReport = buildSlaReport(issues);
  const radar = buildDeadlineRadar(readDossiers(), readConnaissance());
  const recurrences = signalsStats(30).recurrences;
  const digest = buildDigest({ pointDerived, slaReport, radar, recurrences });

  const envoi = { demande: !!send };
  if (send) {
    if (!msConfigured || !msConfigured()) { envoi.envoye = false; envoi.raison = "Microsoft 365 non configuré (envoi impossible)."; }
    else {
      const dest = to || process.env.DIGEST_TO || "";
      if (!dest) { envoi.envoye = false; envoi.raison = "Destinataire manquant (paramètre ?to= ou variable DIGEST_TO)."; }
      else {
        try { await sendMail({ to: dest, subject: `cp|WIRE — point du soir ${digest.date}`, html: digestHtml(digest) }); envoi.envoye = true; envoi.to = dest; }
        catch (e) { envoi.envoye = false; envoi.raison = String(e.message || e); }
      }
    }
  }
  return { digest, texte: digestText(digest), envoi };
}

app.get("/api/digest", guard, async (req, res) => {
  try {
    const out = await runDigest({ send: req.query.send === "mail", to: req.query.to || "" });
    res.json(out);
  } catch (err) {
    if (err && err.code === 409) return res.status(409).json({ error: err.message });
    console.error("[GET /api/digest]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

// Endpoint pour un planificateur EXTERNE (Render Cron Job) : protégé par un secret
// partagé (CRON_SECRET), indépendant de l'authentification de session. Envoie le digest.
app.post("/api/cron/digest", async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET || "";
    const given = req.get("x-cron-secret") || req.query.secret || "";
    if (!secret) return res.status(503).json({ error: "CRON_SECRET non défini côté serveur." });
    if (given !== secret) return res.status(401).json({ error: "Secret cron invalide." });
    const out = await runDigest({ send: true, to: req.query.to || "" });
    res.json(out);
  } catch (err) {
    if (err && err.code === 409) return res.status(409).json({ error: err.message });
    console.error("[POST /api/cron/digest]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});
app.put("/api/dossiers/:nom", guard, writeGuard, (req, res) => {
  try {
    const saved = saveDossier(req.params.nom, req.body || {});
    logEvent("fiche_dossier", `Fiche mise à jour - ${req.params.nom}`, {});
    try { resyncSharefly(); } catch {}
    res.json({ ok: true, fiche: saved });
  } catch (err) {
    console.error("[PUT /api/dossiers/:nom]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
});

// Mémoire d'équipe (connaissance) — lue par l'IA à chaque rapport.
app.get("/api/connaissance", guard, (_req, res) => res.json(readConnaissance()));
// Déclenchement manuel de l'apprentissage IA (owner). Force l'analyse de tous les clients.
app.post("/api/connaissance/learn", guard, writeGuard, learnLimiter, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    // Tourne avec IA si disponible, sinon en extraction déterministe (zéro invention).
    const r = await runAutoLearn(got.issues, { force: true });
    try { resyncSharefly(); } catch {}
    res.json({ ok: true, learned: r.learned, mode: r.mode, connaissance: readConnaissance() });
  } catch (e) {
    console.error("[POST /api/connaissance/learn]", e && e.message ? e.message : e); res.status(502).json({ error: String(e.message || e) }); }
});
app.put("/api/connaissance", guard, writeGuard, (req, res) => {
  try {
    const k = saveConnaissance(req.body || {});
    logEvent("connaissance", "Mémoire d'équipe mise à jour", {});
    try { resyncSharefly(); } catch {}
    res.json({ ok: true, connaissance: k });
  } catch (err) {
    console.error("[PUT /api/connaissance]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
});

// Oublie définitivement une source apprise (et son historique) pour un dossier. Réservé
// aux droits d'écriture : c'est une action de curation de la mémoire d'équipe, pas de
// lecture — au même titre qu'éditer le contexte ou les notes.
app.post("/api/connaissance/appris/remove", guard, writeGuard, (req, res) => {
  const dossier = String(req.body?.dossier || "").trim();
  const source = String(req.body?.source || "").trim();
  if (!dossier || !source) return res.status(400).json({ error: "dossier et source requis." });
  try {
    const ok = forgetLearned(dossier, source);
    if (ok) { logEvent("connaissance", `Source apprise oubliée — ${dossier}`, { source }); try { resyncSharefly(); } catch {} }
    res.json({ ok });
  } catch (err) {
    console.error("[POST /api/connaissance/appris/remove]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
});

// ---- Partage Microsoft 365 (optionnel, nécessite app Azure) ----
app.post("/api/share/mail", guard, writeGuard, async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    const r = await sendMail({ to, subject, html });
    logEvent("partage_mail", `E-mail Outlook envoyé`, { to });
    res.json(r);
  } catch (err) {
    console.error("[POST /api/share/mail]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/share/sharepoint", guard, writeGuard, async (req, res) => {  try {
    const { folderPath, filename, html } = req.body;
    const r = await uploadToSharePoint({ folderPath, filename, html });
    logEvent("partage_sharepoint", `Rapport déposé sur SharePoint`, { folderPath, filename });
    res.json(r);
  } catch (err) {
    console.error("[POST /api/share/sharepoint]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/history", guard, (_req, res) => res.json({ events: readHistory() }));

// ---- Explorateur SharePoint (lecture en direct des fichiers, dont les Excel des devs) ----
// Nécessite MS_* + SP_SITE_ID (app Azure, permission Sites.Read.All / Sites.ReadWrite.All).
app.get("/api/sharepoint/list", guard, async (req, res) => {
  try {
    if (!spConfigured()) return res.status(409).json({ error: "SharePoint non configuré : variables MS_* et SP_SITE_ID à renseigner.", needsConfig: true });
    const items = await spListChildren(req.query.path || "");
    res.json({ path: req.query.path || "", items });
  } catch (err) {
    console.error("[GET /api/sharepoint/list]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});
app.post("/api/sharepoint/preview", guard, async (req, res) => {
  try {
    if (!spConfigured()) return res.status(409).json({ error: "SharePoint non configuré.", needsConfig: true });
    const url = await spPreviewUrl((req.body || {}).id);
    res.json({ url });
  } catch (err) {
    console.error("[POST /api/sharepoint/preview]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
});
app.get("/api/sharepoint/status", guard, (_req, res) => res.json({ configured: spConfigured() }));

// Lecture directe d'une liste/bibliothèque SharePoint (remplace l'export CSV manuel).
// GUID issu du .iqy ou de l'env SP_TMA_LIST_ID. Lecture seule.
app.get("/api/sharepoint/listinfo/:id", guard, async (req, res) => {
  try {
    if (!spConfigured()) return res.status(409).json({ error: "SharePoint non configuré.", needsConfig: true });
    const id = req.params.id || process.env.SP_TMA_LIST_ID || "";
    res.json(await spListInfo(id));
  } catch (e) {
    console.error("[GET /api/sharepoint/listinfo/:id]", e && e.message ? e.message : e); res.status(502).json({ error: String(e.message || e) }); }
});
app.get("/api/sharepoint/items/:id", guard, async (req, res) => {
  try {
    if (!spConfigured()) return res.status(409).json({ error: "SharePoint non configuré.", needsConfig: true });
    const id = req.params.id || process.env.SP_TMA_LIST_ID || "";
    const items = await spListItems(id, { max: Math.min(Number(req.query.max) || 5000, 5000) });
    // Échantillon de champs sur le 1er élément : sert à figer le mappage colonnes.
    res.json({ count: items.length, sampleFields: items[0] ? Object.keys(items[0].fields || {}) : [], items });
  } catch (e) {
    console.error("[GET /api/sharepoint/items/:id]", e && e.message ? e.message : e); res.status(502).json({ error: String(e.message || e) }); }
});


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
app.use(shareflyRouter); // /sharefly (page) + /api/sharefly/* (état partagé) — AVANT le fallback SPA
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
  console.log(`Interface servie depuis ${WEB_DIST}`);
}

// Route /api/* inconnue : JSON propre (et non la page HTML générique d'Express), pour que
// le front (qui s'attend toujours à du JSON côté API) ne tombe jamais sur un échec de parsing
// confus si un chemin est mal orthographié ou une route supprimée par erreur.
app.use("/api", (req, res) => res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` }));

// Filet de sécurité global : toute erreur qui aurait échappé au try/catch d'une route
// (bug futur, middleware qui lève) atterrit ici plutôt que de faire planter la requête
// sans réponse. Toujours du JSON, jamais la trace de pile (NODE_ENV=production déjà réglé
// dans le Dockerfile, mais on ne s'y fie pas : on construit nous-mêmes un message sobre).
app.use((err, req, res, _next) => {
  console.error(`[non-rattrapé] ${req.method} ${req.originalUrl} —`, err && err.message ? err.message : err);
  if (res.headersSent) return;
  res.status(err && err.status ? err.status : 500).json({ error: "Erreur interne inattendue." });
});

// app.js construit l'application Express (middlewares + ~70 routes) mais ne démarre
// JAMAIS le serveur elle-même (pas d'app.listen ici) : c'est ce qui permet de l'importer
// proprement dans les tests automatisés (server/test/*.test.js) sans ouvrir de vrai port,
// et de séparer la construction de l'app du script de démarrage (index.js).
export { app, sessions, initSessions, PORT, ALLOW_DEMO, AUTH_ENABLED };
