// gantts.js — PLANNINGS GANTT, stockés côté SERVEUR et partagés.
//
// Pourquoi ce module existe :
// jusqu'ici, chaque planning vivait dans le `localStorage` du navigateur de son
// auteur (clé `cpwire-gantt:<client>-<projet>`). Conséquences :
//   - un planning n'était visible que par la personne qui l'avait créé,
//     et seulement sur la machine où elle l'avait créé ;
//   - vider le cache du navigateur le détruisait sans avertissement ;
//   - au départ de son auteur, tout le travail disparaissait avec son poste.
//
// Les plannings sont désormais dans la même base durable que le reste. Tout
// compte authentifié voit tous les plannings : c'est un outil de pilotage
// d'équipe, pas un brouillon personnel.
//
// Modèle de données, repris de l'atelier Belmet pour ne rien réinventer :
//   { phases: [{name}], tasks: [{p, t, a, b, s}], milestones: [...], months: n }
//   p = index de phase · t = libellé · a/b = début/fin en mois décimaux
//   s = statut ("done", "hach", "" …)

import fs from "fs";
import path from "path";
import { persistenceActive, saveBlob, restoreBlob } from "./persist.js";
import { dataDir, dataDirInfo } from "./paths.js";
import { cle } from "../shared/texte.js";

const CLE = "gantts";
const MAX = 300;

function dossierDonnees() {
  try {
    const d = typeof dataDir === "function" ? dataDir() : dataDir;
    if (d) return d;
  } catch (e) {
    console.error("[gantts] dataDir indisponible :", e.message);
  }
  return process.env.DATA_DIR || "./data";
}
const FICHIER = path.join(dossierDonnees(), "gantts.json");

/* ------------------------------------------------------------------ */
/* Stockage : base durable, sinon fichier, sinon mémoire               */
/* ------------------------------------------------------------------ */

let enMemoire = [];
let mode = "memoire";
let pret = null;

function lireFichier() {
  try { return JSON.parse(fs.readFileSync(FICHIER, "utf8")); } catch (e) { return null; }
}
function ecrireFichier(l) {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    const tmp = FICHIER + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(l), "utf8");
    fs.renameSync(tmp, FICHIER);
    return true;
  } catch (e) { console.error("[gantts] écriture impossible :", e.message); return false; }
}

async function baseUtilisable() {
  try { if (!persistenceActive()) return false; } catch (e) { return false; }
  try {
    await saveBlob("gantts_test", JSON.stringify({ t: Date.now() }));
    const r = await restoreBlob("gantts_test");
    return !!(typeof r === "string" ? r : r && r.value);
  } catch (e) { return false; }
}

export function initialiser() {
  if (pret) return pret;
  pret = (async () => {
    if (await baseUtilisable()) { mode = "base"; console.log("[gantts] stockage : base durable."); }
    else {
      try {
        fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
        fs.accessSync(path.dirname(FICHIER), fs.constants.W_OK);
        mode = "fichier";
      } catch (e) { mode = "memoire"; }
      console.log(mode === "fichier"
        ? `[gantts] stockage : fichier ${FICHIER}.`
        : "[gantts] stockage : mémoire seule, perdu au redémarrage.");
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
    } catch (e) { console.error("[gantts] lecture base :", e.message); return lireFichier() || []; }
  }
  if (mode === "fichier") return lireFichier() || [];
  return enMemoire;
}

async function ecrireTout(l) {
  await initialiser();
  const c = l.slice(0, MAX);
  if (mode === "base") {
    try { await saveBlob(CLE, JSON.stringify(c)); return true; }
    catch (e) { console.error("[gantts] écriture base :", e.message); return ecrireFichier(c); }
  }
  if (mode === "fichier") return ecrireFichier(c);
  enMemoire = c;
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
/* Règles                                                              */
/* ------------------------------------------------------------------ */

function valider(g) {
  const client = String(g.client || "").trim();
  const projet = String(g.projet || "").trim();
  if (!client) throw Object.assign(new Error("Le client est obligatoire."), { statut: 400 });
  if (!projet) throw Object.assign(new Error("Le projet est obligatoire."), { statut: 400 });

  const d = g.data && typeof g.data === "object" ? g.data : {};
  const phases = Array.isArray(d.phases) ? d.phases.slice(0, 40).map((p) => ({
    name: String(p && p.name || "Phase").slice(0, 200),
  })) : [];
  const tasks = Array.isArray(d.tasks) ? d.tasks.slice(0, 600).map((t) => {
    const a = Number.isFinite(+t.a) && t.a !== null && t.a !== "" ? +t.a : 0;
    let b = Number.isFinite(+t.b) && t.b !== null && t.b !== "" ? +t.b : a + 1;
    // Une tâche dont la fin n'est pas après le début serait une barre de largeur
    // nulle : invisible sur le planning, donc impossible à rattraper à la souris.
    // On lui donne la durée minimale d'un mois plutôt que de la laisser disparaître.
    if (!(b > a)) b = a + 1;
    return {
      p: Number.isFinite(+t.p) ? Math.max(0, Math.floor(+t.p)) : 0,
      t: String(t && t.t || "").slice(0, 400),
      a, b,
      s: String(t && t.s || "").slice(0, 20),
    };
  }) : [];

  return {
    client, projet,
    titre: String(g.titre || `${client} · ${projet}`).slice(0, 200),
    data: { ...d, phases, tasks },
  };
}

const identifiant = (client, projet) => `${cle(client)}--${cle(projet)}`.replace(/[^a-z0-9-]+/g, "-");

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/** Tous les plannings, sans leur contenu : de quoi bâtir une liste. */
export async function liste() {
  const t = await lireTout();
  return t.map((g) => ({
    id: g.id, client: g.client, projet: g.projet, titre: g.titre,
    phases: (g.data?.phases || []).length,
    taches: (g.data?.tasks || []).length,
    majLe: g.majLe, majPar: g.majPar || "",
  })).sort((a, b) => String(b.majLe || "").localeCompare(String(a.majLe || "")));
}

export async function lire(id) {
  return (await lireTout()).find((g) => g.id === id) || null;
}

/** Crée ou met à jour. La paire client+projet fait l'identité : pas de doublon. */
export async function enregistrer(donnees, auteur = "") {
  const v = valider(donnees);
  const id = donnees.id || identifiant(v.client, v.projet);
  const t = await lireTout();
  const i = t.findIndex((g) => g.id === id);
  const enreg = {
    ...v, id,
    creeLe: i >= 0 ? t[i].creeLe : new Date().toISOString(),
    majLe: new Date().toISOString(),
    majPar: String(auteur || "").slice(0, 120),
  };
  if (i >= 0) t[i] = enreg; else t.unshift(enreg);
  const durable = await ecrireTout(t);
  return { id, durable, planning: enreg };
}

export async function supprimer(id) {
  const t = await lireTout();
  await ecrireTout(t.filter((g) => g.id !== id));
  return true;
}

/** Duplique un planning existant vers un nouveau couple client/projet. */
export async function dupliquer(id, client, projet, auteur = "") {
  const src = await lire(id);
  if (!src) throw Object.assign(new Error("Planning introuvable."), { statut: 404 });
  return enregistrer({ client, projet, titre: `${client} · ${projet}`, data: src.data }, auteur);
}
