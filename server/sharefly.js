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
import * as sharepoint from "./sharepoint.js";
import { guard } from "./auth-core.js";

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
  // catégorie (rubrique) automatique par type de document cp|WIRE
  const CAT = { fiche: "Gouvernance", memoire: "Gouvernance", jira: "Pilotage", imports: "Divers" };
  const delivCat = (e) => (/\b(cr|compte[- ]?rendu|copil|comop|bilan|go\s*\/?\s*no|kickoff|kick-off|lancement|r[eé]union|pr[eé]p)\b/i.test(`${e.type || ""} ${e.title || ""}`) ? "Comptes rendus" : (e.type && !/livrable/i.test(e.type) ? e.type : "Livrables"));
  for (const key of Object.keys(dossiers)) {
    const ci = ciOf(key);
    if (ci == null) continue;                 // pas de client ShareFly correspondant : on n'invente rien
    const bucket = (parClient[key] = []);
    const push = (kind, n, id, url) => { const cat = CAT[kind] || "Divers"; out.push({ n, ci, k: cat, e: "", x: "cp|WIRE", y: year, sp: "clients", p: `CLIENTS/${key}/${cat}/${n}`, src: "cpwire", id, at, url }); bucket.push(kind); };
    const kf = encodeURIComponent(key);
    // 1) Fiche dossier — donnée réelle (dossiers.json), OUVRABLE (HTML rendu à la demande)
    push("fiche", `Fiche dossier — ${key}`, `cpwire:fiche:${key}`, `/api/sharefly/view/fiche/${kf}`);
    // 2) Mémoire IA — seulement si contenu réel, OUVRABLE
    const nMem = memoireCount(conn.clients && conn.clients[key]);
    if (nMem > 0) push("memoire", `Mémoire IA — ${key} (${nMem} élément${nMem > 1 ? "s" : ""})`, `cpwire:memoire:${key}`, `/api/sharefly/view/memoire/${kf}`);
    // 3) État Jira — seulement si comptages réels fournis
    const jc = jira && jira[key];
    if (jc && jc.total != null) {
      const open = (jc.open != null) ? jc.open : "?";
      push("jira", `État Jira — ${key} (${open}/${jc.total} ouvert${open === 1 ? "" : "s"})`, `cpwire:jira:${key}`);
    }
    // 4) Imports — comptage réel (listImports)
    if (impByCi[ci]) push("imports", `Imports — ${key} (${impByCi[ci]} import${impByCi[ci] > 1 ? "s" : ""})`, `cpwire:imports:${key}`);
    // 5) Livrables produits par cp|WIRE — documents OUVRABLES (contenu hébergé), rangés par type
    for (const e of (delivsByCi[ci] || []).slice(0, 12)) {
      const yr = e.at ? new Date(e.at).getFullYear() : year;
      const cat = delivCat(e);
      out.push({ n: e.title || `${e.type} — ${key}`, ci, k: cat, e: "", x: "cp|WIRE", y: yr, sp: "clients",
        p: `CLIENTS/${key}/${cat}/${e.title || e.type}`, src: "cpwire", id: `cpwire:deliv:${e.id}`, at: e.at || at,
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
let _lastSig = "";
function syncNow({ jira, silent } = {}) {
  if (jira != null) _lastJira = jira;
  const { out, parClient } = deriveDocs({ jira: _lastJira });
  const sig = JSON.stringify(out.map((d) => [d.id, d.n, d.k, d.p, d.url]));
  const changed = sig !== _lastSig;
  if (changed) {
    writeOverlay(out);
    _lastSig = sig;
    if (!silent) {
      STATE.mov.unshift({ t: Date.now(), who: "cp|WIRE", act: "sync-catalogue",
        detail: `${out.length} document(s) dérivé(s) vers ShareFly`, clients: Object.keys(parClient).length });
      STATE.mov = STATE.mov.slice(0, 600);
      persist();
    }
  }
  return { out, parClient, changed };
}
export function resync(opts = {}) {
  if (opts && opts.jira != null) _lastJira = opts.jira;
  clearTimeout(_resyncT);
  _resyncT = setTimeout(() => { try { syncNow({}); } catch (e) { console.error("[sharefly] resync:", e.message); } }, 800);
}
// Filet de sécurité : resync périodique silencieuse (rattrape toute mutation non
// déclenchée explicitement). N'écrit et ne notifie que si le contenu a changé.
const _autoSync = setInterval(() => { try { syncNow({ silent: true }); } catch (e) { console.error("[sharefly] auto-sync:", e.message); } }, 5 * 60 * 1000);
if (_autoSync.unref) _autoSync.unref();

let _t = null;
function persist() {
  clearTimeout(_t);
  _t = setTimeout(() => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(STATE)); } catch { /* FS lecture seule : on garde en mémoire */ } }, 400);
}

router.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// AUTHENTIFICATION — corrigée le 13/08/2026.
//
// Ce router n'avait AUCUN garde. Conséquence : la page ShareFly, le catalogue
// complet (14 333 documents avec leurs noms et métadonnées, dont des
// propositions commerciales, des chiffrages et des documents RH) et la route
// /api/sharefly/spfile — qui redirige vers le contenu réel du fichier dans
// SharePoint — étaient accessibles SANS COMPTE, à toute personne connaissant
// l'URL. Les mentions « Accès restreint » affichées sur les espaces Avant-vente
// et RH n'étaient qu'un texte : rien ne les faisait respecter côté serveur.
//
// Le garde est celui de l'application, pas un mécanisme parallèle : une seule
// façon de s'authentifier, une seule à maintenir.
// PORTÉE : ce router est monté sans chemin (app.use(shareflyRouter)), il reçoit
// donc TOUTES les requêtes de l'application. Un router.use(guard) sans chemin
// s'appliquait par conséquent aussi à la racine « / », qui redirigeait vers
// « /?retour=/ », lui-même intercepté : boucle de redirection infinie.
// Le garde doit être limité aux chemins de ShareFly, et à eux seuls.
router.use(["/sharefly", "/api/sharefly"], guard);
// ---------------------------------------------------------------------------


/* --- Config front (URL de base SharePoint + retour cp|WIRE), injectée côté page.
   DOIT précéder le static. Surchargeable par env SHAREFLY_SP_BASE / SHAREFLY_CPWIRE_BASE. */
router.get("/sharefly/config.js", (_req, res) => {
  const sp = process.env.SHAREFLY_SP_BASE || "";
  const cp = process.env.SHAREFLY_CPWIRE_BASE || "/";
  const mode = process.env.SHAREFLY_SP_MODE || "search"; // "search" (robuste, par nom) ou "path" (lien direct)
  const spc = sharepoint.isConfigured();
  res.type("application/javascript")
    .send(`window.SHAREFLY_SP_BASE=${JSON.stringify(sp)};window.SHAREFLY_CPWIRE_BASE=${JSON.stringify(cp)};window.SHAREFLY_SP_MODE=${JSON.stringify(mode)};window.SHAREFLY_SP_CONNECTED=${spc ? "true" : "false"};window.SHAREFLY_VER="v420";`);
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

/* --- Rendu HTML charté à la demande des documents cp|WIRE (fiche, mémoire) ---
   Le contenu est construit en direct depuis les données réelles (dossiers.json,
   connaissance) : chaque client a donc de VRAIS documents ouvrables, sans stockage. */
function escH(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function slugRef(s) { return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function isoDate() { return new Date().toISOString().slice(0, 10); }
const FIELD_LABELS = { description: "Description", tech: "Environnement technique", team: "Équipe", equipe: "Équipe", contexte: "Contexte", perimetre: "Périmètre", enjeux: "Enjeux", contacts: "Contacts", stack: "Stack", notes: "Notes" };
function renderValue(v) {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) {
    if (!v.length) return "";
    if (v.every((x) => x && typeof x === "object")) return v.map((x) => renderValue(x)).join("");
    return "<ul>" + v.map((x) => `<li>${escH(typeof x === "object" && x ? (x.text || x.nom || x.label || JSON.stringify(x)) : x)}</li>`).join("") + "</ul>";
  }
  if (typeof v === "object") {
    const rows = Object.entries(v).filter(([, val]) => val != null && val !== "").map(([k, val]) => {
      const inner = (typeof val === "object") ? renderValue(val) : escH(String(val)).replace(/\n/g, "<br>");
      return `<tr><td class="k">${escH(FIELD_LABELS[k] || k)}</td><td>${inner}</td></tr>`;
    }).join("");
    return rows ? `<table class="kvtbl">${rows}</table>` : "";
  }
  return `<p>${escH(v).replace(/\n/g, "<br>")}</p>`;
}
function htmlShell(kicker, title, bodyHtml, meta) {
  const date = new Date().toLocaleDateString("fr-FR");
  const ref = (meta && (meta.find((x) => x[0] === "Référence") || [])[1]) || "";
  const metaHtml = (meta && meta.length) ? `<div class="idcard">${meta.map(([l, v]) => `<div class="row"><span class="l">${escH(l)}</span><span class="v">${escH(v)}</span></div>`).join("")}</div>` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(title)} — Armonie</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--noir:#1D1D1B;--violet:#3B2E8C;--jaune:#F2C316;--magenta:#E91E63;--lav:#F5F2FC;--gris:#6E6A86;--filet:#E2DEF0;--violetclair:#C4C0DC}
*{box-sizing:border-box}@page{margin:16mm}
body{font-family:Inter,system-ui,Arial,sans-serif;color:var(--noir);margin:0;background:#fff;line-height:1.62;font-size:14px}
.topbar{height:10px;background:linear-gradient(90deg,var(--noir),var(--violet) 55%,var(--jaune))}
.page{max-width:880px;margin:0 auto;padding:0 30px 64px}
.rhead{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0 11px;border-bottom:2px solid var(--noir);margin-bottom:4px}
.brand{font-family:Poppins,Arial,sans-serif;font-weight:800;letter-spacing:.13em;font-size:12px;color:var(--noir)}
.brand b{color:var(--violet)}
.rhead .r{font-size:9.5px;color:var(--gris);letter-spacing:.06em;text-transform:uppercase;text-align:right}
.sk{color:var(--violet);font-family:Poppins,Arial,sans-serif;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:11px;margin:34px 0 8px;display:flex;align-items:center;gap:9px}
.sk::before{content:"";width:9px;height:9px;background:var(--jaune);display:inline-block;border-radius:2px}
h1{font-family:Poppins,Arial,sans-serif;font-weight:800;font-size:33px;line-height:1.08;margin:0 0 12px;color:var(--noir);letter-spacing:-.01em}
.goldrule-top{width:96px;height:4px;background:var(--jaune);border-radius:3px;margin:0 0 12px}
.pill{display:inline-block;border:1.5px solid var(--violet);color:var(--violet);border-radius:20px;padding:3px 14px;font-size:10px;font-weight:600;font-family:Poppins,Arial,sans-serif;letter-spacing:.06em}
.idcard{margin:16px 0 4px;border:1px solid var(--filet);border-radius:14px;overflow:hidden}
.idcard .row{display:flex;font-size:12.5px;border-bottom:1px solid var(--filet)}
.idcard .row:last-child{border-bottom:0}
.idcard .l{width:32%;background:var(--lav);color:var(--violet);font-weight:600;font-family:Poppins,Arial,sans-serif;font-size:11.5px;padding:9px 16px;letter-spacing:.02em}
.idcard .v{padding:9px 16px}
.enbref{background:var(--lav);border-left:4px solid var(--jaune);border-radius:0 12px 12px 0;padding:14px 20px;margin:18px 0}
.enbref .lbl{color:var(--violet);font-family:Poppins,Arial,sans-serif;font-weight:700;font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px}
.enbref p{margin:0}
h2{font-family:Poppins,Arial,sans-serif;font-weight:700;color:var(--noir);font-size:17px;margin:30px 0 8px;display:flex;align-items:center;gap:10px}
h2::before{content:"";width:9px;height:9px;background:var(--jaune);display:inline-block;border-radius:2px;flex:none}
p{margin:6px 0}
ul{margin:8px 0 8px 2px;padding:0;list-style:none}
li{margin:6px 0;padding-left:18px;position:relative}
li::before{content:"";position:absolute;left:0;top:9px;width:6px;height:6px;background:var(--violet);border-radius:2px}
a{color:var(--violet)}
.kvtbl{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--filet);border-radius:14px;overflow:hidden;margin:10px 0}
.kvtbl tr:not(:last-child) td{border-bottom:1px solid var(--filet)}
.kvtbl td{padding:9px 16px;vertical-align:top;font-size:13px}
.kvtbl td.k{width:30%;color:var(--violet);font-weight:600;background:var(--lav);font-family:Poppins,Arial,sans-serif;font-size:12px}
.kvtbl .kvtbl{margin:0;border:0;border-radius:0}
.kvtbl .kvtbl td{border:0;padding:3px 0}
.kvtbl .kvtbl td.k{background:none;width:40%}
pre{background:var(--lav);border:1px solid var(--filet);border-radius:10px;padding:12px;font-size:12px;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace}
.goldrule{width:140px;height:1.6px;background:var(--jaune);border-radius:1px;margin:26px auto 0}
.signs{margin-top:34px;padding-top:14px;border-top:1px solid var(--filet)}
.signs .k{font-family:Poppins,Arial,sans-serif;font-weight:700;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:var(--violet)}
.signs .n{font-family:Poppins,Arial,sans-serif;font-weight:700;font-size:12px;color:var(--noir);margin-top:2px}
.signs .r{font-size:10px;color:var(--gris);margin-top:1px}
.ft{margin-top:14px;color:var(--gris);font-size:10px;letter-spacing:.03em;display:flex;justify-content:space-between;gap:16px}
</style></head>
<body>
<div class="topbar"></div>
<div class="page">
  <div class="rhead"><div class="brand">NOTOS <b>PHL</b>SOFT</div><div class="r">${escH(ref || "ARMONIE GROUP")} · Confidentiel</div></div>
  <div class="sk">${escH(kicker)}</div>
  <h1>${escH(title)}</h1>
  <div class="goldrule-top"></div>
  <span class="pill">Document de travail</span>
  ${metaHtml}
  ${bodyHtml}
  <div class="signs"><div class="k">Établi par</div><div class="n">Nicolas Durand</div><div class="r">Chef de projet (MOE) · Armonie Group</div></div>
  <div class="ft"><span>${escH(ref)}${ref ? " · " : ""}Confidentiel</span><span>Produit par cp|WIRE · ${date}</span></div>
</div></body></html>`;
}
function renderFiche(key, fiche) {
  const meta = [["Client", key], ["Type", "Fiche dossier"], ["Référence", `ARMONIE-${slugRef(key)}-FICHE-${isoDate()}`]];
  if (!fiche) return htmlShell("Fiche dossier", key, "<p>Aucune fiche renseignée pour ce dossier.</p>", meta);
  let body = "";
  if (fiche.description) body += `<div class="enbref"><div class="lbl">En bref</div>${renderValue(fiche.description)}</div>`;
  for (const [k, v] of Object.entries(fiche)) { if (k === "description") continue; const val = renderValue(v); if (val) body += `<h2>${escH(FIELD_LABELS[k] || k)}</h2>${val}`; }
  return htmlShell("Fiche dossier", key, body || "<p>Fiche vide.</p>", meta);
}
function renderMemoire(key, m) {
  const meta = [["Client", key], ["Type", "Mémoire IA"], ["Référence", `ARMONIE-${slugRef(key)}-MEMOIRE-${isoDate()}`]];
  if (!m) return htmlShell("Mémoire IA", key, "<p>Aucune mémoire enregistrée pour ce client.</p>", meta);
  let body = "";
  if (m.contexte) body += `<div class="enbref"><div class="lbl">Contexte</div>${renderValue(m.contexte)}</div>`;
  if (m.attentes && m.attentes.length) body += `<h2>Attentes</h2>${renderValue(m.attentes)}`;
  if (m.notes && m.notes.length) body += `<h2>Notes</h2>${renderValue(m.notes)}`;
  if (m.auto && m.auto.points && m.auto.points.length) body += `<h2>Points appris (analyse automatique)</h2>${renderValue(m.auto.points)}`;
  if (m.appris && m.appris.length) body += `<h2>Sources apprises</h2>${renderValue(m.appris.map((a) => a.text || a.source || ""))}`;
  if (m.glossaire && m.glossaire.length) body += `<h2>Glossaire</h2>${renderValue(m.glossaire)}`;
  return htmlShell("Mémoire IA", key, body || "<p>Mémoire vide.</p>", meta);
}

/* --- Vue à la demande d'un document cp|WIRE (fiche / mémoire), rendue en HTML charté --- */
router.get("/api/sharefly/view/:kind/:key", (req, res) => {
  const { kind, key } = req.params;
  try {
    if (kind === "fiche") { const d = readDossiers() || {}; return res.type("text/html").send(renderFiche(key, d[key])); }
    if (kind === "memoire") { const c = readConnaissance() || { clients: {} }; return res.type("text/html").send(renderMemoire(key, (c.clients || {})[key])); }
    return res.status(404).send("Vue inconnue.");
  } catch (e) { console.error("[sharefly] view:", e && e.message); res.status(500).send("Erreur de rendu."); }
});

/* --- Rapatriement d'un fichier SharePoint DANS le lecteur intégré de ShareFly
       (via Microsoft Graph). Redirige l'iframe vers l'URL d'affichage résolue. --- */
router.get("/api/sharefly/spstatus", (_req, res) => {
  res.json({ connected: sharepoint.isConfigured() });
});
router.get("/api/sharefly/spfile", async (req, res) => {
  if (!sharepoint.isConfigured()) return res.status(501).send("Connexion SharePoint non configurée.");
  const name = req.query.name;
  if (!name) return res.status(400).send("Nom de fichier manquant.");
  try {
    const v = await sharepoint.viewable(String(name));
    if (!v) return res.status(404).send("Fichier introuvable dans SharePoint.");
    res.redirect(v.url); // l'iframe du lecteur intégré suit la redirection et affiche le document
  } catch (e) {
    console.error("[sharefly] spfile:", e && e.message);
    res.status(502).send("Erreur SharePoint : " + (e && e.message || e));
  }
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
