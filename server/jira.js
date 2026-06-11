// jira.js — accès à l'API REST de Jira Cloud (recherche enrichie JQL).
// Le jeton ne quitte JAMAIS le serveur : il est lu depuis les variables d'environnement.

import { dossierFromKey, bucketFromStatus, categoryFromStatus, devFromIssue, contributorsFromIssue, ME } from "./config.js";

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

  do {
    const body = { jql, maxResults: 100, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira a répondu ${res.status} : ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    (data.issues || []).forEach((it) => issues.push(normalize(it)));
    nextPageToken = data.isLast ? undefined : data.nextPageToken;
    guard += 1;
  } while (nextPageToken && guard < MAX_PAGES);

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
    resume: summary,
    assigne,
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
