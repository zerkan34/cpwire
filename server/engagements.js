// engagements.js — REGISTRE DES ENGAGEMENTS (actions et décisions).
//
// Le trou que ça comble : Jira connaît les tickets, pas les engagements pris en séance.
// « Catherine revient vers nous avec la volumétrie avant vendredi », « on acte le report
// de la MEP à septembre » : ça se dit en réunion, ça finit dans un compte rendu PDF, et
// ça n'existe plus nulle part le lundi suivant. Ce module donne à ces phrases un cycle
// de vie : porteur, échéance, statut, source, relances.
//
// Deux natures d'objets, volontairement dans le même registre parce qu'ils se lisent
// ensemble en comité :
//   - ACTION   : quelqu'un doit faire quelque chose, avec si possible une date.
//   - DÉCISION : un choix acté, qui ne se « termine » pas mais qui se rappelle.
//
// Stockage : même chaîne que le reste (base durable persist.js, sinon fichier DATA_DIR,
// sinon mémoire), avec le mode retenu exposé pour que l'interface puisse le dire.

import fs from "fs";
import path from "path";
import { persistenceActive, saveBlob, restoreBlob } from "./persist.js";
import { dataDir, dataDirInfo } from "./paths.js";

const CLE = "engagements";
const MAX = 2000;

export const STATUTS = ["a_faire", "en_cours", "fait", "abandonne"];
export const NATURES = ["action", "decision"];

function dossierDonnees() {
  try {
    const d = typeof dataDir === "function" ? dataDir() : dataDir;
    if (d) return d;
  } catch (e) {
    console.error("[engagements] dataDir indisponible :", e.message);
  }
  return process.env.DATA_DIR || "./data";
}

const FICHIER = path.join(dossierDonnees(), "engagements.json");

/* ------------------------------------------------------------------ */
/* Stockage                                                            */
/* ------------------------------------------------------------------ */

function lireFichier() {
  try { return JSON.parse(fs.readFileSync(FICHIER, "utf8")); } catch (e) { return null; }
}

function ecrireFichier(liste) {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    const tmp = FICHIER + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(liste), "utf8");
    fs.renameSync(tmp, FICHIER);
    return true;
  } catch (e) {
    console.error("[engagements] écriture fichier impossible :", e.message);
    return false;
  }
}

let enMemoire = [];
let mode = "memoire";
let pret = null;

async function baseUtilisable() {
  try { if (!persistenceActive()) return false; } catch (e) { return false; }
  try {
    await saveBlob("engagements_test", JSON.stringify({ t: Date.now() }));
    const relu = await restoreBlob("engagements_test");
    return !!(typeof relu === "string" ? relu : relu && relu.value);
  } catch (e) {
    console.warn("[engagements] persist.js inutilisable :", e.message);
    return false;
  }
}

export function initialiser() {
  if (pret) return pret;
  pret = (async () => {
    if (await baseUtilisable()) { mode = "base"; console.log("[engagements] stockage : base durable."); }
    else {
      try { fs.mkdirSync(path.dirname(FICHIER), { recursive: true }); fs.accessSync(path.dirname(FICHIER), fs.constants.W_OK); mode = "fichier"; }
      catch (e) { mode = "memoire"; }
      console.log(mode === "fichier"
        ? `[engagements] stockage : fichier ${FICHIER}.`
        : "[engagements] stockage : mémoire seule, perdu au redémarrage.");
    }
    return mode;
  })();
  return pret;
}

async function lireTout() {
  await initialiser();
  if (mode === "base") {
    try {
      const brut = await restoreBlob(CLE);
      if (!brut) return [];
      const txt = typeof brut === "string" ? brut : brut.value || "";
      const v = JSON.parse(txt || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      console.error("[engagements] lecture base impossible :", e.message);
      return lireFichier() || [];
    }
  }
  if (mode === "fichier") return lireFichier() || [];
  return enMemoire;
}

async function ecrireTout(liste) {
  await initialiser();
  const l = liste.slice(0, MAX);
  if (mode === "base") {
    try { await saveBlob(CLE, JSON.stringify(l)); return true; }
    catch (e) { console.error("[engagements] écriture base impossible :", e.message); return ecrireFichier(l); }
  }
  if (mode === "fichier") return ecrireFichier(l);
  enMemoire = l;
  return false;
}

export async function statut() {
  await initialiser();
  let durable = mode === "base";
  if (mode === "fichier") {
    try { durable = !!dataDirInfo().persistent; } catch (e) { durable = !!process.env.DATA_DIR; }
  }
  return { mode, durable };
}

/* ------------------------------------------------------------------ */
/* Règles métier                                                       */
/* ------------------------------------------------------------------ */

const jour = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * Enrichit un engagement de ce qui se calcule (jamais stocké, toujours recalculé) :
 * jours restants, état d'urgence, ancienneté. `maintenant` est injectable pour les tests.
 */
export function enrichir(e, maintenant = new Date()) {
  const out = { ...e };
  const auj = jour(maintenant);
  out.clos = e.statut === "fait" || e.statut === "abandonne";
  if (e.echeance) {
    const d = jour(e.echeance);
    out.joursRestants = Math.round((d - auj) / 86400000);
    // Une décision ne se met pas « en retard » : elle se rappelle, elle ne s'exécute pas.
    if (out.clos || e.nature === "decision") out.urgence = "aucune";
    else if (out.joursRestants < 0) out.urgence = "retard";
    else if (out.joursRestants <= 2) out.urgence = "imminent";
    else if (out.joursRestants <= 7) out.urgence = "semaine";
    else out.urgence = "plus_tard";
  } else {
    out.joursRestants = null;
    // Sans échéance, on ne devine pas de date : on signale simplement le manque, et
    // seulement pour une action ouverte (règle zéro invention).
    out.urgence = out.clos || e.nature === "decision" ? "aucune" : "sans_echeance";
  }
  if (e.creeLe) out.ageJours = Math.round((auj - jour(e.creeLe)) / 86400000);
  return out;
}

function valider(e) {
  const quoi = String(e.quoi || "").trim();
  if (!quoi) throw Object.assign(new Error("L'intitulé est obligatoire."), { statut: 400 });
  const nature = NATURES.includes(e.nature) ? e.nature : "action";
  const statutV = STATUTS.includes(e.statut) ? e.statut : "a_faire";
  let echeance = String(e.echeance || "").trim();
  if (echeance && !/^\d{4}-\d{2}-\d{2}$/.test(echeance)) {
    throw Object.assign(new Error("L'échéance doit être au format AAAA-MM-JJ."), { statut: 400 });
  }
  if (echeance && isNaN(new Date(echeance).getTime())) {
    throw Object.assign(new Error("Échéance invalide."), { statut: 400 });
  }
  return {
    quoi,
    nature,
    statut: statutV,
    qui: String(e.qui || "").trim(),
    client: String(e.client || "").trim(),
    echeance,
    origine: String(e.origine || "").trim(),   // d'où ça vient (réunion, COPIL, mail…)
    reunionId: String(e.reunionId || "").trim(),
    note: String(e.note || "").trim(),
  };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function liste(filtres = {}, maintenant = new Date()) {
  const tout = (await lireTout()).map((e) => enrichir(e, maintenant));
  const f = filtres || {};
  let out = tout;
  if (f.client && f.client !== "Tous") out = out.filter((e) => (e.client || "") === f.client);
  if (f.qui && f.qui !== "Tous") out = out.filter((e) => (e.qui || "") === f.qui);
  if (f.nature && f.nature !== "Tous") out = out.filter((e) => e.nature === f.nature);
  if (f.statut && f.statut !== "Tous") out = out.filter((e) => e.statut === f.statut);
  if (f.ouverts) out = out.filter((e) => !e.clos);
  if (f.enRetard) out = out.filter((e) => e.urgence === "retard");
  // Tri de lecture : le retard d'abord, puis l'imminent, puis par échéance,
  // et ce qui n'a pas de date en fin de liste plutôt qu'en tête.
  const rang = { retard: 0, imminent: 1, semaine: 2, plus_tard: 3, sans_echeance: 4, aucune: 5 };
  return out.sort((a, b) => {
    const r = (rang[a.urgence] ?? 9) - (rang[b.urgence] ?? 9);
    if (r) return r;
    if (a.echeance && b.echeance) return a.echeance < b.echeance ? -1 : 1;
    if (a.echeance) return -1;
    if (b.echeance) return 1;
    return String(b.creeLe || "").localeCompare(String(a.creeLe || ""));
  });
}

export async function compteurs(maintenant = new Date()) {
  const tout = (await lireTout()).map((e) => enrichir(e, maintenant));
  const ouverts = tout.filter((e) => !e.clos);
  return {
    total: tout.length,
    ouverts: ouverts.length,
    retard: ouverts.filter((e) => e.urgence === "retard").length,
    semaine: ouverts.filter((e) => e.urgence === "imminent" || e.urgence === "semaine").length,
    sansEcheance: ouverts.filter((e) => e.urgence === "sans_echeance").length,
    decisions: tout.filter((e) => e.nature === "decision").length,
  };
}

export async function creer(donnees) {
  const v = valider(donnees);
  const tout = await lireTout();
  const e = {
    ...v,
    id: "eng_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    creeLe: new Date().toISOString(),
    majLe: new Date().toISOString(),
    historique: [{ le: new Date().toISOString(), quoi: "création" }],
  };
  tout.unshift(e);
  const durable = await ecrireTout(tout);
  return { engagement: enrichir(e), durable };
}

export async function modifier(id, champs) {
  const tout = await lireTout();
  const i = tout.findIndex((e) => e.id === id);
  if (i < 0) throw Object.assign(new Error("Engagement introuvable."), { statut: 404 });
  const fusion = valider({ ...tout[i], ...champs });
  const trace = [];
  if (champs.statut && champs.statut !== tout[i].statut) trace.push(`statut : ${tout[i].statut} vers ${champs.statut}`);
  if (champs.echeance && champs.echeance !== tout[i].echeance) trace.push(`échéance : ${tout[i].echeance || "aucune"} vers ${champs.echeance}`);
  if (champs.qui && champs.qui !== tout[i].qui) trace.push(`porteur : ${tout[i].qui || "aucun"} vers ${champs.qui}`);
  tout[i] = {
    ...tout[i],
    ...fusion,
    majLe: new Date().toISOString(),
    historique: [...(tout[i].historique || []), ...trace.map((t) => ({ le: new Date().toISOString(), quoi: t }))],
  };
  const durable = await ecrireTout(tout);
  return { engagement: enrichir(tout[i]), durable };
}

export async function supprimer(id) {
  const tout = await lireTout();
  await ecrireTout(tout.filter((e) => e.id !== id));
  return true;
}

/**
 * Verse dans le registre les actions et décisions d'un compte rendu de réunion.
 * Anti-doublon : un même intitulé, pour le même client et la même réunion, n'entre
 * qu'une fois (on peut donc rejouer l'import sans polluer le registre).
 */
export async function importerDepuisCr(cr = {}, contexte = {}) {
  const tout = await lireTout();
  const empreinte = (e) => `${(e.quoi || "").trim().toLowerCase()}|${(e.client || "").toLowerCase()}|${e.reunionId || ""}`;
  const connues = new Set(tout.map(empreinte));
  const ajoutes = [];
  const maintenant = new Date().toISOString();

  const pousser = (brut) => {
    let v;
    try { v = valider(brut); } catch (e) { return; } // une ligne vide du CR ne bloque pas l'import
    if (connues.has(empreinte(v))) return;
    connues.add(empreinte(v));
    const e = {
      ...v,
      id: "eng_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      creeLe: maintenant,
      majLe: maintenant,
      historique: [{ le: maintenant, quoi: "importé depuis un compte rendu de réunion" }],
    };
    ajoutes.push(e);
  };

  for (const a of Array.isArray(cr.actions) ? cr.actions : []) {
    pousser({
      quoi: a.quoi, qui: a.qui, nature: "action",
      // « quand » sort d'une transcription : ce n'est une échéance que si c'est une vraie
      // date. « avant vendredi » reste en note plutôt que d'être transformé en date inventée.
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(String(a.quand || "").trim()) ? a.quand.trim() : "",
      note: /^\d{4}-\d{2}-\d{2}$/.test(String(a.quand || "").trim()) ? "" : String(a.quand || "").trim(),
      client: contexte.client, origine: contexte.origine || "réunion", reunionId: contexte.reunionId,
    });
  }
  for (const d of Array.isArray(cr.decisions) ? cr.decisions : []) {
    pousser({
      quoi: d, nature: "decision",
      client: contexte.client, origine: contexte.origine || "réunion", reunionId: contexte.reunionId,
    });
  }

  if (ajoutes.length) await ecrireTout([...ajoutes, ...tout]);
  return { ajoutes: ajoutes.length, ignores: (cr.actions?.length || 0) + (cr.decisions?.length || 0) - ajoutes.length };
}
