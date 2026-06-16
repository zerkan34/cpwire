// connaissance.js — Mémoire d'équipe : ce que l'assistant doit savoir sur votre façon
// de travailler et sur chaque client. Lue à CHAQUE génération de rapport (donc l'IA en tient
// compte), elle s'enrichit dans le temps.
//
// PERSISTANCE (important) : le SOCLE ci-dessous est versionné dans le code → jamais perdu.
// Les ajouts faits dans l'app sont écrits dans le dossier de données (paths.js) : effectifs
// tout de suite, mais réinitialisés au redéploiement sur Render gratuit. Le bouton « Exporter »
// permet de récupérer le JSON pour le re-committer (ou définir un disque persistant via DATA_DIR).

import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";

const DIR = dataDir();
const FILE = path.join(DIR, "connaissance.json");

// ---- SOCLE VERSIONNÉ (toujours présent) -----------------------------------
const SEED = {
  global: {
    // Règles de rédaction et de travail que l'assistant doit TOUJOURS respecter.
    conventions: [
      "Registre : français professionnel, senior, concis. Vouvoyer le client.",
      "Signer les comptes rendus « Nicolas Durand, chef de projet ».",
      "Toujours séparer le périmètre TMA (maintenance courante) du périmètre Projet.",
      "Ne jamais inventer de chiffre, de statut ni de nom : s'appuyer uniquement sur les données Jira.",
      "Un nom listé comme intervenant/assigné d'un ticket est un développeur Armonie.",
    ],
    // Glossaire transverse (terme → sens).
    glossaire: [
      { terme: "TMA", sens: "Tierce Maintenance Applicative — maintenance courante sous contrat." },
      { terme: "Mode projet", sens: "Engagement projet (lots, jalons), distinct de la TMA." },
      { terme: "CR", sens: "Compte rendu." },
      { terme: "COPIL", sens: "Comité de pilotage." },
    ],
  },
  // Mémoire par client (clé = nom de dossier affiché). « attentes » à compléter par vos soins.
  clients: {
    EDL: {
      contexte: "École des Loisirs — abonnements de livres jeunesse. Application MAX sur IBM i.",
      attentes: ["À préciser : livrables et délais attendus côté EDL."],
      glossaire: [{ terme: "animateur / animatrice", sens: "Commercial CÔTÉ CLIENT EDL (force de vente). JAMAIS un développeur Armonie." }],
      notes: [],
    },
    "DS Smith": {
      contexte: "DS Smith Packaging — emballage carton de luxe. Application eMage (gestion industrielle) sur IBM i.",
      attentes: ["À préciser : livrables et délais attendus côté DS Smith."],
      glossaire: [],
      notes: [],
    },
    Tafanel: {
      contexte: "Tafanel — engagement en MODE PROJET (à ne pas présenter comme de la TMA).",
      attentes: ["À préciser : lots, jalons et livrables attendus."],
      glossaire: [],
      notes: [],
    },
    Bellion: {
      contexte: "Groupe Bellion / Belmet — projet ERP 2026, module Gestion Commerciale (GesCo).",
      attentes: ["À préciser : périmètre de recette et jalons COPIL."],
      glossaire: [],
      notes: [],
    },
    IMA: {
      contexte: "IMA — TMA, périmètres Dataware / MCS sur IBM i.",
      attentes: ["À préciser : SLA et livrables contractuels."],
      glossaire: [],
      notes: [],
    },
    DIAPAR: {
      contexte: "DIAPAR — grossiste alimentaire. Gestion commerciale (GC) sur IBM i, interface compta ANAEL.",
      attentes: ["À préciser : livrables et délais attendus."],
      glossaire: [],
      notes: [],
    },
    Balas: {
      contexte: "Groupe Balas.",
      attentes: ["À préciser."],
      glossaire: [],
      notes: [],
    },
  },
};

function ensure() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(SEED, null, 2));
  } catch (e) { console.error("[connaissance] init impossible:", e.message); }
}

// Fusion non destructive : complète l'enregistré avec les nouveautés du socle, sans écraser vos ajouts.
function mergeSeed(saved) {
  const out = { global: { ...SEED.global, ...(saved.global || {}) }, clients: { ...(saved.clients || {}) } };
  // conventions/glossaire global : on garde l'enregistré s'il existe, sinon le socle.
  out.global.conventions = (saved.global && saved.global.conventions) || SEED.global.conventions;
  out.global.glossaire = (saved.global && saved.global.glossaire) || SEED.global.glossaire;
  for (const k of Object.keys(SEED.clients)) {
    out.clients[k] = { ...SEED.clients[k], ...(out.clients[k] || {}) };
  }
  return out;
}

export function readConnaissance() {
  ensure();
  try { return mergeSeed(JSON.parse(fs.readFileSync(FILE, "utf-8"))); }
  catch { return JSON.parse(JSON.stringify(SEED)); }
}

export function saveConnaissance(data) {
  const safe = {
    global: {
      conventions: Array.isArray(data?.global?.conventions) ? data.global.conventions.map(String).filter(Boolean) : SEED.global.conventions,
      glossaire: Array.isArray(data?.global?.glossaire) ? data.global.glossaire.filter((g) => g && g.terme).map((g) => ({ terme: String(g.terme), sens: String(g.sens || "") })) : SEED.global.glossaire,
    },
    clients: {},
  };
  const src = data?.clients || {};
  for (const k of Object.keys(src)) {
    const c = src[k] || {};
    safe.clients[k] = {
      contexte: String(c.contexte || ""),
      attentes: Array.isArray(c.attentes) ? c.attentes.map(String).filter(Boolean) : [],
      glossaire: Array.isArray(c.glossaire) ? c.glossaire.filter((g) => g && g.terme).map((g) => ({ terme: String(g.terme), sens: String(g.sens || "") })) : [],
      notes: Array.isArray(c.notes) ? c.notes.map(String).filter(Boolean) : [],
    };
  }
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(safe, null, 2)); }
  catch (e) { console.error("[connaissance] écriture impossible:", e.message); }
  return mergeSeed(safe);
}

// Bloc texte injecté dans les prompts IA. `dossier` = nom de dossier affiché (ex. "EDL").
export function knowledgeForPrompt(dossier) {
  const k = readConnaissance();
  const lines = ["\n\nMÉMOIRE D'ÉQUIPE — à respecter impérativement :"];
  if (k.global.conventions?.length) lines.push("Conventions : " + k.global.conventions.map((c) => `(${c})`).join(" "));
  if (k.global.glossaire?.length) lines.push("Glossaire : " + k.global.glossaire.map((g) => `${g.terme} = ${g.sens}`).join(" ; "));
  const c = k.clients[dossier];
  if (c) {
    if (c.contexte) lines.push(`Client ${dossier} — contexte : ${c.contexte}`);
    if (c.attentes?.length) lines.push(`Attentes ${dossier} : ${c.attentes.join(" ; ")}`);
    if (c.glossaire?.length) lines.push(`Vocabulaire ${dossier} : ` + c.glossaire.map((g) => `${g.terme} = ${g.sens}`).join(" ; "));
    if (c.notes?.length) lines.push(`Notes ${dossier} : ${c.notes.join(" ; ")}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}
