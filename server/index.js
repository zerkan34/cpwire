// index.js — serveur CPwire.
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";

import { searchIssues, isConfigured, fetchIssueDescription } from "./jira.js";
import { STATUTS, ME, TARGET_DONE } from "./config.js";
import { DEMO_ISSUES } from "./demo-data.js";
import { dailyReport, morningReport, ticketReport, meetingReport, globalReport, explainTicket, aiAvailable } from "./ai.js";
import { addComment, transition } from "./jira-write.js";
import { transcribe, sttAvailable } from "./stt.js";
import { logEvent, read as readHistory } from "./history.js";
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

const TTL = (Number(process.env.CACHE_MINUTES) || 15) * 60 * 1000;
let cache = { at: 0, payload: null };

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

async function getIssues(force, jql) {
  if (isConfigured()) {
    if (!force && cache.payload && Date.now() - cache.at < TTL) return { issues: cache.payload.issues, source: "Jira (cache)" };
    const issues = await searchIssues(jql || DEFAULT_JQL);
    return { issues, source: "Jira (live)" };
  }
  if (ALLOW_DEMO) return { issues: DEMO_ISSUES.map((i) => ({ ...i, mine: i.assigne === ME })), source: "DÉMO (ALLOW_DEMO=1)" };
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
    const got = await getIssues(req.query.refresh === "1", req.query.jql);
    if (!got) return res.status(409).json({ error: "Jira non configuré.", needsConfig: true });
    const payload = aggregate(got.issues, got.source);
    if (isConfigured()) cache = { at: Date.now(), payload };
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
