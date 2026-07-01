// sla.js — Pilotage des engagements (SLA) par client.
// Cibles GTI (prise en charge) / GTR (résolution) par dossier et par priorité,
// définies dans server/sla.json (éditable, survit aux redéploiements).
//
// v1 : calcul du GTR (résolution) à partir du snapshot déjà chargé — AUCUN appel Jira en plus.
//   - tickets résolus : (résolu − créé) comparé à la cible GTR → respecté / dépassé
//   - tickets ouverts : âge (maintenant − créé) vs cible → dépassé / à risque / dans les temps
// Le GTI (prise en charge) nécessite l'historique ticket par ticket → phase 2.
//
// Délais exprimés en HEURES, calendaires (pas encore "heures ouvrées" — affinable).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = process.env.SLA_JSON || path.join(__dirname, "sla.json");

let CONFIG = { defaut: {}, dossiers: {} };
try {
  if (fs.existsSync(JSON_PATH)) {
    CONFIG = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) || CONFIG;
    const n = Object.keys(CONFIG.dossiers || {}).length;
    console.log(`[sla] cibles chargées : ${n} dossier(s) + défaut, depuis ${JSON_PATH}`);
  } else {
    console.log(`[sla] aucune config (${JSON_PATH} absent) — onglet SLA inactif.`);
  }
} catch (e) { console.log(`[sla] erreur de chargement : ${e.message}`); }

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// Priorité Jira (libre, FR/EN) → bucket canonique P1..P4.
export function prioBucket(name) {
  const n = norm(name);
  if (/highest|critical|criti|bloqu|urgent|tres haute|p1/.test(n)) return "P1";
  if (/high|haute|elevee|eleve|p2/.test(n)) return "P2";
  if (/medium|moyen|normal|p3/.test(n)) return "P3";
  if (/lowest|trivial|tres bas/.test(n)) return "P4";
  if (/low|bas|mineur|minor|p4/.test(n)) return "P4";
  return "P3"; // défaut raisonnable si priorité absente/inconnue
}

// Cible {gti, gtr} en heures pour un dossier + priorité, avec replis.
function target(dossier, prio) {
  const b = prioBucket(prio);
  const d = (CONFIG.dossiers || {})[dossier] || {};
  const def = CONFIG.defaut || {};
  const t = d[b] || d["*"] || def[b] || def["*"] || null;
  if (!t) return null;
  const gti = Number(t.gti) > 0 ? Number(t.gti) : null;
  const gtr = Number(t.gtr) > 0 ? Number(t.gtr) : null;
  return (gti || gtr) ? { gti, gtr, bucket: b } : null;
}

const HRS = (a, b) => { const x = new Date(a).getTime(), y = new Date(b).getTime(); return (isNaN(x) || isNaN(y)) ? null : (y - x) / 3600000; };
const DONE = new Set(["termine", "miseEnProd"]);

export function configured() { return Object.keys(CONFIG.dossiers || {}).length > 0 || Object.keys(CONFIG.defaut || {}).length > 0; }
export function slaStatus() { return { configured: configured(), dossiers: Object.keys(CONFIG.dossiers || {}), path: JSON_PATH }; }

// Construit le rapport SLA agrégé par dossier (+ global) à partir des tickets.
export function buildSlaReport(issues = []) {
  if (!configured()) return { configured: false, byDossier: [], global: null, depassements: [], aRisque: [] };
  const now = Date.now();
  const agg = {}; // dossier -> compteurs
  const depassements = []; // tickets ouverts déjà en dépassement (les plus en retard d'abord)
  const aRisque = [];

  for (const i of issues) {
    const t = target(i.dossier, i.priorite);
    const a = (agg[i.dossier] ||= { dossier: i.dossier, resolus: 0, gtrOk: 0, gtrKo: 0, ouverts: 0, ouvDepasse: 0, ouvRisque: 0, ouvOk: 0, sansCible: 0 });
    if (!t || !t.gtr) { a.sansCible += 1; continue; }
    const resolu = DONE.has(i.categorie) && i.resolu;
    if (resolu) {
      const h = HRS(i.cree, i.resolu);
      if (h == null) { a.sansCible += 1; continue; }
      a.resolus += 1;
      if (h <= t.gtr) a.gtrOk += 1; else a.gtrKo += 1;
    } else {
      const age = HRS(i.cree, now);
      if (age == null) { a.sansCible += 1; continue; }
      a.ouverts += 1;
      if (age > t.gtr) { a.ouvDepasse += 1; depassements.push({ cle: i.cle, dossier: i.dossier, resume: i.resume, priorite: i.priorite, bucket: t.bucket, ageH: age, gtrH: t.gtr, depassementH: age - t.gtr, statut: i.statut }); }
      else if (age > 0.8 * t.gtr) { a.ouvRisque += 1; aRisque.push({ cle: i.cle, dossier: i.dossier, resume: i.resume, priorite: i.priorite, bucket: t.bucket, ageH: age, gtrH: t.gtr, statut: i.statut }); }
      else a.ouvOk += 1;
    }
  }

  const byDossier = Object.values(agg).map((a) => ({
    ...a,
    tauxGtr: a.resolus > 0 ? Math.round((a.gtrOk / a.resolus) * 100) : null,
  })).sort((x, y) => (y.ouvDepasse - x.ouvDepasse) || ((x.tauxGtr ?? 101) - (y.tauxGtr ?? 101)));

  const sum = (k) => byDossier.reduce((s, d) => s + (d[k] || 0), 0);
  const gResolus = sum("resolus"), gOk = sum("gtrOk");
  const global = {
    resolus: gResolus, gtrOk: gOk, gtrKo: sum("gtrKo"),
    tauxGtr: gResolus > 0 ? Math.round((gOk / gResolus) * 100) : null,
    ouverts: sum("ouverts"), ouvDepasse: sum("ouvDepasse"), ouvRisque: sum("ouvRisque"), sansCible: sum("sansCible"),
  };

  depassements.sort((a, b) => b.depassementH - a.depassementH);
  aRisque.sort((a, b) => (b.ageH / b.gtrH) - (a.ageH / a.gtrH));

  // Liste d'alerte COMPLÈTE (non plafonnée) : dépassés puis à risque, avec un état explicite.
  // Sert au mode « alerte SLA en direct » et au badge SLA de la vue Figés (mapping clé → état).
  const alerts = [
    ...depassements.map((x) => ({ ...x, state: "over" })),
    ...aRisque.map((x) => ({ ...x, state: "risk" })),
  ];

  return { configured: true, byDossier, global, depassements: depassements.slice(0, 50), aRisque: aRisque.slice(0, 30), alerts };
}
