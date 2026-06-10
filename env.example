// jira.js — accès à l'API REST de Jira Cloud (recherche enrichie JQL).
// Le jeton ne quitte JAMAIS le serveur : il est lu depuis les variables d'environnement.

import { dossierFromKey, bucketFromStatus, categoryFromStatus, devFromIssue, ME } from "./config.js";

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
  "labels",
  "description",
];

// Appelle l'endpoint de recherche enrichie et suit la pagination jusqu'au bout.
export async function searchIssues(jql) {
  if (!isConfigured()) {
    throw new Error(
      "Jira non configuré : renseigne JIRA_BASE_URL, JIRA_EMAIL et JIRA_API_TOKEN dans server/.env"
    );
  }

  const url = `${BASE_URL}/rest/api/3/search/jql`;
  const issues = [];
  let nextPageToken;
  let guard = 0;
  const MAX_PAGES = 2000;

  do {
    const body = { jql, maxResults: 100, fields: FIELDS };
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
  const flagged = Boolean(f.flagged); // certaines instances exposent le drapeau "Impediment"
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
    dev: devFromIssue(assigne, summary), // dév responsable (assigné, sinon nom en fin de titre)
    priorite: f.priority?.name || "",
    statutJira: statusName,
    statut, // Bloqué / À faire / En cours / Terminé (grossier, pour le cockpit)
    categorie: categoryFromStatus(statusName), // fin : afaire/encours/recetteArmonie/recetteClient/miseEnProd/termine…
    echeance: f.duedate || null,
    enRetard,
    descriptionText: adfToText(f.description).trim().slice(0, 4000),
    maj: f.updated || null,
    url: `${BASE_URL}/browse/${it.key}`,
  };
}
