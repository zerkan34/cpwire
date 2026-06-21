// ============================================================================
//  Moteur « Attention requise » — déterministe, explicable, JAMAIS de chiffre
//  inventé. Pour chaque dossier, on dérive une SÉVÉRITÉ (critique/surveiller/
//  contrôle) à partir de signaux objectifs déjà calculés ailleurs :
//    - facts (computeFacts)  : enRetard, retours, enRecette, nonAssigne…
//    - hygiene (/api/hygiene): score qualité par dossier
//    - sla (/api/sla)        : ouvDepasse (GTR dépassé) par dossier
//  Si une source est absente (non chargée, SLA non configuré), son signal est
//  simplement ignoré — rien n'est supposé.
//
//  Extensible : « ticket ancien (souffrance) » et « dév surchargé » viendront
//  brancher la cadence plus tard, sans changer la structure de sortie.
// ============================================================================

import { CLOS } from "./groups.js";

export const SEV = { CRITIQUE: "critique", SURVEILLER: "surveiller", CONTROLE: "controle" };

// Seuils ajustables d'un seul endroit.
export const SEUILS = {
  slaActif: false,      // SLA OFF tant que des cibles GTR réelles par dossier ne sont pas posées
                        // (un SLA par défaut compte tout le backlog comme « dépassé » → faux signal)
  retardRouge: 5,       // enRetard >=  → 🔴
  retardOrange: 1,      // enRetard 1..4 → 🟠
  qualiteRouge: 50,     // score <      → 🔴
  qualiteOrange: 70,    // score <      → 🟠
  recetteOrange: 10,    // enRecette >= → 🟠 (à pousser)
  retoursOrange: 5,     // retours >=   → 🟠
  nonAssigneOrange: 3,  // nonAssigne >= → 🟠
};

const RANK = { [SEV.CRITIQUE]: 2, [SEV.SURVEILLER]: 1, [SEV.CONTROLE]: 0 };

// Signaux d'un dossier, triés du plus grave au moins grave.
// Chaque signal : { level:'red'|'amber', weight, text, action }
function signauxDossier(f, { hyg, slaDoss, slaConfigured, souff }) {
  const S = [];

  // 1) SLA / GTR dépassé — contractuel. Désactivé tant que des cibles réelles
  //    par dossier ne sont pas posées (sinon le défaut flague tout le backlog).
  const ouvDepasse = (SEUILS.slaActif && slaConfigured) ? (slaDoss?.ouvDepasse || 0) : 0;
  if (ouvDepasse > 0)
    S.push({ level: "red", weight: 100000 + ouvDepasse, text: `${ouvDepasse} SLA dépassé${ouvDepasse > 1 ? "s" : ""}`, action: "Arbitrer aujourd'hui — engagement contractuel" });

  // 2) Retards.
  const r = f.enRetard || 0;
  if (r >= SEUILS.retardRouge)
    S.push({ level: "red", weight: 10000 + r, text: `${r} tickets en retard`, action: "Réaffecter / arbitrer les retards" });
  else if (r >= SEUILS.retardOrange)
    S.push({ level: "amber", weight: 3000 + r, text: `${r} ticket${r > 1 ? "s" : ""} en retard`, action: "Traiter les retards" });

  // 3) Qualité des données (hygiène).
  const sc = (hyg && hyg.score != null) ? hyg.score : null;
  if (sc != null && sc < SEUILS.qualiteRouge)
    S.push({ level: "red", weight: 9000 + (100 - sc), text: `qualité des données ${sc}%`, action: "Fiabiliser les tickets (Contrôle qualité)" });
  else if (sc != null && sc < SEUILS.qualiteOrange)
    S.push({ level: "amber", weight: 2000 + (100 - sc), text: `qualité des données ${sc}%`, action: "Nettoyer les tickets (Contrôle qualité)" });

  // 4) Recette à pousser (volume — à surveiller, pas une preuve de blocage).
  const rec = f.enRecette || 0;
  if (rec >= SEUILS.recetteOrange)
    S.push({ level: "amber", weight: 1500 + rec, text: `${rec} en recette à pousser`, action: "Relancer la validation" });

  // 5) Retours à retravailler.
  const ret = f.retours || 0;
  if (ret >= SEUILS.retoursOrange)
    S.push({ level: "amber", weight: 1000 + ret, text: `${ret} retours à retravailler`, action: "Traiter les retours" });

  // 6) Non assignés.
  const na = f.nonAssigne || 0;
  if (na >= SEUILS.nonAssigneOrange)
    S.push({ level: "amber", weight: 500 + na, text: `${na} non assignés`, action: "Affecter un responsable" });

  // 7) Tickets en souffrance (anciens — calculés depuis les dates de création).
  if (souff && souff.n > 0)
    S.push({ level: "amber", weight: 800 + souff.n, text: `${souff.n} en souffrance (+${souff.seuil} j)`, action: "Débloquer les tickets qui traînent" });

  return S.sort((a, b) => b.weight - a.weight);
}

function indexBy(arr, key) {
  const m = {};
  (arr || []).forEach((x) => { if (x && x[key] != null) m[x[key]] = x; });
  return m;
}

// Entrée : facts (computeFacts) + { hygiene, sla } (objets bruts des API, optionnels).
// Sortie : liste triée [{ dossier, severity, rank, reasons:[{level,text}], action, score, nbSignaux }]
export function computeAttention(facts, opts = {}) {
  const hygByDossier = indexBy(opts.hygiene?.byDossier, "dossier");
  const slaByDossier = indexBy(opts.sla?.byDossier, "dossier");
  const slaConfigured = !!opts.sla?.configured;
  const souffrance = opts.souffrance || {};

  const rows = Object.entries(facts?.byDossier || {}).map(([dossier, f]) => {
    const S = signauxDossier(f, { hyg: hygByDossier[dossier], slaDoss: slaByDossier[dossier], slaConfigured, souff: souffrance[dossier] });
    const hasRed = S.some((x) => x.level === "red");
    const hasAmber = S.some((x) => x.level === "amber");
    const severity = hasRed ? SEV.CRITIQUE : hasAmber ? SEV.SURVEILLER : SEV.CONTROLE;
    return {
      dossier,
      severity,
      rank: RANK[severity],
      reasons: S.slice(0, 2).map((x) => ({ level: x.level, text: x.text })),
      action: S.length ? S[0].action : null,
      score: RANK[severity] * 1e6 + (S[0]?.weight || 0),
      nbSignaux: S.length,
    };
  });

  rows.sort((a, b) => b.score - a.score);
  return rows;
}

// Souffrance par dossier : tickets ouverts (non clos) dont l'âge de création
// dépasse le seuil. Réel — dérivé des dates des tickets, rien d'inventé.
// Retour : { [dossier]: { n, maxJours, seuil } }
export function computeSouffrance(issues, seuilJours = 21) {
  const DAY = 86400000;
  const now = Date.now();
  const m = {};
  for (const i of issues || []) {
    if (CLOS.includes(i.categorie)) continue;           // clos → pas en souffrance
    const t = i.cree ? Date.parse(i.cree) : NaN;
    if (!Number.isFinite(t)) continue;
    const age = (now - t) / DAY;
    if (age <= seuilJours) continue;
    const d = i.dossier || "—";
    const e = (m[d] ||= { n: 0, maxJours: 0, seuil: seuilJours });
    e.n += 1;
    if (age > e.maxJours) e.maxJours = Math.round(age);
  }
  return m;
}

// Dév surchargé : signal d'ÉQUIPE (par développeur), pas par dossier.
// DÉSACTIVÉ pour l'instant : `enCours` compte tout le backlog assigné, pas la
// charge réelle du moment → presque tous les devs ressortent « surchargés ».
// À réactiver avec une vraie définition de charge active.
export const DEV_SURCHARGE_ACTIF = false;
export function detectDevsSurcharges(cadence, seuilEnCours = 15) {
  if (!DEV_SURCHARGE_ACTIF) return [];
  return ((cadence && cadence.devs) || [])
    .filter((d) => (d.enCours || 0) >= seuilEnCours)
    .map((d) => ({ nom: d.nom, enCours: d.enCours, plusAncienJours: d.plusAncienJours }))
    .sort((a, b) => b.enCours - a.enCours);
}
