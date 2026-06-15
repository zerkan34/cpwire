// programmes.js — Référentiel des programmes : OÙ vit chaque programme côté IBM i
// (bibliothèque, fichier/membre source, type, version, dernière compilation).
//
// SOURCE : un export Arcad (ou une extraction SQL IBM i) déposé dans server/data/programmes.csv.
// Chargé au démarrage, en mémoire. Pour rafraîchir : remplacer le fichier et redéployer.
//
// Le ticket Jira ne contient PAS la localisation — seulement le nom du programme dans le titre
// (« Réécriture ACHVTE … » → ACHVTE). Ce module fait le pont : il repère le programme dans le
// titre et renvoie sa localisation depuis le référentiel.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = process.env.PROGRAMMES_CSV || path.join(__dirname, "data", "programmes.csv");

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// En-têtes acceptés (tolérant aux noms de colonnes de l'export Arcad / SQL).
const FIELD_SYNONYMS = {
  name:      ["programme", "program", "objet", "object", "nom", "name", "composant", "component", "pgm"],
  lib:       ["bibliotheque", "biblio", "library", "lib", "objlib", "library_name", "obj_lib"],
  srcFile:   ["fichier_source", "fichier source", "source_file", "srcfile", "fichier", "sourcefile", "src_pf", "srcpf"],
  srcMember: ["membre_source", "membre source", "source_member", "srcmbr", "member", "membre", "source_mbr", "src_mbr"],
  type:      ["type", "objtype", "langage", "language", "attribut", "attribute", "srctype", "src_type"],
  version:   ["version", "niveau", "level", "release", "etat_arcad", "statut_arcad"],
  compile:   ["derniere_compil", "derniere compilation", "compile", "compiled", "date_compil", "creation", "last_compile", "objcreated", "date_creation"],
  text:      ["texte", "text", "description", "objtext", "libelle", "commentaire", "comment"],
};

// --- Parseur CSV minimal : gère guillemets, "" échappés, et détecte ; ou , comme séparateur. ---
function parseCSV(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
  const nl = text.indexOf("\n");
  const head = nl >= 0 ? text.slice(0, nl) : text;
  const delim = (head.split(";").length > head.split(",").length) ? ";" : ",";
  const rows = []; let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

function buildCatalog(rows) {
  if (!rows.length) return { map: new Map(), count: 0 };
  const header = rows[0].map(norm);
  const colOf = {};
  for (const [field, syns] of Object.entries(FIELD_SYNONYMS)) {
    let idx = -1;
    for (const s of syns) { idx = header.indexOf(norm(s)); if (idx >= 0) break; }
    colOf[field] = idx;
  }
  const map = new Map();
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const get = (f) => (colOf[f] >= 0 ? String(cols[colOf[f]] || "").trim() : "");
    const name = (get("name") || get("srcMember")).toUpperCase();
    if (!name) continue;
    map.set(name, {
      name,
      lib: get("lib"),
      srcFile: get("srcFile"),
      srcMember: get("srcMember") || name,
      type: get("type"),
      version: get("version"),
      compile: get("compile"),
      text: get("text"),
      found: true,
    });
  }
  return { map, count: map.size };
}

let CATALOG = { map: new Map(), count: 0 };
try {
  if (fs.existsSync(CSV_PATH)) {
    CATALOG = buildCatalog(parseCSV(fs.readFileSync(CSV_PATH, "utf8")));
    console.log(`[programmes] référentiel chargé : ${CATALOG.count} programme(s) depuis ${CSV_PATH}`);
  } else {
    console.log(`[programmes] aucun référentiel (${CSV_PATH} absent) — fonctionnalité dormante.`);
  }
} catch (e) { console.log(`[programmes] erreur de chargement : ${e.message}`); }

const VERBS = new Set(["reecriture", "reecrit", "reecrire", "modification", "modif", "modifier", "creation", "creer", "correction", "corriger", "refonte", "ajout", "suppression", "analyse", "developpement", "dev", "mise", "migration", "portage", "evolution", "bug", "anomalie"]);

// Repère le programme cité dans le titre et renvoie sa localisation (ou un repère "à compléter").
export function findProgram(title) {
  const raw = String(title || "");
  if (!raw) return null;

  // 1) Correspondance avec le catalogue (la plus fiable) : on cherche un token connu.
  const tokens = raw.toUpperCase().match(/[A-Z0-9_]{3,}/g) || [];
  let best = null;
  for (const t of tokens) {
    const rec = CATALOG.map.get(t);
    if (rec && (!best || t.length > best.name.length)) best = rec;
  }
  if (best) return { ...best };

  // 2) Hors catalogue : on devine le nom du programme pour afficher "localisation à compléter".
  let guess = null;
  const words = raw.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (VERBS.has(norm(words[i]).replace(/[^a-z0-9]/g, ""))) {
      for (let j = i + 1; j < words.length; j++) {
        const nx = words[j].replace(/[^A-Za-z0-9_]/g, "");
        if (nx.length >= 3 && /[A-Z0-9]/.test(nx) && !VERBS.has(norm(nx))) { guess = nx.toUpperCase(); break; }
      }
      break;
    }
  }
  if (!guess) { const m = raw.match(/^([A-Z][A-Z0-9_]{2,9})\b/); if (m) guess = m[1]; }
  if (!guess) return null;
  return { name: guess, found: false, lib: "", srcFile: "", srcMember: "", type: "", version: "", compile: "", text: "" };
}

export function catalogStatus() { return { loaded: CATALOG.count > 0, count: CATALOG.count, path: CSV_PATH }; }
