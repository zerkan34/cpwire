// deliverables.js — registre des livrables produits par cp|WIRE (CR, COPIL, COMOP…).
// Enregistré AU MOMENT de la génération, AVEC le contenu réel (HTML charté) : c'est ce
// qui permet à ShareFly d'AFFICHER et d'OUVRIR le vrai document, pas une simple ligne.
import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";

const FILE = path.join(dataDir(), "deliverables.json");
const artefactPath = (id, ext) => path.join(dataDir(), `deliverable_${id}.${ext || "html"}`);

function load() {
  try { const a = JSON.parse(fs.readFileSync(FILE, "utf8")); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function save(list) {
  try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list.slice(0, 500))); }
  catch (err) { console.error("[deliverables] écriture index impossible:", err.message); }
}

export function listDeliverables() { return load(); }

// Enregistre un livrable. Si `html` (ou `content`) est fourni, le contenu réel est
// stocké et devient ouvrable via /api/sharefly/deliverable/:id.
export function recordDeliverable({ client, type, title, html, content, ext } = {}) {
  if (!client) return null;
  const body = html != null ? html : content;
  const list = load();
  const now = Date.now();
  const t = String(title || "");
  // Anti-doublon : même client + même titre produit il y a moins de 5 min -> on réutilise l'entrée.
  let e = list.find((x) => x.client === String(client) && x.title === t && (now - new Date(x.at).getTime()) < 5 * 60 * 1000);
  if (e) { e.at = new Date().toISOString(); if (type) e.type = String(type); if (ext) e.ext = ext; }
  else {
    e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), client: String(client), type: String(type || "Livrable"), title: t, ext: (ext || "html"), at: new Date().toISOString(), hasFile: false };
    list.unshift(e);
  }
  if (body != null) {
    try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(artefactPath(e.id, e.ext), String(body)); e.hasFile = true; }
    catch (err) { console.error("[deliverables] artefact non stocké:", err.message); }
  }
  save(list);
  return e;
}

// Retourne { meta, content, mime } pour un id donné, ou null.
export function getDeliverable(id) {
  if (!/^[a-z0-9]+$/i.test(String(id || ""))) return null;
  const meta = load().find((x) => x.id === id);
  if (!meta) return null;
  let content = null;
  try { content = fs.readFileSync(artefactPath(id, meta.ext), "utf8"); } catch { /* fichier absent */ }
  const mime = meta.ext === "html" ? "text/html" : meta.ext === "pdf" ? "application/pdf" : "text/plain";
  return { meta, content, mime };
}
