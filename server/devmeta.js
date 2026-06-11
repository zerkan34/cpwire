// devmeta.js — mémorise les fiches développeur "supprimées" (masquées).
// Soft-delete : on ne perd aucune donnée Jira, on marque seulement le dev comme inactif.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "data");
const FILE = path.join(DIR, "devmeta.json");

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ deleted: [] }, null, 2));
}
function readRaw() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, "utf-8")); } catch { return { deleted: [] }; }
}
function write(obj) { ensure(); fs.writeFileSync(FILE, JSON.stringify(obj, null, 2)); }

export function readDeleted() {
  const o = readRaw();
  return Array.isArray(o.deleted) ? o.deleted : [];
}
export function addDeleted(name) {
  if (!name) return readDeleted();
  const o = readRaw();
  o.deleted = Array.from(new Set([...(o.deleted || []), name]));
  write(o);
  return o.deleted;
}
export function removeDeleted(name) {
  const o = readRaw();
  o.deleted = (o.deleted || []).filter((n) => n !== name);
  write(o);
  return o.deleted;
}
