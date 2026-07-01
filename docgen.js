// paths.js — résout UN dossier de données garanti inscriptible.
// Corrige l'erreur ENOTDIR vue sur Render (« /app/data » occupé par un fichier au lieu d'un dossier) :
// si le chemin attendu n'est pas un dossier inscriptible, on bascule proprement sur un dossier
// temporaire, sans jamais faire planter le serveur. On peut forcer l'emplacement via DATA_DIR.
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cached = null;
let chosenSource = null; // "disk" (DATA_DIR), "bundled" (éphémère), "tmp" (éphémère)

export function dataDir() {
  if (cached) return cached;
  const candidates = [
    [process.env.DATA_DIR, "disk"],            // emplacement explicite (ex. disque persistant Render)
    [path.join(__dirname, "data"), "bundled"], // à côté du code (éphémère sur Render)
    [path.join(os.tmpdir(), "cpwire-data"), "tmp"], // repli temporaire (éphémère)
  ].filter(([d]) => d);

  for (const [dir, source] of candidates) {
    try {
      if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) continue;
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".write-test");
      fs.writeFileSync(probe, "ok"); fs.unlinkSync(probe);
      cached = dir; chosenSource = source;
      return dir;
    } catch { /* candidat suivant */ }
  }

  cached = path.join(os.tmpdir(), "cpwire-data"); chosenSource = "tmp";
  try { fs.mkdirSync(cached, { recursive: true }); } catch { /* best-effort */ }
  return cached;
}

// État de persistance : `persistent` vrai UNIQUEMENT si les données vont sur un
// disque persistant (DATA_DIR honoré). Sinon, elles repartent à zéro au redéploiement.
export function dataDirInfo() {
  const dir = dataDir();
  return { dir, source: chosenSource, persistent: chosenSource === "disk" };
}
