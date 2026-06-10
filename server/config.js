// config.js — paramétrage métier du cockpit.

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

export function bucketFromStatus(statusName = "", statusCategoryKey = "", flagged = false, labels = []) {
  const name = String(statusName).toLowerCase();
  const isBlocked = flagged || /bloqu|blocked|on hold|en attente/.test(name) ||
    (labels || []).some((l) => /bloqu|blocked|impediment/i.test(l));
  if (isBlocked) return "Bloqué";
  switch (statusCategoryKey) {
    case "done": return "Terminé";
    case "indeterminate": return "En cours";
    case "new": return "À faire";
    default:
      if (/(termin|fait|done|closed|résolu|resolu|clos|ferm)/.test(name)) return "Terminé";
      if (/(en cours|in progress|doing|review|revue|recette|test)/.test(name)) return "En cours";
      return "À faire";
  }
}

export const STATUTS = ["Bloqué", "À faire", "En cours", "Terminé"];
