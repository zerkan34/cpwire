// personnes.js — normalisation de l'affichage des noms dans les récaps/listes/tableaux.
//
// 1) Table de correction éditable (server/personnes.json) : nom Jira EXACT -> nom voulu "Prénom Nom".
//    Sert à corriger l'ordre ET l'orthographe, et les cas que l'automatique ne sait pas trancher.
// 2) À défaut, redressement AUTOMATIQUE prudent : si un nom de 2 mots est clairement "Nom Prénom"
//    (2e mot = prénom connu, 1er mot = pas un prénom), on remet le prénom devant.
//
// La table gagne toujours sur l'automatique. Aucune invention : on ne touche qu'aux cas sûrs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = process.env.PERSONNES_JSON || path.join(__dirname, "personnes.json");

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

let ALIAS = {}; // norm(nom Jira) -> "Prénom Nom"
try {
  if (fs.existsSync(JSON_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) || {};
    const src = cfg.alias || {};
    for (const k of Object.keys(src)) if (k[0] !== "_") ALIAS[norm(k)] = src[k];
    console.log(`[personnes] ${Object.keys(ALIAS).length} correction(s) de nom chargée(s) depuis ${JSON_PATH}`);
  } else {
    console.log(`[personnes] aucune table (${JSON_PATH} absent) — redressement automatique seul.`);
  }
} catch (e) { console.log(`[personnes] erreur de chargement : ${e.message}`); }

// Prénoms (équipe + courants FR) pour détecter une inversion. Large mais prudent.
const FIRST_NAMES = new Set([
  "bastien", "ines", "quentin", "hamza", "enzo", "geoffrey", "ludovic", "mathieu", "matthieu", "steven",
  "mohammed", "nicolas", "sylvain", "lionel", "laurent", "sandrine", "jaimie", "alice", "ismahen",
  "alexandre", "alexis", "antoine", "arnaud", "arthur", "aurelien", "benjamin", "benoit", "bernard", "brice",
  "camille", "cedric", "charles", "christophe", "clement", "corentin", "cyril", "damien", "david", "denis",
  "didier", "dimitri", "dominique", "dylan", "edouard", "emilie", "emma", "eric", "fabien", "fabrice", "florent",
  "florian", "francois", "frederic", "gabriel", "gael", "gauthier", "gilles", "gregory", "guillaume", "gwenael",
  "hugo", "jacques", "jean", "jeremy", "jerome", "jonathan", "jordan", "julien", "julie", "kevin", "leo", "loic", "louis",
  "lucas", "ludivine", "manon", "marc", "marie", "martin", "mathis", "maxime", "melanie", "michel", "morgan",
  "nathan", "olivier", "pascal", "patrice", "patrick", "paul", "philippe", "pierre",
  "raphael", "remi", "romain", "sebastien", "simon", "sophie", "stephane", "theo", "thibault", "thomas", "tom",
  "valentin", "vincent", "william", "xavier", "yann", "yannick", "yoann", "aurore", "caroline", "celine", "claire",
  "elodie", "laura", "laetitia", "margaux", "sarah", "virginie",
]);

const isFirst = (w) => FIRST_NAMES.has(norm(w));

export function displayName(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return s;
  const hit = ALIAS[norm(s)];
  if (hit) return hit;
  const parts = s.split(" ");
  // 2 mots clairement à l'envers : "Nom Prénom" -> "Prénom Nom"
  if (parts.length === 2 && isFirst(parts[1]) && !isFirst(parts[0])) return `${parts[1]} ${parts[0]}`;
  return s;
}
