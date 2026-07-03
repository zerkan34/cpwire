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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const DATA_FILE = process.env.SHAREFLY_DATA || path.join(dataDir(), "sharefly.json");
let STATE = { mov: [], roles: [] };
try { if (fs.existsSync(DATA_FILE)) STATE = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) || STATE; } catch { /* démarrage à vide */ }

/* --- Catalogue documentaire (source de vérité PARTAGÉE, Lot 0) ---
   Le catalogue (14 333 docs) est sorti du HTML vers un JSON serveur, lu
   par la page ShareFly ET par cp|WIRE. Chemin surchargeable par env. */
const CATALOGUE_FILE = process.env.SHAREFLY_CATALOGUE
  || path.join(__dirname, "public", "sharefly", "catalogue.json");
let _catText = null;   // texte JSON en cache
let _catJs = null;     // wrapper JS en cache (window.DOCS=...)
function catalogueText() {
  if (_catText == null) {
    try { _catText = fs.readFileSync(CATALOGUE_FILE, "utf8"); }
    catch { _catText = "[]"; }
  }
  return _catText;
}
function catalogueJs() {
  if (_catJs == null) _catJs = "window.DOCS=" + catalogueText() + ";";
  return _catJs;
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

export default router;
