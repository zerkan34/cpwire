// snapshot.js — cache local du DERNIER instantané de données (lecture seule),
// pour que le cockpit reste consultable hors-ligne (métro, déplacement client).
// 100% fail-safe : toute erreur est avalée → ne peut JAMAIS casser le flux en ligne.
// IndexedDB (et non localStorage) : pas de limite ~5 Mo, écriture asynchrone non bloquante.

const DB = "cpwire";
const STORE = "snap";
const KEY = "portfolio";

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE); } catch { /* déjà créé */ } };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    } catch (e) { reject(e); }
  });
}

export async function saveSnapshot(data) {
  try {
    if (!data) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ data, at: Date.now() }, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silencieux : le cache est un bonus, jamais bloquant */ }
}

export async function loadSnapshot() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => resolve(rq.result ? rq.result.data : null);
      rq.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function snapshotAge() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => resolve(rq.result ? rq.result.at : 0);
      rq.onerror = () => resolve(0);
    });
  } catch { return 0; }
}
