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
import { listImports } from "./import.js";
import { listDeliverables, getDeliverable } from "./deliverables.js";
import { analyseCatalogue } from "./catalogueAnalyse.js";

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

/* --- Dérivation cp|WIRE -> ShareFly ---
   Mapping nom de client cp|WIRE -> index client ShareFly (window.CLIENTS),
   vérifié sur la liste des 15 clients. Tolère les variantes de nom (accents/casse). */
const CI_BY_NAME = {
  "edl": 2, "ecole des loisirs": 2,
  "tafanel": 1,
  "ds smith": 4, "dssmith": 4,
  "bellion": 0, "belmet": 0, "belmet groupe bellion": 0,
  "balas": 3,
  "ima": 5, "inter mutuelle assistance": 5, "inter mutuelles assistance": 5,
  "diapar": 9,
  "segurel": 8,
};
function ciOf(name) {
  const k = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[—–-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return CI_BY_NAME[k] != null ? CI_BY_NAME[k] : null;
}
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
// Compte par index client (ci) à partir d'une liste d'enregistrements réels.
function countByCi(list, getName) {
  const m = {};
  for (const e of (list || [])) {
    const ci = ciOf(getName(e));
    if (ci == null) continue;
    m[ci] = (m[ci] || 0) + 1;
  }
  return m;
}
// Construit les documents dérivés à partir des SEULES données réelles disponibles.
function deriveDocs({ jira } = {}) {
  const year = new Date().getFullYear();
  const at = new Date().toISOString();
  const dossiers = readDossiers() || {};
  const conn = readConnaissance() || { clients: {} };
  const impByCi = countByCi(safeCall(listImports), (e) => e.client || (e.proposal && e.proposal.client) || "");
  const delivsByCi = {};
  for (const e of safeCall(listDeliverables)) {
    const ci = ciOf(e.client); if (ci == null) continue;
    (delivsByCi[ci] || (delivsByCi[ci] = [])).push(e);
  }
  const out = [];
  const parClient = {};
  for (const key of Object.keys(dossiers)) {
    const ci = ciOf(key);
    if (ci == null) continue;                 // pas de client ShareFly correspondant : on n'invente rien
    const bucket = (parClient[key] = []);
    const push = (kind, n, id) => { out.push({ n, ci, k: "", e: "", x: "cp|WIRE", y: year, sp: "clients", p: `cp|WIRE/${key}/${n}`, src: "cpwire", id, at }); bucket.push(kind); };
    // 1) Fiche dossier — donnée réelle (dossiers.json)
    push("fiche", `Fiche dossier — ${key}`, `cpwire:fiche:${key}`);
    // 2) Mémoire IA — seulement si contenu réel
    const nMem = memoireCount(conn.clients && conn.clients[key]);
    if (nMem > 0) push("mémoire", `Mémoire IA — ${key} (${nMem} élément${nMem > 1 ? "s" : ""})`, `cpwire:memoire:${key}`);
    // 3) État Jira — seulement si comptages réels fournis
    const jc = jira && jira[key];
    if (jc && jc.total != null) {
      const open = (jc.open != null) ? jc.open : "?";
      push("jira", `État Jira — ${key} (${open}/${jc.total} ouvert${open === 1 ? "" : "s"})`, `cpwire:jira:${key}`);
    }
    // 4) Imports — comptage réel (listImports)
    if (impByCi[ci]) push("imports", `Imports — ${key} (${impByCi[ci]} import${impByCi[ci] > 1 ? "s" : ""})`, `cpwire:imports:${key}`);
    // 5) Livrables produits par cp|WIRE — documents OUVRABLES (contenu hébergé)
    for (const e of (delivsByCi[ci] || []).slice(0, 12)) {
      const yr = e.at ? new Date(e.at).getFullYear() : year;
      out.push({ n: e.title || `${e.type} — ${key}`, ci, k: e.type || "Livrable", e: "", x: "cp|WIRE", y: yr, sp: "clients",
        p: `cp|WIRE/${key}/${e.title || e.type}`, src: "cpwire", id: `cpwire:deliv:${e.id}`, at: e.at || at,
        url: e.hasFile ? `/api/sharefly/deliverable/${e.id}` : undefined });
      bucket.push("livrable");
    }
  }
  return { out, parClient };
}
function safeCall(fn) { try { return fn() || []; } catch { return []; } }

/* --- Moteur de synchro cp|WIRE -> ShareFly ---
   syncNow : dérive + écrit l'overlay + trace au journal (synchrone).
   resync  : version débouncée pour les déclencheurs événementiels (écritures,
             chargement Jira…), qui mémorise les DERNIERS comptages Jira réels. */
let _lastJira = null;
let _resyncT = null;
function syncNow({ jira } = {}) {
  if (jira != null) _lastJira = jira;
  const { out, parClient } = deriveDocs({ jira: _lastJira });
  writeOverlay(out);
  STATE.mov.unshift({ t: Date.now(), who: "cp|WIRE", act: "sync-catalogue",
    detail: `${out.length} document(s) dérivé(s) vers ShareFly`, clients: Object.keys(parClient).length });
  STATE.mov = STATE.mov.slice(0, 600);
  persist();
  return { out, parClient };
}
export function resync(opts = {}) {
  if (opts && opts.jira != null) _lastJira = opts.jira;
  clearTimeout(_resyncT);
  _resyncT = setTimeout(() => { try { syncNow({}); } catch (e) { console.error("[sharefly] resync:", e.message); } }, 800);
}

let _t = null;
function persist() {
  clearTimeout(_t);
  _t = setTimeout(() => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(STATE)); } catch { /* FS lecture seule : on garde en mémoire */ } }, 400);
}

router.use(express.json({ limit: "1mb" }));

/* --- Config front (URL de base SharePoint + retour cp|WIRE), injectée côté page.
   DOIT précéder le static. Surchargeable par env SHAREFLY_SP_BASE / SHAREFLY_CPWIRE_BASE. */
router.get("/sharefly/config.js", (_req, res) => {
  const sp = process.env.SHAREFLY_SP_BASE || "";
  const cp = process.env.SHAREFLY_CPWIRE_BASE || "/";
  res.type("application/javascript")
    .send(`window.SHAREFLY_SP_BASE=${JSON.stringify(sp)};window.SHAREFLY_CPWIRE_BASE=${JSON.stringify(cp)};`);
});

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

/* --- Contenu réel d'un livrable produit par cp|WIRE (ouvrable dans ShareFly) --- */
router.get("/api/sharefly/deliverable/:id", (req, res) => {
  const d = getDeliverable(req.params.id);
  if (!d || d.content == null) return res.status(404).send("Livrable introuvable ou non hébergé sur ce serveur.");
  res.type(d.mime).send(d.content);
});

/* --- Lot 2 : cp|WIRE lit le catalogue ShareFly et en tire ses analyses
       (couverture par client, orphelins / à classer / hors périmètre, fraîcheur). --- */
router.get("/api/sharefly/analyse", (_req, res) => {
  try {
    const docs = baseDocs().concat(readOverlay());
    res.json(analyseCatalogue(docs));
  } catch (e) {
    console.error("[sharefly] analyse:", e && e.message);
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

/* --- Synchro cp|WIRE -> ShareFly : dérive les docs des sources réelles,
       les range sous le bon client, et trace au journal partagé.
       Body optionnel : { jira: { "<dossier>": { total, open } } } (comptages réels). */
router.post("/api/sharefly/sync", (req, res) => {
  const jira = (req.body && req.body.jira && typeof req.body.jira === "object") ? req.body.jira : null;
  const { out, parClient } = syncNow({ jira });
  res.json({
    ok: true, derived: out.length, parClient,
    jira: jira ? Object.keys(jira).length : 0,
    note: "Sources : fiche + mémoire IA + imports + livrables (données réelles), état Jira si comptages fournis. Déclenchement auto câblé sur les écritures et le chargement Jira (Lot 3).",
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

/* --- Amorçage : dès le démarrage, dérive tout ce qui est disponible (fiche,
   mémoire, imports, livrables déjà enregistrés). Les comptages Jira arrivent
   au premier chargement de /api/activite (déclencheur auto). --- */
try { syncNow({}); }
catch (e) { console.error("[sharefly] amorçage dérivation:", e.message); }

export default router;
