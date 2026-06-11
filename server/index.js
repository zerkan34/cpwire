// index.js — serveur CPwire.
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";

import { searchIssues, isConfigured, fetchIssueDescription, fetchIssueActivity, fetchDevWork, fetchChangesSummary, fetchCRA } from "./jira.js";
import { loadSnapshot, saveSnapshot } from "./store.js";
import { STATUTS, ME, TARGET_DONE } from "./config.js";
import { DEMO_ISSUES } from "./demo-data.js";
import { dailyReport, morningReport, ticketReport, meetingReport, meetingPrep, globalReport, explainTicket, aiAvailable } from "./ai.js";
import { addComment, transition } from "./jira-write.js";
import { transcribe, sttAvailable } from "./stt.js";
import { logEvent, read as readHistory } from "./history.js";
import { readDeleted, addDeleted, removeDeleted } from "./devmeta.js";
import { readAll as readDossiers, saveOne as saveDossier } from "./dossiers.js";
import { sendMail, uploadToSharePoint, msConfigured } from "./microsoft.js";

const app = express();
const PORT = process.env.PORT || 4000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const PROJECTS = (process.env.PROJECTS || "TEDL,PEM,TDSS,PDFP,TMT,PTAF,TBEL,TBAL,PBAL,TIMA,PIMA,PIMA2,TDIA").split(",").map((s) => s.trim()).filter(Boolean);
// Import EXHAUSTIF : tous les tickets des projets, aucun filtre excluant.
const DEFAULT_JQL = process.env.JQL || `project in (${PROJECTS.join(",")}) ORDER BY created ASC`;
const ALLOW_DEMO = process.env.ALLOW_DEMO === "1";

// ---- Authentification ----
const AUTH_EMAIL = process.env.AUTH_EMAIL || "";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "";
const AUTH_ENABLED = Boolean(AUTH_EMAIL && AUTH_PASSWORD);
const sessions = new Set();

function guard(req, res, next) {
  if (!AUTH_ENABLED) return next();
  const t = req.headers["x-access-token"];
  if (t && sessions.has(t)) return next();
  return res.status(401).json({ error: "Authentification requise." });
}

app.use(cors());
app.use(express.json({ limit: "8mb" }));

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

  if (ALLOW_DEMO) return { issues: DEMO_ISSUES.map((i) => ({ ...i, mine: i.assigne === ME })), source: "DÉMO (ALLOW_DEMO=1)", changed: [] };
  return null; // ni Jira, ni démo -> écran de configuration
}

// ---- Auth ----
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!AUTH_ENABLED) {
    const t = crypto.randomUUID(); sessions.add(t);
    return res.json({ token: t, me: ME, note: "Auth non configurée côté serveur." });
  }
  if (email === AUTH_EMAIL && password === AUTH_PASSWORD) {
    const t = crypto.randomUUID(); sessions.add(t);
    return res.json({ token: t, me: ME });
  }
  return res.status(401).json({ error: "Identifiants incorrects." });
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, app: "CPwire", authEnabled: AUTH_ENABLED, jiraConfigured: isConfigured(),
    ai: aiAvailable(), stt: sttAvailable(), microsoft: msConfigured(), me: ME, projects: PROJECTS, allowDemo: ALLOW_DEMO }));

app.get("/api/portfolio", guard, async (req, res) => {
  try {
    const got = await getIssues({ refresh: req.query.refresh === "1", full: req.query.full === "1", jql: req.query.jql });
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const payload = aggregate(got.issues, got.source);
    payload.changed = got.changed || [];
    payload.syncedAt = snap.syncedAt || null;
    payload.importing = Boolean(got.importing);
    payload.importError = got.importError || null;
    res.json(payload);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/recap", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const useToday = got.issues.some((i) => isToday(i.maj));
    const todays = useToday ? got.issues.filter((i) => isToday(i.maj)) : got.issues;
    const byDossier = {};
    todays.forEach((i) => { (byDossier[i.dossier] ||= []).push(i); });
    res.json({ generatedAt: new Date().toISOString(), basis: useToday ? "aujourd'hui" : "tout l'historique", byDossier });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/cr/daily", guard, async (req, res) => {
  try {
    const dossier = req.body.dossier;
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const sub = got.issues.filter((i) => i.dossier === dossier);
    const out = await dailyReport(dossier, sub);
    logEvent("cr_journalier", `CR journalier - ${dossier}`, { dossier, count: sub.length, via: out.generatedBy });
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


// Rapport global : tous les clients, organisé par client.
app.post("/api/cr/global", guard, async (_req, res) => {
  try {
    const got = await getIssues(false);
    if (!got) return res.status(409).json({ error: "Jira non configuré." });
    const byDossier = {};
    got.issues.forEach((i) => { (byDossier[i.dossier] ||= []).push(i); });
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

app.post("/api/ticket/push", guard, async (req, res) => {
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

app.post("/api/transcribe", guard, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier audio." });
    res.json({ text: await transcribe(req.file.buffer, req.file.originalname, req.file.mimetype) });
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/meeting/report", guard, upload.fields([{ name: "audio", maxCount: 1 }, { name: "images", maxCount: 8 }]), async (req, res) => {
  try {
    const { titre, participants, notes } = req.body;
    let transcript = req.body.transcript || "";
    const audio = req.files?.audio?.[0];
    if (audio && !transcript && sttAvailable()) transcript = await transcribe(audio.buffer, audio.originalname, audio.mimetype);
    const images = (req.files?.images || []).map((f) => ({ media_type: f.mimetype, dataBase64: f.buffer.toString("base64") }));
    const out = await meetingReport({ titre, participants, notes, transcript, images });
    logEvent("cr_reunion", `CR reunion - ${titre || "sans titre"}`, { via: out.generatedBy, images: images.length, audio: !!audio });
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
app.put("/api/dossiers/:nom", guard, (req, res) => {
  try {
    const saved = saveDossier(req.params.nom, req.body || {});
    logEvent("fiche_dossier", `Fiche mise à jour - ${req.params.nom}`, {});
    res.json({ ok: true, fiche: saved });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// ---- Partage Microsoft 365 (optionnel, nécessite app Azure) ----
app.post("/api/share/mail", guard, async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    const r = await sendMail({ to, subject, html });
    logEvent("partage_mail", `E-mail Outlook envoyé`, { to });
    res.json(r);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.post("/api/share/sharepoint", guard, async (req, res) => {
  try {
    const { folderPath, filename, html } = req.body;
    const r = await uploadToSharePoint({ folderPath, filename, html });
    logEvent("partage_sharepoint", `Rapport déposé sur SharePoint`, { folderPath, filename });
    res.json(r);
  } catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});

app.get("/api/history", guard, (_req, res) => res.json({ events: readHistory() }));

// Fiches développeur supprimées (soft-delete : on masque, on ne perd rien).
app.get("/api/devs/deleted", guard, (_req, res) => res.json({ deleted: readDeleted() }));
app.post("/api/devs/delete", guard, (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nom manquant." });
  const deleted = addDeleted(name);
  logEvent("dev_delete", `Fiche développeur masquée : ${name}`);
  res.json({ deleted });
});
app.post("/api/devs/restore", guard, (req, res) => {
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
