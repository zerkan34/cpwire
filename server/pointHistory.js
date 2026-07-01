// pointHistory.js — historique daté du « point du soir », côté serveur.
//
// Problème corrigé : jusqu'ici les écarts (« +N entrés / −N sortis ») du point du
// soir étaient calculés UNIQUEMENT dans le navigateur (localStorage, clé
// cpwire:point:<dossier><scope>). Conséquences : ils n'apparaissaient qu'au 2e jour
// de consultation d'un dossier donné, par navigateur, et le « Clear PWA cache » du
// déploiement les effaçait. D'où le « +N » qui ne sortait que sur le dossier ouvert
// chaque jour (Tafanel).
//
// Correctif : on mémorise l'instantané CÔTÉ SERVEUR. Pour chaque dossier (+ le
// pseudo-dossier « Tous dossiers ») et chaque périmètre (scope = "" pour tout,
// "::PREFIXE" par projet), on enregistre, par jour, la liste des CLÉS de tickets par
// catégorie suivie. La baseline (dernier jour antérieur) devient donc PARTAGÉE,
// PERSISTANTE et disponible dès qu'au moins deux jours distincts ont été relevés,
// quel que soit le navigateur.
//
// Règle sacrée respectée : zéro invention. On n'enregistre que des clés de tickets
// réelles, telles que classées par jira.js/config.js (champ `categorie`). Digitaliser
// l'existant (relever des clés au fil des jours) est permis ; fabriquer une valeur ne
// l'est pas.

import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";
import { CATEGORY_LABEL } from "./config.js";

const FILE = path.join(dataDir(), "point-history.json");
const KEEP_DAYS = 14;

// Catégories suivies par « Le point du soir » — STRICTEMENT les mêmes que le front
// (web/src/components/PointDuSoir.jsx, constante ROWS).
const ROW_CATS = ["miseEnProd", "termine", "recetteClient", "recetteArmonie", "encours", "retourTest", "attenteClient"];

// Pseudo-dossier agrégé (le front passe ce libellé exact quand aucun client n'est isolé).
const ALL = "Tous dossiers";

// Normalisation IDENTIQUE au front (Client360 `norm`) pour une parité de clé sûre,
// même si la casse/les accents diffèrent entre `canonDossier` et `i.dossier`.
const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const todayStr = () => new Date().toISOString().slice(0, 10);

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) || {}; } catch { return {}; }
}
function save(db) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
    return true;
  } catch (e) {
    console.error("pointHistory.save:", e.message);
    return false;
  }
}

// { miseEnProd:[clés], termine:[clés], ... } pour un sous-ensemble d'issues.
function catsOf(issues) {
  const out = {}; ROW_CATS.forEach((k) => { out[k] = []; });
  for (const i of issues) { if (out[i.categorie]) out[i.categorie].push(i.cle); }
  return out;
}

function setDay(node, scopeKey, day, cats) {
  const s = (node[scopeKey] ||= {});
  s[day] = cats;
}

// Ne garde que les KEEP_DAYS derniers jours par (dossier, scope).
function trim(db) {
  for (const node of Object.values(db)) {
    for (const scopeKey of Object.keys(node)) {
      const days = Object.keys(node[scopeKey]).sort();
      if (days.length > KEEP_DAYS) {
        const keep = days.slice(-KEEP_DAYS);
        const kept = {}; keep.forEach((d) => { kept[d] = node[scopeKey][d]; });
        node[scopeKey] = kept;
      }
    }
  }
}

// Enregistre l'état du jour pour tous les (dossier, scope). Last-write-wins par jour :
// l'entrée du jour J reflète toujours la dernière synchro de J (≈ état de fin de journée),
// exactement comme le faisait le localStorage du front.
export function recordDay(issues) {
  if (!Array.isArray(issues) || !issues.length) return false;
  const db = load();
  const day = todayStr();

  // Regroupement par dossier réel + agrégat « Tous dossiers ».
  const byDoss = {};
  for (const i of issues) { (byDoss[i.dossier || "Autre"] ||= []).push(i); }
  const groups = { ...byDoss, [ALL]: issues };

  for (const [dossier, list] of Object.entries(groups)) {
    const node = (db[dossier] ||= {});
    // scope "" = tout le dossier
    setDay(node, "", day, catsOf(list));
    // scopes par préfixe de projet (seulement si plusieurs projets présents,
    // condition `multi` du front : prefixes.length > 1).
    const prefixes = [...new Set(list.map((i) => i.projet).filter(Boolean))];
    if (prefixes.length > 1) {
      for (const p of prefixes) setDay(node, `::${p}`, day, catsOf(list.filter((i) => i.projet === p)));
    }
  }

  trim(db);
  return save(db);
}

// Baseline = dernier jour STRICTEMENT antérieur à aujourd'hui pour (dossier, scope).
// Lookup du dossier par comparaison NORMALISÉE (parité avec canonDossier du front).
// Renvoie { date, cats:{cat:[clés]} } ou null si pas d'antériorité.
export function baselineFor(dossier, scopeKey = "") {
  const db = load();
  // 1) clé exacte, sinon 2) clé normalisée-égale.
  let node = db[dossier];
  if (!node) {
    const target = norm(dossier);
    const hit = Object.keys(db).find((k) => norm(k) === target);
    node = hit ? db[hit] : null;
  }
  const s = node && node[scopeKey || ""];
  if (!s) return null;
  const today = todayStr();
  const past = Object.keys(s).filter((d) => d < today).sort();
  if (!past.length) return null;
  const date = past[past.length - 1];
  return { date, cats: s[date] };
}

// ---- Dérivation pour le FLUX D'ACTIVITÉ (traîne des jours précédents + pouls par client) ----
// À partir des relevés quotidiens, on reconstruit les MOUVEMENTS de catégorie réellement
// observés entre deux relevés consécutifs (granularité = jour, état de fin de journée).
// Ne couvre que les catégories suivies (ROW_CATS : recette/prod/terminé/en cours/attente/retour test).
// Règle sacrée : zéro invention — on ne dérive que des changements présents entre deux instantanés réels.

// { clé -> catégorie } pour un instantané { cat:[clés] }.
function catByKeyForDay(cats) {
  const m = {};
  for (const c of ROW_CATS) for (const k of (cats[c] || [])) m[k] = c;
  return m;
}

// daysBack = nb de jours (hors aujourd'hui) à remonter. Renvoie :
//   { days:[{ day, count, movements:[{cle,dossier,fromCat,toCat,fromLabel,toLabel}] }],  // le + récent d'abord
//     pulse:{ [dossier]: [{ day, n }] } }                                                  // chronologique (pour sparkline)
export function deriveFromPointHistory(daysBack = 14) {
  const db = load();
  const today = todayStr();
  const byDay = {}; // day -> movements[]
  for (const [dossier, node] of Object.entries(db)) {
    if (dossier === ALL) continue;      // on garde les vrais dossiers (l'agrégat serait redondant)
    const s = node[""];                  // scope = tout le dossier
    if (!s) continue;
    const days = Object.keys(s).sort();
    for (let i = 1; i < days.length; i++) {
      const dPrev = days[i - 1], d = days[i];
      if (d >= today) continue;          // aujourd'hui est déjà couvert à l'heure par le flux
      const prev = catByKeyForDay(s[dPrev]);
      const cur = catByKeyForDay(s[d]);
      for (const [cle, cat] of Object.entries(cur)) {
        const was = prev[cle];
        if (was && was !== cat) (byDay[d] ||= []).push({ cle, dossier, fromCat: was, toCat: cat });
        else if (!was) (byDay[d] ||= []).push({ cle, dossier, fromCat: "", toCat: cat }); // entrée dans le suivi
      }
    }
  }
  const allDays = Object.keys(byDay).sort().slice(-daysBack); // chronologique
  const days = allDays.slice().reverse().map((day) => ({
    day,
    count: (byDay[day] || []).length,
    movements: (byDay[day] || []).map((m) => ({
      ...m,
      fromLabel: m.fromCat ? (CATEGORY_LABEL[m.fromCat] || m.fromCat) : "",
      toLabel: CATEGORY_LABEL[m.toCat] || m.toCat,
    })),
  }));
  // Pouls par client : mouvements/jour sur la fenêtre (0 comblé pour un axe continu).
  const pulse = {};
  for (const day of allDays) for (const m of (byDay[day] || [])) {
    (pulse[m.dossier] ||= {}); pulse[m.dossier][day] = (pulse[m.dossier][day] || 0) + 1;
  }
  const pulseArr = {};
  for (const [dossier, map] of Object.entries(pulse)) {
    pulseArr[dossier] = allDays.map((day) => ({ day, n: map[day] || 0 }));
  }
  return { days, pulse: pulseArr };
}

// ---- Séries par dossier pour les PROJECTIONS -------------------------------
// Renvoie, par dossier (scope global ""), la série chronologique des comptages
// dérivés des instantanés RÉELS déjà relevés. Aucune donnée fabriquée : on ne
// fait que compter des clés déjà enregistrées.
//   done   = miseEnProd + termine
//   reste  = recetteClient + recetteArmonie + encours + retourTest + attenteClient
//   suivi  = done + reste (working set réellement suivi ; hors « à faire » / annulés)
export function seriesByDossier() {
  const db = load();
  const out = {};
  for (const [dossier, node] of Object.entries(db)) {
    const s = node && node[""];
    if (!s) continue;
    const days = Object.keys(s).sort();
    if (!days.length) continue;
    out[dossier] = days.map((day) => {
      const c = s[day] || {};
      const n = (k) => Array.isArray(c[k]) ? c[k].length : 0;
      const done = n("miseEnProd") + n("termine");
      const reste = n("recetteClient") + n("recetteArmonie") + n("encours") + n("retourTest") + n("attenteClient");
      return { day, done, reste, suivi: done + reste };
    });
  }
  return out;
}
