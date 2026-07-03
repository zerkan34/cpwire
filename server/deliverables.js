// deliverables.js — registre des livrables produits par cp|WIRE (CR, COPIL, COMOP, dossiers…).
// Enregistré AU MOMENT de la génération : c'est la source réelle qui permet à ShareFly
// d'afficher les livrables par client sans rien inventer.
import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";

const FILE = path.join(dataDir(), "deliverables.json");

function load() {
  try { const a = JSON.parse(fs.readFileSync(FILE, "utf8")); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

export function listDeliverables() { return load(); }

export function recordDeliverable({ client, type, title } = {}) {
  if (!client) return null;
  const e = {
    client: String(client),
    type: String(type || "Livrable"),
    title: String(title || ""),
    at: new Date().toISOString(),
  };
  const list = load();
  list.unshift(e);
  const capped = list.slice(0, 500);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(capped));
  } catch (err) { console.error("[deliverables] écriture impossible:", err.message); }
  return e;
}
