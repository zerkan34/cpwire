// config.js — paramétrage métier du cockpit CPwire.

export const DOSSIERS = {
  TEDL: "EDL", PEM: "EDL",
  TDSS: "DS Smith", PDFP: "DS Smith",
  TMT: "Tafanel", PTAF: "Tafanel",
  TBEL: "Bellion",
  TBAL: "Balas", PBAL: "Balas",
  TIMA: "IMA", PIMA: "IMA", PIMA2: "IMA",
  TDIA: "DIAPAR",
};

export const ME = process.env.ME || "Nicolas Durand";
export const TARGET_DONE = process.env.TARGET_DONE || "Terminé";

export function dossierFromKey(key = "") {
  const k = String(key).toUpperCase();
  for (const prefix of Object.keys(DOSSIERS)) if (k.startsWith(prefix)) return DOSSIERS[prefix];
  const m = k.match(/^[A-Z]+/);
  return (m && DOSSIERS[m[0]]) || "Autre";
}

// Type d'engagement par préfixe de projet Jira : "TMA" (projets T…) ou "Projet" (projets P…).
// C'est la convention Armonie par défaut. Les exceptions connues sont déclarées ici
// (ex. Tafanel = mode Projet) et on peut tout corriger via la variable d'environnement
// ENGAGEMENT_MAP="TMT:Projet,PEM:TMA,…" sans toucher au code.
export const ENGAGEMENT_BY_PREFIX = {
  TMT: "Projet", PTAF: "Projet", // Tafanel : mode Projet (ce n'est pas de la TMA)
};
(function () {
  String(process.env.ENGAGEMENT_MAP || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const i = pair.indexOf(":");
    if (i > 0) { const p = pair.slice(0, i).trim().toUpperCase(); const v = pair.slice(i + 1).trim(); if (p && v) ENGAGEMENT_BY_PREFIX[p] = v; }
  });
})();

// Déduit l'engagement d'un ticket depuis sa clé : exception explicite d'abord (préfixe le plus
// long en premier), sinon convention P…→Projet, T…→TMA.
export function engagementFromKey(key = "") {
  const k = String(key).toUpperCase();
  for (const p of Object.keys(ENGAGEMENT_BY_PREFIX).sort((a, b) => b.length - a.length)) if (k.startsWith(p)) return ENGAGEMENT_BY_PREFIX[p];
  if (/^P/.test(k)) return "Projet";
  if (/^T/.test(k)) return "TMA";
  return "—";
}

// --- Normalisation des statuts Jira -------------------------------------
// Enlève accents + minuscule, pour comparer sans se soucier de la casse.
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Statuts RÉELS du workflow Armonie -> catégorie interne.
// >>> Si un statut est renommé dans Jira, ajuste juste la clé ici. <<<
const STATUS_CATEGORY = {
  "a faire": "afaire",
  "en cours": "encours",
  "retour test": "retourTest",
  "retour production": "retourProd",
  "recette armonie": "recetteArmonie",
  "recette client": "recetteClient",
  "en attente client": "attenteClient",
  "mise en production": "miseEnProd",
  "termine": "termine",
  "annule": "annule",
};

// Catégorie d'un statut (avec repli heuristique pour tout statut inconnu).
export function categoryFromStatus(statusName = "") {
  const n = norm(statusName);
  if (STATUS_CATEGORY[n]) return STATUS_CATEGORY[n];
  if (/(annul|cancel)/.test(n)) return "annule";
  if (/mise en prod|en production/.test(n)) return "miseEnProd";
  if (/retour.*prod/.test(n)) return "retourProd";
  if (/retour.*test/.test(n)) return "retourTest";
  if (/recette.*client/.test(n)) return "recetteClient";
  if (/recette/.test(n)) return "recetteArmonie";
  if (/attente.*client/.test(n)) return "attenteClient";
  if (/(termin|fait|done|closed|resolu|clos|ferm)/.test(n)) return "termine";
  if (/(en cours|in progress|doing|revue|review|test)/.test(n)) return "encours";
  return "afaire";
}

// Vrai si le statut est mappé EXPLICITEMENT (pas via repli heuristique) — sert au contrôle d'exactitude.
export function statusIsExplicit(name = "") {
  return Object.prototype.hasOwnProperty.call(STATUS_CATEGORY, norm(name));
}

// Libellés lisibles par catégorie (pour les rapports et l'onglet Développeurs).
export const CATEGORY_LABEL = {
  afaire: "À faire",
  encours: "En cours",
  retourTest: "Retour test",
  retourProd: "Retour production",
  recetteArmonie: "Recette Armonie",
  recetteClient: "Recette client",
  attenteClient: "En attente client",
  miseEnProd: "Mise en production",
  termine: "Terminé",
  annule: "Annulé",
};

// Regroupement des catégories pour la ligne de synthèse du CR journalier.
export const RESTE_CATS = ["afaire", "encours", "retourTest", "retourProd"];
export const ACTIVE_CATS = ["encours", "retourTest", "retourProd"]; // tickets en cours de traitement
export const DONE_CATS = ["termine", "miseEnProd"];

// Catégorie -> bucket grossier (KPI/filtre du cockpit : 4 colonnes historiques).
const CAT_BUCKET = {
  afaire: "À faire",
  encours: "En cours", retourTest: "En cours", retourProd: "En cours",
  recetteArmonie: "En cours", recetteClient: "En cours", attenteClient: "En cours",
  miseEnProd: "Terminé", termine: "Terminé", annule: "Terminé",
};

export function bucketFromStatus(statusName = "", _statusCategoryKey = "", flagged = false, labels = []) {
  // "Bloqué" = uniquement un vrai drapeau/impediment (le workflow Armonie n'a pas de statut "Bloqué").
  const isBlocked = flagged || (labels || []).some((l) => /bloqu|blocked|impediment/i.test(l));
  if (isBlocked) return "Bloqué";
  return CAT_BUCKET[categoryFromStatus(statusName)] || "À faire";
}

export const STATUTS = ["Bloqué", "À faire", "En cours", "Terminé"];

// --- Identification du développeur --------------------------------------
// Un ticket peut impliquer plusieurs personnes. On retient :
//  1) la personne ASSIGNÉE dans Jira (auto-assignation comprise) ;
//  2) un nom « (Prénom Nom) » écrit en fin de titre (projets de réécriture) ;
//  3) les INITIALES présentes dans les ÉTIQUETTES (labels) Jira — ex. « HRE » -> Hamza.
//
// >>> Table des initiales d'étiquette -> nom EXACT du dev (tel qu'affiché dans Jira). <<<
//     À compléter pour chaque dév. Surchargée par la variable d'env DEV_LABELS
//     au format "HRE:Hamza Rebai,GPI:Guillaume Pizard".
function parseDevLabels(str) {
  if (!str) return null;
  const o = {};
  String(str).split(/[;,]/).forEach((pair) => {
    const idx = pair.indexOf(":");
    if (idx > 0) {
      const code = pair.slice(0, idx).trim().toUpperCase();
      const name = pair.slice(idx + 1).trim();
      if (code && name) o[code] = name;
    }
  });
  return Object.keys(o).length ? o : null;
}
// Table par défaut déduite de la convention observée dans vos étiquettes Jira :
// 1re lettre du prénom + 2 premières lettres du nom (ex. GPI = Guillaume Pizard, HRE = Hamza Rebai).
// Surchargeable intégralement par la variable d'env DEV_LABELS ("HRE:Hamza Rebai,SCR:Steven Crugeon").
export const DEV_LABELS = parseDevLabels(process.env.DEV_LABELS) || {
  HRE: "Hamza Rebai", SCR: "Steven Crugeon", GPI: "Guillaume Pizard", MPR: "Mathieu Prie",
  BPA: "Bastien Pavageau", IGH: "Inès Ghamgui", LCH: "Léo Charrier", FAN: "Fetra Andriamahaly",
  EPI: "Erik Pillere", GBO: "Geoffrey Bourmond", GGA: "Geoffrey Gambée", JVE: "Joshua Vegas",
  VNG: "Vantai Nguyen", LGU: "Léo Gualano", MME: "Maamar Meziane", AEL: "Abdelaziz El Kaddari",
  LSA: "Ludovic Sagnal", MAD: "Michael Adjedj", TMA: "Thomas Malavieille", PAG: "Pedram Aguiard",
  TNO: "Tony Noel", CCH: "Cyrille Chassange", TKI: "Tania Kicien", MAN: "Marie Antoine Samy",
  RDA: "Reda Dahmane", GCH: "Gaëtan Chaugny", HFR: "Henry Franceschi", COI: "Clément Oiry",
  AQU: "Adrien Quillère",
};

const NAME_IN_TITLE = /\(([A-ZÀ-Ÿ][\p{L}'’.\-]*(?:\s[A-ZÀ-Ÿ][\p{L}'’.\-]*)+)\)\s*$/u;

// Renvoie un nom de dév depuis une étiquette, si elle correspond à un code connu.
function devFromLabel(label = "") {
  const code = String(label || "").trim().toUpperCase();
  return DEV_LABELS[code] || null;
}

// Dév « principal » (1 par ticket) : assigné, sinon nom en titre, sinon 1re étiquette connue.
export function devFromIssue(assignee = "", summary = "", labels = []) {
  if (assignee && assignee !== "Non assigné") return assignee;
  const m = String(summary || "").match(NAME_IN_TITLE);
  if (m) return m[1].trim();
  for (const l of labels || []) { const n = devFromLabel(l); if (n) return n; }
  return "Non assigné";
}

// TOUS les contributeurs d'un ticket (assigné + nom en titre + initiales en étiquette).
// C'est cette liste qui sert à compter les tickets « travaillés » par dév.
export function contributorsFromIssue(assignee = "", summary = "", labels = []) {
  const out = [];
  const seen = new Set();
  const add = (n) => {
    const v = String(n || "").trim();
    if (!v || v === "Non assigné") return;
    const k = v.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(v);
  };
  if (assignee) add(assignee);
  const m = String(summary || "").match(NAME_IN_TITLE);
  if (m) add(m[1].trim());
  (labels || []).forEach((l) => { const n = devFromLabel(l); if (n) add(n); });
  return out;
}
