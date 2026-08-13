/**
 * server/reunionStore.js — stockage des réunions
 *
 * Se branche sur la persistance déjà en place dans cp|WIRE (server/persist.js,
 * base Neon via DATABASE_URL) plutôt que d'ouvrir un mécanisme parallèle.
 *
 * Trois niveaux, dans cet ordre :
 *   1. base durable  → via persist.js si ses fonctions sont détectées
 *   2. fichier       → DATA_DIR (le disque persistant Render si monté)
 *   3. mémoire       → dernier recours, perdu au redémarrage, signalé au démarrage
 *
 * L'adaptation se fait par détection de noms, parce que les conventions de
 * persist.js peuvent différer d'une version à l'autre. Si le module est bien
 * chargé mais qu'aucune fonction n'est reconnue, le nom exact apparaît dans les
 * logs au démarrage : il suffit alors de compléter NOMS_SAUVEGARDE / NOMS_LECTURE
 * ci-dessous, ou d'écrire directement les deux lignes d'appel.
 */

const fs = require('fs');
const path = require('path');

const CLE = 'reunions';
const MAX = 200; // réunions conservées, les plus récentes d'abord

/* ------------------------------------------------------------------ */
/* 1. Détection de la persistance cp|WIRE                              */
/* ------------------------------------------------------------------ */

const NOMS_SAUVEGARDE = ['dbSaveBlob', 'saveBlob', 'setBlob', 'writeBlob', 'save', 'set', 'put'];
const NOMS_LECTURE = ['dbLoadBlob', 'loadBlob', 'getBlob', 'readBlob', 'load', 'get'];
const NOMS_ACTIF = ['isPersistent', 'persistenceActive', 'isDurable', 'actif'];

function chargerPersist() {
  for (const chemin of ['./persist', './db', '../persist', '../db']) {
    try {
      const m = require(chemin);
      if (m && typeof m === 'object') return { module: m, chemin };
    } catch (e) {
      /* module absent à ce chemin : on essaie le suivant */
    }
  }
  return { module: null, chemin: null };
}

const { module: P, chemin: cheminPersist } = chargerPersist();

function trouver(noms) {
  if (!P) return null;
  for (const n of noms) if (typeof P[n] === 'function') return { fn: P[n], nom: n };
  return null;
}

const sauvegardeBase = trouver(NOMS_SAUVEGARDE);
const lectureBase = trouver(NOMS_LECTURE);
const testActif = trouver(NOMS_ACTIF);

async function baseDisponible() {
  if (!sauvegardeBase || !lectureBase) return false;
  if (!testActif) return true; // pas de test exposé : on suppose actif
  try {
    return !!(await testActif.fn.call(P));
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 2. Repli fichier sur DATA_DIR                                       */
/* ------------------------------------------------------------------ */

function dossierDonnees() {
  if (process.env.REUNION_STORE) return path.dirname(process.env.REUNION_STORE);
  try {
    const p = require('./paths');
    const d = typeof p.dataDir === 'function' ? p.dataDir() : p.dataDir || p.DATA_DIR;
    if (d) return d;
  } catch (e) {
    /* paths.js absent : on retombe sur la variable d'environnement */
  }
  return process.env.DATA_DIR || path.join(__dirname, 'data');
}

const FICHIER =
  process.env.REUNION_STORE || path.join(dossierDonnees(), 'reunions.json');

function lireFichier() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch (e) {
    return null; // fichier absent au premier lancement : cas normal
  }
}

function ecrireFichier(liste) {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    // Écriture atomique : évite un fichier tronqué si le process est coupé.
    const tmp = FICHIER + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(liste), 'utf8');
    fs.renameSync(tmp, FICHIER);
    return true;
  } catch (e) {
    console.error('[reunion] écriture fichier impossible :', e.message);
    return false;
  }
}

function fichierEcrivable() {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    fs.accessSync(path.dirname(FICHIER), fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 3. Dernier recours : mémoire                                        */
/* ------------------------------------------------------------------ */

let enMemoire = [];

/* ------------------------------------------------------------------ */
/* Mode retenu                                                         */
/* ------------------------------------------------------------------ */

let mode = 'memoire';
let pret = null;

function initialiser() {
  if (pret) return pret;
  pret = (async () => {
    if (await baseDisponible()) {
      mode = 'base';
      console.log(
        `[reunion] stockage : base durable (${cheminPersist}, ${sauvegardeBase.nom}/${lectureBase.nom}).`
      );
    } else if (fichierEcrivable()) {
      mode = 'fichier';
      const durable = !!process.env.DATA_DIR || !!process.env.REUNION_STORE;
      console.log(
        `[reunion] stockage : fichier ${FICHIER}` +
          (durable ? ' (disque configuré).' : ' — ATTENTION : dossier non persistant, les réunions seront perdues au redéploiement.')
      );
      if (P && (!sauvegardeBase || !lectureBase)) {
        console.warn(
          `[reunion] ${cheminPersist} chargé mais aucune fonction reconnue. Exports vus : ` +
            Object.keys(P).filter((k) => typeof P[k] === 'function').join(', ') +
            ' — complète NOMS_SAUVEGARDE / NOMS_LECTURE dans reunionStore.js pour utiliser la base.'
        );
      }
    } else {
      mode = 'memoire';
      console.warn(
        '[reunion] stockage : mémoire seule. Les réunions ne survivront pas au redémarrage.'
      );
    }
    return mode;
  })();
  return pret;
}

/* ------------------------------------------------------------------ */
/* API du store                                                        */
/* ------------------------------------------------------------------ */

async function lireTout() {
  await initialiser();
  if (mode === 'base') {
    try {
      const brut = await lectureBase.fn.call(P, CLE);
      if (!brut) return [];
      const val = typeof brut === 'string' ? JSON.parse(brut) : brut;
      if (Array.isArray(val)) return val;
      if (val && Array.isArray(val.reunions)) return val.reunions;
      return [];
    } catch (e) {
      console.error('[reunion] lecture base impossible :', e.message);
      return [];
    }
  }
  if (mode === 'fichier') return lireFichier() || [];
  return enMemoire;
}

async function ecrireTout(liste) {
  await initialiser();
  const coupee = liste.slice(0, MAX);
  if (mode === 'base') {
    try {
      await sauvegardeBase.fn.call(P, CLE, JSON.stringify(coupee));
      return true;
    } catch (e) {
      console.error('[reunion] écriture base impossible, repli fichier :', e.message);
      return ecrireFichier(coupee);
    }
  }
  if (mode === 'fichier') return ecrireFichier(coupee);
  enMemoire = coupee;
  return false; // écrit, mais non durable : le front peut le signaler
}

async function statut() {
  await initialiser();
  return {
    mode,
    durable: mode === 'base' || (mode === 'fichier' && (!!process.env.DATA_DIR || !!process.env.REUNION_STORE)),
    detail:
      mode === 'base'
        ? 'base durable cp|WIRE'
        : mode === 'fichier'
        ? FICHIER
        : 'mémoire seule',
  };
}

async function liste() {
  const t = await lireTout();
  return t.map((r) => ({
    id: r.id,
    titre: r.titre,
    client: r.client,
    date: r.date,
    dureeMs: r.dureeMs,
    aUnCr: !!r.cr,
    taille: (r.transcript || '').length,
  }));
}

async function lire(id) {
  const t = await lireTout();
  return t.find((x) => x.id === id) || null;
}

async function enregistrer(reunion) {
  const t = await lireTout();
  const id = reunion.id || 'reu_' + Date.now().toString(36);
  const enreg = Object.assign({}, reunion, { id, majLe: new Date().toISOString() });
  const i = t.findIndex((x) => x.id === id);
  if (i >= 0) t[i] = enreg;
  else t.unshift(enreg);
  const durable = await ecrireTout(t);
  return { id, durable };
}

async function supprimer(id) {
  const t = await lireTout();
  await ecrireTout(t.filter((x) => x.id !== id));
  return true;
}

module.exports = { initialiser, statut, liste, lire, enregistrer, supprimer };
