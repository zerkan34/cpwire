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
// Priorité : la personne assignée Jira. Repli : un nom "Prénom Nom" en fin de
// titre entre parenthèses (cas des projets de réécriture où le dev est dans le résumé).
const NAME_IN_TITLE = /\(([A-ZÀ-Ÿ][\p{L}'’.\-]*(?:\s[A-ZÀ-Ÿ][\p{L}'’.\-]*)+)\)\s*$/u;
export function devFromIssue(assignee = "", summary = "") {
  if (assignee && assignee !== "Non assigné") return assignee;
  const m = String(summary || "").match(NAME_IN_TITLE);
  return m ? m[1].trim() : "Non assigné";
}
