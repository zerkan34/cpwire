// reunionStore.js — stockage des réunions (ESM, aligné sur la persistance cp|WIRE).
//
// Ordre de préférence :
//   1. base durable  → persist.js (saveBlob / restoreBlob), la même que la mémoire
//   2. fichier       → dataDir() de paths.js, donc le disque persistant s'il est monté
//   3. mémoire       → dernier recours, signalé au démarrage et dans l'interface

import fs from "fs";
import path from "path";
import { persistenceActive, saveBlob, restoreBlob } from "./persist.js";
import { dataDir, dataDirInfo } from "./paths.js";

const CLE = "reunions";
const MAX = 200; // réunions conservées, les plus récentes d'abord

function dossier() {
  try {
    const d = typeof dataDir === "function" ? dataDir() : dataDir;
    if (d) return d;
  } catch (e) {
    console.error("[reunion] dataDir indisponible :", e.message);
  }
  return process.env.DATA_DIR || "./data";
}

const FICHIER = process.env.REUNION_STORE || path.join(dossier(), "reunions.json");

/* ---------------------------------------------------------------- */
/* Fichier                                                           */
/* ---------------------------------------------------------------- */

function lireFichier() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, "utf8"));
  } catch (e) {
    return null; // absent au premier lancement : cas normal
  }
}

function ecrireFichier(liste) {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    const tmp = FICHIER + ".tmp"; // écriture atomique : pas de fichier tronqué
    fs.writeFileSync(tmp, JSON.stringify(liste), "utf8");
    fs.renameSync(tmp, FICHIER);
    return true;
  } catch (e) {
    console.error("[reunion] écriture fichier impossible :", e.message);
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

/* ---------------------------------------------------------------- */
/* Mode retenu                                                       */
/* ---------------------------------------------------------------- */

let enMemoire = [];
let mode = "memoire";
let pret = null;

// Vérifie que saveBlob/restoreBlob répondent vraiment avec la signature attendue,
// plutôt que de le supposer : un aller-retour sur une clé de test.
async function baseUtilisable() {
  try {
    if (!persistenceActive()) return false;
  } catch (e) {
    return false;
  }
  try {
    const temoin = JSON.stringify({ t: Date.now() });
    await saveBlob("reunions_test", temoin);
    const relu = await restoreBlob("reunions_test");
    const val = typeof relu === "string" ? relu : relu && relu.value;
    return !!val;
  } catch (e) {
    console.warn("[reunion] persist.js présent mais inutilisable ici :", e.message);
    return false;
  }
}

export function initialiser() {
  if (pret) return pret;
  pret = (async () => {
    if (await baseUtilisable()) {
      mode = "base";
      console.log("[reunion] stockage : base durable (persist.js).");
    } else if (fichierEcrivable()) {
      mode = "fichier";
      let durable = false;
      try {
        durable = !!dataDirInfo().persistent;
      } catch (e) {
        durable = !!process.env.DATA_DIR;
      }
      console.log(
        `[reunion] stockage : fichier ${FICHIER}` +
          (durable ? " (disque persistant)." : " — non persistant, perdu au redéploiement.")
      );
    } else {
      mode = "memoire";
      console.warn("[reunion] stockage : mémoire seule, perdu au redémarrage.");
    }
    return mode;
  })();
  return pret;
}

/* ---------------------------------------------------------------- */
/* Lecture / écriture                                                */
/* ---------------------------------------------------------------- */

async function lireTout() {
  await initialiser();
  if (mode === "base") {
    try {
      const brut = await restoreBlob(CLE);
      if (!brut) return [];
      const txt = typeof brut === "string" ? brut : brut.value || brut.data || "";
      const val = typeof txt === "string" ? JSON.parse(txt || "[]") : txt;
      return Array.isArray(val) ? val : [];
    } catch (e) {
      console.error("[reunion] lecture base impossible :", e.message);
      return lireFichier() || [];
    }
  }
  if (mode === "fichier") return lireFichier() || [];
  return enMemoire;
}

async function ecrireTout(liste) {
  await initialiser();
  const coupee = liste.slice(0, MAX);
  if (mode === "base") {
    try {
      await saveBlob(CLE, JSON.stringify(coupee));
      return true;
    } catch (e) {
      console.error("[reunion] écriture base impossible, repli fichier :", e.message);
      return ecrireFichier(coupee);
    }
  }
  if (mode === "fichier") return ecrireFichier(coupee);
  enMemoire = coupee;
  return false; // non durable : l'interface le signale
}

/* ---------------------------------------------------------------- */
/* API                                                               */
/* ---------------------------------------------------------------- */

export async function statut() {
  await initialiser();
  let durable = mode === "base";
  if (mode === "fichier") {
    try {
      durable = !!dataDirInfo().persistent;
    } catch (e) {
      durable = !!process.env.DATA_DIR;
    }
  }
  return {
    mode,
    durable,
    detail: mode === "base" ? "base durable cp|WIRE" : mode === "fichier" ? FICHIER : "mémoire seule",
  };
}

export async function liste() {
  const t = await lireTout();
  return t.map((r) => ({
    id: r.id,
    titre: r.titre,
    client: r.client,
    date: r.date,
    dureeMs: r.dureeMs,
    aUnCr: !!r.cr,
    taille: (r.transcript || "").length,
  }));
}

export async function lire(id) {
  const t = await lireTout();
  return t.find((x) => x.id === id) || null;
}

export async function enregistrer(reunion) {
  const t = await lireTout();
  const id = reunion.id || "reu_" + Date.now().toString(36);
  const enreg = { ...reunion, id, majLe: new Date().toISOString() };
  const i = t.findIndex((x) => x.id === id);
  if (i >= 0) t[i] = enreg;
  else t.unshift(enreg);
  const durable = await ecrireTout(t);
  return { id, durable };
}

export async function supprimer(id) {
  const t = await lireTout();
  await ecrireTout(t.filter((x) => x.id !== id));
  return true;
}
