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
