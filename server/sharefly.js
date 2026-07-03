/* ============================================================
   ShareFly — module d'intégration pour cp|WIRE (Node/Express, ESM)
   ------------------------------------------------------------
   Sert la page ShareFly (statique, même origine que cp|WIRE)
   ET expose une petite API d'état PARTAGÉ entre utilisateurs :
     - journal des mouvements
     - rôles
   Montage (dans app.js) :  app.use(shareflyRouter);
   Page servie sur         :  /sharefly/
   API servie sur          :  /api/sharefly/*
   Persistance : DATA_DIR de cp|WIRE (survit si disque persistant),
   surchargeable via la variable d'env SHAREFLY_DATA.
   ============================================================ */
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dataDir } from "./paths.js";
import { readAll as readDossiers } from "./dossiers.js";
import { readConnaissance } from "./connaissance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const DATA_FILE = process.env.SHAREFLY_DATA || path.join(dataDir(), "sharefly.json");
let STATE = { mov: [], roles: [] };
try { if (fs.existsSync(DATA_FILE)) STATE = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) || STATE; } catch { /* démarrage à vide */ }

/* --- Catalogue documentaire (source de vérité PARTAGÉE) ---
   Base (14 333 docs, lecture seule, livrée) + OVERLAY des documents dérivés
   par cp|WIRE (persistant, surchargeable par env). Le catalogue servi = base+overlay,
   donc les docs cp|WIRE apparaissent automatiquement dans ShareFly. */
const CATALOGUE_FILE = process.env.SHAREFLY_CATALOGUE
  || path.join(__dirname, "public", "sharefly", "catalogue.json");
const OVERLAY_FILE = process.env.SHAREFLY_OVERLAY
  || path.join(dataDir(), "sharefly-derived.json");

let _base = null;        // docs de base (parsés, cache)
let _overlay = null;     // docs dérivés cp|WIRE (parsés, cache)
let _mergedText = null;  // JSON fusionné (cache)
let _mergedJs = null;    // wrapper JS fusionné (cache)

function baseDocs() {
  if (_base == null) { try { _base = JSON.parse(fs.readFileSync(CATALOGUE_FILE, "utf8")); } catch { _base = []; } }
  return _base;
}
function readOverlay() {
  if (_overlay == null) {
    try { _overlay = JSON.parse(fs.readFileSync(OVERLAY_FILE, "utf8")); } catch { _overlay = []; }
    if (!Array.isArray(_overlay)) _overlay = [];
  }
  return _overlay;
}
function writeOverlay(arr) {
  _overlay = Array.isArray(arr) ? arr : [];
  _mergedText = _mergedJs = null;   // invalide le cache fusionné
  try { fs.mkdirSync(path.dirname(OVERLAY_FILE), { recursive: true }); fs.writeFileSync(OVERLAY_FILE, JSON.stringify(_overlay)); }
  catch (e) { console.error("[sharefly] overlay non persisté:", e.message); }
}
function catalogueText() {
  if (_mergedText == null) _mergedText = JSON.stringify(baseDocs().concat(readOverlay()));
  return _mergedText;
}
function catalogueJs() {
  if (_mergedJs == null) _mergedJs = "window.DOCS=" + catalogueText() + ";";
  return _mergedJs;
}

/* --- Dérivation cp|WIRE -> ShareFly (Lot 1) ---
   Mapping dossier cp|WIRE -> index client ShareFly (window.CLIENTS),
   vérifié sur la liste des 15 clients. On ne dérive QUE pour un client existant. */
const CPWIRE_TO_CI = {
  "EDL": 2, "DS Smith": 4, "Tafanel": 1, "Bellion": 0, "Belmet": 0,
  "Balas": 3, "IMA": 5, "DIAPAR": 9, "Segurel": 8,
};
function memoireCount(c) {
  if (!c) return 0;
  let n = 0;
  if (c.contexte) n += 1;
  if (Array.isArray(c.attentes)) n += c.attentes.length;
  if (Array.isArray(c.notes)) n += c.notes.length;
  if (c.auto && Array.isArray(c.auto.points)) n += c.auto.points.length;
  if (Array.isArray(c.appris)) n += c.appris.length;
  return n;
}
// Construit les documents dérivés à partir des SEULES données réelles disponibles.
function deriveDocs({ jira } = {}) {
  const year = new Date().getFullYear();
  const at = new Date().toISOString();
  const dossiers = readDossiers() || {};
  const conn = readConnaissance() || { clients: {} };
  const out = [];
  const parClient = {};
  for (const key of Object.keys(dossiers)) {
    const ci = CPWIRE_TO_CI[key];
    if (ci == null) continue;                 // pas de client ShareFly correspondant : on n'invente rien
    const bucket = (parClient[key] = []);
    // 1) Fiche dossier — donnée réelle (dossiers.json)
    out.push({ n: `Fiche dossier — ${key}`, ci, k: "", e: "", x: "cp|WIRE", y: year, sp: "clients",
      p: `cp|WIRE/${key}/Fiche dossier — ${key}`, src: "cpwire", id: `cpwire:fiche:${key}`, at });
    bucket.push("fiche");
    // 2) Mémoire IA — seulement si contenu réel appris/saisi
    const cm = conn.clients && conn.clients[key];
    const nMem = memoireCount(cm);
    if (nMem > 0) {
      out.push({ n: `Mémoire IA — ${key} (${nMem} élément${nMem > 1 ? "s" : ""})`, ci, k: "", e: "", x: "cp|WIRE", y: year, sp: "clients",
        p: `cp|WIRE/${key}/Mémoire IA — ${key}`, src: "cpwire", id: `cpwire:memoire:${key}`, at });
      bucket.push("mémoire");
    }
    // 3) État Jira — seulement si comptages réels fournis (aucune invention)
    const jc = jira && jira[key];
    if (jc && jc.total != null) {
      const open = (jc.open != null) ? jc.open : "?";
      out.push({ n: `État Jira — ${key} (${open}/${jc.total} ouvert${open === 1 ? "" : "s"})`, ci, k: "", e: "", x: "cp|WIRE", y: year, sp: "clients",
        p: `cp|WIRE/${key}/État Jira — ${key}`, src: "cpwire", id: `cpwire:jira:${key}`, at });
      bucket.push("jira");
    }
  }
  return { out, parClient };
}

let _t = null;
function persist() {
  clearTimeout(_t);
  _t = setTimeout(() => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(STATE)); } catch { /* FS lecture seule : on garde en mémoire */ } }, 400);
}

router.use(express.json({ limit: "1mb" }));

/* --- Loader synchrone du catalogue pour la page ShareFly ---
   DOIT être déclaré AVANT le static, sinon express.static l'intercepte.
   Chargé par <script src="/sharefly/catalogue.js"> : exécution classique,
   donc window.DOCS est défini avant le script applicatif (ordre d'init intact). */
router.get("/sharefly/catalogue.js", (_req, res) => {
  res.type("application/javascript").send(catalogueJs());
});

/* --- Page ShareFly (fichier autonome) --- */
router.use("/sharefly", express.static(path.join(__dirname, "public", "sharefly")));

/* --- API état partagé --- */
router.get("/api/sharefly/state", (_req, res) => {
  res.json({ mov: STATE.mov.slice(0, 600), roles: STATE.roles });
});

/* --- API catalogue documentaire (lecture) : consommable par cp|WIRE --- */
router.get("/api/sharefly/catalogue", (_req, res) => {
  res.type("application/json").send(catalogueText());
});

/* --- Documents dérivés cp|WIRE actuellement dans l'overlay (inspection) --- */
router.get("/api/sharefly/derived", (_req, res) => {
  res.json(readOverlay());
});

/* --- Synchro cp|WIRE -> ShareFly : dérive les docs des sources réelles,
       les range sous le bon client, et trace au journal partagé.
       Body optionnel : { jira: { "<dossier>": { total, open } } } (comptages réels). */
router.post("/api/sharefly/sync", (req, res) => {
  const jira = (req.body && req.body.jira && typeof req.body.jira === "object") ? req.body.jira : null;
  const { out, parClient } = deriveDocs({ jira });
  writeOverlay(out);
  const entry = { t: Date.now(), who: "cp|WIRE", act: "sync-catalogue",
    detail: `${out.length} document(s) dérivé(s) vers ShareFly`, clients: Object.keys(parClient).length };
  STATE.mov.unshift(entry);
  STATE.mov = STATE.mov.slice(0, 600);
  persist();
  res.json({
    ok: true, derived: out.length, parClient,
    jira: jira ? Object.keys(jira).length : 0,
    note: "Sources actives : fiche dossier + mémoire IA (toujours), état Jira (si comptages réels fournis). Livrables générés et imports : à brancher via hook d'enregistrement (Lot 3).",
  });
});

router.post("/api/sharefly/mov", (req, res) => {
  const e = req.body || {};
  if (!e.t) e.t = Date.now();
  STATE.mov.unshift(e);
  STATE.mov = STATE.mov.slice(0, 600);
  persist();
  res.json({ ok: true, count: STATE.mov.length });
});

router.put("/api/sharefly/roles", (req, res) => {
  STATE.roles = Array.isArray(req.body) ? req.body : [];
  persist();
  res.json({ ok: true });
});

/* --- Amorçage : dès le démarrage, dérive fiche + mémoire (sources toujours
   disponibles) pour que ShareFly montre immédiatement les entités cp|WIRE.
   Jira (comptages) et imports/livrables : brancher via hook (Lot 3). --- */
try { const { out } = deriveDocs({}); writeOverlay(out); }
catch (e) { console.error("[sharefly] amorçage dérivation:", e.message); }

export default router;
