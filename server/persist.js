// ============================================================================
//  persist.js — Persistance DURABLE et GRATUITE des « blobs » JSON de cp|WIRE
//  (mémoire de Natacha en priorité) vers une base Postgres externe (Neon, tier
//  gratuit illimité dans le temps), si la variable d'environnement DATABASE_URL
//  est définie. SINON : ne fait rien (l'app reste en mode fichier comme avant).
//
//  Principe : le FICHIER local reste la source de vérité à l'exécution (lectures
//  synchrones inchangées) ; la base est un MIROIR durable — restauré au démarrage,
//  réécrit à chaque sauvegarde. Survit donc aux redéploiements et aux mises en
//  veille de l'hébergement gratuit. Réutilise exactement le même DATABASE_URL que
//  les comptes (server/users.js).
//
//  100 % défensif : toute erreur base est journalisée puis ignorée — jamais de
//  plantage, on retombe simplement sur le fichier.
// ============================================================================
const DB_URL = process.env.DATABASE_URL || "";
let pgPool = null, pgReady = null;

export function persistenceActive() { return !!DB_URL; }

async function pg() {
  if (!DB_URL) return null;
  if (!pgPool) {
    const mod = await import("pg");                 // import dynamique : pg chargé seulement si une base est configurée
    const { Pool } = mod.default || mod;
    pgPool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000 });
    pgReady = pgPool.query(`CREATE TABLE IF NOT EXISTS cpwire_blobs (
      name TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  }
  await pgReady;
  return pgPool;
}

// Restaure le contenu d'un blob depuis la base. Renvoie la chaîne ou null
// (base absente, blob jamais sauvegardé, ou erreur).
export async function restoreBlob(name) {
  try {
    const pool = await pg();
    if (!pool) return null;
    const r = await pool.query("SELECT content FROM cpwire_blobs WHERE name = $1", [name]);
    return r.rows[0] ? r.rows[0].content : null;
  } catch (e) {
    console.error(`[persist] restore ${name} impossible:`, e.message);
    return null;
  }
}

// Sauvegarde (upsert) un blob dans la base. Fire-and-forget : n'attend pas et
// ne casse jamais l'appelant. Petit anti-rafale (debounce) par nom.
const _timers = {};
export function saveBlob(name, content) {
  if (!DB_URL) return;
  clearTimeout(_timers[name]);
  _timers[name] = setTimeout(async () => {
    try {
      const pool = await pg();
      if (!pool) return;
      await pool.query(
        `INSERT INTO cpwire_blobs(name, content, updated_at) VALUES($1,$2,now())
         ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [name, String(content)]
      );
    } catch (e) {
      console.error(`[persist] save ${name} impossible:`, e.message);
    }
  }, 400);
}

// Écriture immédiate et attendue (pour un flush propre, ex. à l'arrêt du process).
export async function flushBlob(name, content) {
  if (!DB_URL) return;
  try {
    const pool = await pg();
    if (!pool) return;
    await pool.query(
      `INSERT INTO cpwire_blobs(name, content, updated_at) VALUES($1,$2,now())
       ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
      [name, String(content)]
    );
  } catch (e) { console.error(`[persist] flush ${name} impossible:`, e.message); }
}
