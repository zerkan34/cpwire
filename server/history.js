// history.js — journal persistant de tout ce qui se fait dans l'appli.
// Stockage fichier simple (aucune base externe requise).
import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";

const DIR = dataDir();
const FILE = path.join(DIR, "history.json");

function ensure() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");
  } catch (e) { console.error("[history] init impossible:", e.message); }
}

export function logEvent(type, label, meta = {}) {
  const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), type, label, meta };
  try {
    ensure();
    const list = read();
    list.unshift(entry);
    fs.writeFileSync(FILE, JSON.stringify(list.slice(0, 500), null, 2));
  } catch (e) { console.error("[history] écriture impossible:", e.message); }
  return entry;
}

export function read() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch { return []; }
}
