// jira.js — accès à l'API REST de Jira Cloud (recherche enrichie JQL).
// Le jeton ne quitte JAMAIS le serveur : il est lu depuis les variables d'environnement.

import { dossierFromKey, engagementFromKey, bucketFromStatus, categoryFromStatus, devFromIssue, contributorsFromIssue, ME, DONE_CATS } from "./config.js";

const BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";

// En-tête d'authentification "Basic" attendu par Jira Cloud : base64(email:token).
function authHeader() {
  const raw = `${EMAIL}:${TOKEN}`;
  return "Basic " + Buffer.from(raw).toString("base64");
}

export function isConfigured() {
  return Boolean(BASE_URL && EMAIL && TOKEN);
}

// Champs récupérés pour chaque ticket (l'API enrichie ne renvoie que ce qu'on demande).
const FIELDS = [
  "summary",
  "status",
  "assignee",
  "priority",
  "duedate",
  "project",
  "updated",
  "created",
  "resolutiondate",
  "labels",
];

// Le drapeau "Flagged" (impediment) est un champ personnalisé dont l'id varie selon l'instance.
// On le découvre une fois via /rest/api/3/field, puis on l'ajoute aux champs récupérés.
let flaggedFieldId = null;
let flaggedResolved = false;
async function ensureFlaggedField() {
  if (flaggedResolved) return;
  flaggedResolved = true;
  try {
    const res = await fetch(`${BASE_URL}/rest/api/3/field`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
    if (!res.ok) return;
    const fields = await res.json();
    const f = (fields || []).find((x) => (x.name || "").toLowerCase() === "flagged");
    if (f) flaggedFieldId = f.id;
  } catch { /* on continue sans le drapeau */ }
}
function isFlagged(f) {
  const v = flaggedFieldId ? f[flaggedFieldId] : f.flagged;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

// Appelle l'endpoint de recherche enrichie et suit la pagination jusqu'au bout.
// fetch avec délai maximum : évite qu'une requête Jira qui ne répond pas bloque l'import à l'infini
// (sinon l'actualisation reste figée, la barre simulée parquée à ~92 %).
async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`Jira n'a pas répondu sous ${Math.round(ms / 1000)} s (page d'import interrompue). Réessaie « Tout recharger ».`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchIssues(jql) {
  if (!isConfigured()) {
    throw new Error(
      "Jira non configuré : renseigne JIRA_BASE_URL, JIRA_EMAIL et JIRA_API_TOKEN dans server/.env"
    );
  }

  await ensureFlaggedField();
  const fields = flaggedFieldId ? [...FIELDS, flaggedFieldId] : FIELDS;

  const url = `${BASE_URL}/rest/api/3/search/jql`;
  const issues = [];
  let nextPageToken;
  let guard = 0;
  const MAX_PAGES = 2000;
  const t0 = Date.now();
  console.log(`[import v2] début · jql="${String(jql).slice(0, 90)}"`);

  do {
    const body = { jql, maxResults: 100, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, 30000);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[import v2] ERREUR Jira ${res.status} à la page ${guard + 1} : ${text.slice(0, 200)}`);
      throw new Error(`Jira a répondu ${res.status} : ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    (data.issues || []).forEach((it) => issues.push(normalize(it)));
    guard += 1;
    console.log(`[import v2] page ${guard} · +${(data.issues || []).length} (total ${issues.length}) · isLast=${data.isLast === true}`);
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
  } while (nextPageToken && guard < MAX_PAGES);

  console.log(`[import v2] TERMINÉ · ${issues.length} tickets · ${guard} page(s) · ${Date.now() - t0} ms`);
  return issues;
}


// Extrait le texte brut d'un contenu ADF (format riche de Jira).
function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  let out = "";
  if (node.text) out += node.text;
  if (Array.isArray(node.content)) out += node.content.map(adfToText).join(node.type === "paragraph" ? "" : " ");
  if (node.type === "paragraph" || node.type === "heading") out += "\n";
  return out;
}

// Transforme un ticket Jira brut en objet simple et stable pour le cockpit.
function normalize(it) {
  const f = it.fields || {};
  const statusName = f.status?.name || "";
  const statusCat = f.status?.statusCategory?.key || "";
  const flagged = isFlagged(f);
  const labels = f.labels || [];
  const statut = bucketFromStatus(statusName, statusCat, flagged, labels);

  const due = f.duedate ? new Date(f.duedate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const enRetard = Boolean(due && due < today && statut !== "Terminé");

  const assigne = f.assignee?.displayName || "Non assigné";
  const summary = f.summary || "";
  return {
    cle: it.key,
    mine: assigne === ME,
    projet: f.project?.key || "",
    dossier: dossierFromKey(it.key),
    engagement: engagementFromKey(it.key), // "TMA" (projet T…) ou "Projet" (projet P…)
    resume: summary,
    assigne,
    assigneEmail: f.assignee?.emailAddress || "", // souvent masqué par Jira (vie privée)
    dev: devFromIssue(assigne, summary, labels), // dév principal (assigné, sinon titre, sinon étiquette)
    contributors: contributorsFromIssue(assigne, summary, labels), // tous les intervenants (assigné + titre + étiquettes)
    labels,
    priorite: f.priority?.name || "",
    statutJira: statusName,
    statut, // Bloqué / À faire / En cours / Terminé (grossier, pour le cockpit)
    categorie: categoryFromStatus(statusName), // fin : afaire/encours/recetteArmonie/recetteClient/miseEnProd/termine…
    echeance: f.duedate || null,
    enRetard,
    flagged,
    descriptionText: "", // chargée à la demande (voir fetchIssueDescription) pour accélérer l'import
    maj: f.updated || null,
    cree: f.created || null,
    resolu: f.resolutiondate || null,
    url: `${BASE_URL}/browse/${it.key}`,
  };
}

// Met en forme une durée Jira (secondes) en "Xh Ym".
function fmtSeconds(sec) {
  if (!sec) return "0h";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0h";
}

// Récupère, pour UN ticket, l'historique (qui a fait quoi, quand) et les heures saisies (worklogs).
// Appel à la demande (ouverture d'un ticket), donc sans impact sur la vitesse d'actualisation.
export async function fetchIssueActivity(key) {
  if (!isConfigured() || !key) return { timeline: [], worklogs: [], totalTime: "0h", totalSeconds: 0 };
  const headers = { Authorization: authHeader(), Accept: "application/json" };
  const enc = encodeURIComponent(key);

  // 1) Historique des changements (statut, assigné, drapeau, etc.)
  const timeline = [];
  try {
    const r = await fetch(`${BASE_URL}/rest/api/3/issue/${enc}?expand=changelog&fields=summary`, { headers });
    if (r.ok) {
      const data = await r.json();
      const histories = data.changelog?.histories || [];
      const KEEP = new Set(["status", "assignee", "resolution", "Flagged", "priority"]);
      histories.forEach((h) => {
        const who = h.author?.displayName || "—";
        const date = h.created;
        (h.items || []).forEach((it) => {
          if (!KEEP.has(it.field) && !KEEP.has(it.fieldId)) return;
          const champ = it.field === "status" ? "Statut"
            : it.field === "assignee" ? "Assigné"
            : it.field === "resolution" ? "Résolution"
            : it.field === "priority" ? "Priorité"
            : it.field === "Flagged" ? "Drapeau" : it.field;
          const from = it.fromString || "∅";
          const to = it.toString || "∅";
          timeline.push({ date, who, champ, from, to });
        });
      });
    }
  } catch { /* ignore */ }

  // 2) Heures saisies (worklogs)
  const worklogs = [];
  let totalSeconds = 0;
  try {
    const r = await fetch(`${BASE_URL}/rest/api/3/issue/${enc}/worklog`, { headers });
    if (r.ok) {
      const data = await r.json();
      (data.worklogs || []).forEach((w) => {
        const seconds = w.timeSpentSeconds || 0;
        totalSeconds += seconds;
        worklogs.push({
          who: w.author?.displayName || "—",
          date: w.started || w.created || null,
          time: w.timeSpent || fmtSeconds(seconds),
          seconds,
          comment: adfToText(w.comment).trim().slice(0, 300),
        });
      });
    }
  } catch { /* ignore */ }

  timeline.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  worklogs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return { timeline, worklogs, totalTime: fmtSeconds(totalSeconds), totalSeconds };
}

// Pour les RÉCAPS : QUI a réellement fait avancer chaque ticket sur une période.
// On lit UNIQUEMENT le changelog (pas les worklogs) → 2× moins d'appels.
// Concurrence limitée (6 en parallèle) + plafond pour rester rapide sur les grosses périodes.
export async function fetchStatusTransitions(keys = [], startISO = null, endISO = null, cap = 90) {
  if (!isConfigured() || !keys.length) return { configured: isConfigured(), items: [], scanned: 0, total: keys.length, capped: false };
  const headers = { Authorization: authHeader(), Accept: "application/json" };
  const sT = startISO ? new Date(startISO).getTime() : -Infinity;
  const eT = endISO ? new Date(endISO).getTime() : Infinity;
  const inRange = (d) => { const t = new Date(d).getTime(); return !isNaN(t) && t >= sT && t < eT; };
  const list = keys.slice(0, cap);
  const capped = keys.length > cap;
  const items = [];
  const fetchOne = async (key) => {
    const enc = encodeURIComponent(key);
    try {
      const r = await fetch(`${BASE_URL}/rest/api/3/issue/${enc}?expand=changelog&fields=summary`, { headers });
      if (!r.ok) return { cle: key, transitions: [] };
      const data = await r.json();
      const transitions = [];
      (data.changelog?.histories || []).forEach((h) => {
        if (!inRange(h.created)) return;
        const who = h.author?.displayName || "—";
        (h.items || []).forEach((it) => {
          if (it.field !== "status") return;
          transitions.push({ to: it.toString || "", from: it.fromString || "", who, date: h.created });
        });
      });
      return { cle: key, transitions };
    } catch { return { cle: key, transitions: [] }; }
  };
  const CONC = 6;
  for (let i = 0; i < list.length; i += CONC) {
    const res = await Promise.all(list.slice(i, i + CONC).map(fetchOne));
    items.push(...res);
  }
  return { configured: true, items, scanned: list.length, total: keys.length, capped };
}

// Récupère la description d'UN seul ticket, à la demande (ouverture d'un ticket).
export async function fetchIssueDescription(key) {
  if (!isConfigured() || !key) return "";
  const url = `${BASE_URL}/rest/api/3/issue/${encodeURIComponent(key)}?fields=description`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
    if (!res.ok) return "";
    const data = await res.json();
    return adfToText(data.fields?.description).trim().slice(0, 4000);
  } catch {
    return "";
  }
}

// Pour la fiche développeur : sur ses tickets ACTIFS, combien d'heures CE dev a saisi,
// depuis quand il en est assigné, et sa dernière activité réelle. Appels à la demande.
export async function fetchDevWork(devName, keys = []) {
  if (!isConfigured() || !devName || !keys.length) return { configured: isConfigured(), items: [] };
  const dn = String(devName).trim().toLowerCase();
  const out = [];
  for (const key of keys.slice(0, 10)) {
    try {
      const a = await fetchIssueActivity(key);
      let sec = 0, lastWork = null;
      (a.worklogs || []).forEach((w) => {
        if (String(w.who || "").trim().toLowerCase() === dn) {
          sec += w.seconds || 0;
          if (w.date && (!lastWork || String(w.date) > String(lastWork))) lastWork = w.date;
        }
      });
      let since = null;
      (a.timeline || []).forEach((t) => {
        if (t.champ === "Assigné" && String(t.to || "").trim().toLowerCase() === dn) {
          if (!since || String(t.date) > String(since)) since = t.date;
        }
      });
      out.push({ cle: key, heuresDevSec: sec, heuresDev: fmtSeconds(sec), depuisAssigne: since, derniereActivite: lastWork, totalTime: a.totalTime });
    } catch {
      out.push({ cle: key, heuresDevSec: 0, heuresDev: "0h", depuisAssigne: null, derniereActivite: null, totalTime: "0h" });
    }
  }
  return { configured: true, items: out };
}

// Pour les NOTIFICATIONS : sur les tickets modifiés, renvoie le dernier évènement réel
// (qui a changé quoi, ou qui a saisi du temps, et quand) — même source que "Historique & temps".
export async function fetchChangesSummary(keys = []) {
  if (!isConfigured() || !keys.length) return { configured: isConfigured(), items: [] };
  const out = [];
  for (const key of keys.slice(0, 8)) {
    try {
      const a = await fetchIssueActivity(key);
      const tl = (a.timeline && a.timeline[0]) || null;
      const wl = (a.worklogs && a.worklogs[0]) || null;
      const cand = [];
      if (tl) cand.push({ kind: "change", date: tl.date, who: tl.who, text: `${tl.champ} : ${tl.from} → ${tl.to}` });
      if (wl) cand.push({ kind: "time", date: wl.date, who: wl.who, text: `a saisi ${wl.time}` });
      cand.sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
      const e = cand[0];
      out.push(e
        ? { cle: key, who: e.who, action: e.text, kind: e.kind, at: e.date }
        : { cle: key, who: "", action: "Mis à jour", kind: "update", at: null });
    } catch {
      out.push({ cle: key, who: "", action: "Mis à jour", kind: "update", at: null });
    }
  }
  return { configured: true, items: out };
}

// CRA — Compte rendu d'activité : consolide les temps saisis (worklogs Jira) sur une période,
// par projet/client ET par personne. C'est la matière du « qui a fait quoi, sur quel projet, combien de temps ».
// Honnêteté : ne reflète QUE les temps réellement saisis dans Jira (pas de temps inventé).
async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    const res = await Promise.all(items.slice(i, i + limit).map(fn));
    out.push(...res);
  }
  return out;
}

export async function fetchCRA({ start, end } = {}) {
  if (!isConfigured()) throw new Error("Jira non configuré : renseigne JIRA_BASE_URL, JIRA_EMAIL et JIRA_API_TOKEN.");
  if (!start || !end) return { start, end, byPerson: [], byProject: [], totalSeconds: 0, totalTime: "0h", scanned: 0, total: 0, capped: false };

  // 1) Tickets ayant AU MOINS un temps saisi dans la période (JQL worklogDate).
  const jql = `worklogDate >= "${start}" AND worklogDate <= "${end}" ORDER BY updated DESC`;
  const issues = await searchIssues(jql); // déjà normalisés (cle, dossier, resume, statut, categorie…)
  const CAP = 150; // garde-fou : on plafonne le nombre de tickets scannés pour le détail des worklogs
  const capped = issues.length > CAP;
  const scan = issues.slice(0, CAP);

  // 2) Pour chaque ticket, on récupère ses worklogs (en parallèle par lots) et on ne garde que ceux de la période.
  const headers = { Authorization: authHeader(), Accept: "application/json" };
  const inRange = (iso) => { if (!iso) return false; const d = String(iso).slice(0, 10); return d >= start && d <= end; };
  const rows = await mapLimit(scan, 8, async (it) => {
    let data = null;
    try { const r = await fetch(`${BASE_URL}/rest/api/3/issue/${encodeURIComponent(it.cle)}/worklog`, { headers }); if (r.ok) data = await r.json(); } catch { /* ignore */ }
    const wls = ((data && data.worklogs) || [])
      .filter((w) => inRange(w.started || w.created))
      .map((w) => ({ who: w.author?.displayName || "—", seconds: w.timeSpentSeconds || 0, date: w.started || w.created || null }))
      .filter((w) => w.seconds > 0);
    return { it, wls };
  });

  // 3) Agrégation par personne et par projet.
  const personMap = {}; // who -> { who, seconds, projects: { dossier: { dossier, seconds, tickets: {cle:{...}} } } }
  const projectMap = {}; // dossier -> { dossier, seconds, persons: {who:sec}, tickets: {cle:{...}} }
  let totalSeconds = 0;
  for (const { it, wls } of rows) {
    const dossier = it.dossier || it.projet || "Autre";
    for (const w of wls) {
      totalSeconds += w.seconds;
      // par personne
      const P = (personMap[w.who] ||= { who: w.who, seconds: 0, projects: {} });
      P.seconds += w.seconds;
      const PP = (P.projects[dossier] ||= { dossier, seconds: 0, tickets: {} });
      PP.seconds += w.seconds;
      const PT = (PP.tickets[it.cle] ||= { cle: it.cle, resume: it.resume, statut: it.statut, statutJira: it.statutJira, done: DONE_CATS.includes(it.categorie), seconds: 0 });
      PT.seconds += w.seconds;
      // par projet
      const J = (projectMap[dossier] ||= { dossier, seconds: 0, persons: {}, tickets: {} });
      J.seconds += w.seconds;
      J.persons[w.who] = (J.persons[w.who] || 0) + w.seconds;
      const JT = (J.tickets[it.cle] ||= { cle: it.cle, resume: it.resume, statut: it.statut, statutJira: it.statutJira, done: DONE_CATS.includes(it.categorie), seconds: 0, who: {} });
      JT.seconds += w.seconds;
      JT.who[w.who] = (JT.who[w.who] || 0) + w.seconds;
    }
  }

  const tList = (tk) => Object.values(tk).sort((a, b) => b.seconds - a.seconds).map((t) => ({ ...t, time: fmtSeconds(t.seconds), who: t.who ? Object.keys(t.who) : undefined }));
  const byPerson = Object.values(personMap).map((p) => ({
    who: p.who, seconds: p.seconds, time: fmtSeconds(p.seconds),
    projects: Object.values(p.projects).sort((a, b) => b.seconds - a.seconds)
      .map((pr) => ({ dossier: pr.dossier, seconds: pr.seconds, time: fmtSeconds(pr.seconds), tickets: tList(pr.tickets) })),
  })).sort((a, b) => b.seconds - a.seconds);
  const byProject = Object.values(projectMap).map((pr) => ({
    dossier: pr.dossier, seconds: pr.seconds, time: fmtSeconds(pr.seconds),
    persons: Object.entries(pr.persons).map(([who, sec]) => ({ who, seconds: sec, time: fmtSeconds(sec) })).sort((a, b) => b.seconds - a.seconds),
    tickets: tList(pr.tickets),
  })).sort((a, b) => b.seconds - a.seconds);

  return { start, end, totalSeconds, totalTime: fmtSeconds(totalSeconds), byPerson, byProject, scanned: scan.length, total: issues.length, capped };
}
