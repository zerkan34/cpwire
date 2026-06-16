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

export function dataDir() {
  if (cached) return cached;
  const candidates = [
    process.env.DATA_DIR,                       // emplacement explicite (ex. disque persistant Render)
    path.join(__dirname, "data"),               // emplacement par défaut, à côté du code
    path.join(os.tmpdir(), "cpwire-data"),      // repli temporaire (toujours inscriptible)
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      // Si un FICHIER occupe ce chemin, impossible d'y créer des fichiers → on saute (cause de l'ENOTDIR).
      if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) continue;
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".write-test");
      fs.writeFileSync(probe, "ok"); fs.unlinkSync(probe); // test d'écriture réel
      cached = dir;
      return dir;
    } catch { /* on essaie le candidat suivant */ }
  }

  cached = path.join(os.tmpdir(), "cpwire-data");
  try { fs.mkdirSync(cached, { recursive: true }); } catch { /* best-effort */ }
  return cached;
}
