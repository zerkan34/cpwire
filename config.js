// history.js — journal persistant de tout ce qui se fait dans l'appli.
// Stockage fichier simple (aucune base externe requise).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "data");
const FILE = path.join(DIR, "history.json");

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");
}

export function logEvent(type, label, meta = {}) {
  ensure();
  const list = read();
  const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), type, label, meta };
  list.unshift(entry);
  fs.writeFileSync(FILE, JSON.stringify(list.slice(0, 500), null, 2));
  return entry;
}

export function read() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch { return []; }
}
