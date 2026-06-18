// Cache persistant du portefeuille de tickets.
// On garde une "photo" (snapshot) de tous les tickets connus sur le disque,
// pour ne plus tout recharger depuis Jira à chaque actualisation.
import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";

const DIR = dataDir();
const FILE = path.join(DIR, "portfolio.json");

export function loadSnapshot() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (data && Array.isArray(data.issues)) {
      return { syncedAt: data.syncedAt || null, issues: data.issues };
    }
  } catch { /* pas de snapshot encore */ }
  return { syncedAt: null, issues: [] };
}

export function saveSnapshot(snap) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ syncedAt: snap.syncedAt, issues: snap.issues }));
    return true;
  } catch (e) {
    console.error("saveSnapshot:", e.message);
    return false;
  }
}
