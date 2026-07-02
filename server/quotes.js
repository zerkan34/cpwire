// quotes.js — LA COTE DU PORTEFEUILLE.
// -----------------------------------------------------------------------------
// Reframe l'app de l'ÉTAT vers le MOUVEMENT (logique d'écran de marché). Aucun
// total absolu ici : uniquement des DÉRIVÉES qui, elles, ne se répètent jamais —
// valeur (cours = avancement %), variation depuis le dernier point, mini-courbe,
// volume du jour (mouvements), vélocité (résorption/j), risque (composite), et un
// INDICE global unique + un TÉLÉSCRIPTEUR des derniers mouvements.
//
// RÈGLE SACRÉE : tout est dérivé de faits déjà relevés (pointHistory, mouvements,
// projections, risque). Historique insuffisant ⇒ variation « — », pas d'invention.

import { seriesByDossier } from "./pointHistory.js";

const pctOf = (done, suivi) => (suivi > 0 ? Math.round((done / suivi) * 1000) / 10 : null);

export function buildQuotes({ pointDerived = null, projections = null, risk = null } = {}) {
  const series = seriesByDossier();                       // {dossier:[{day,done,reste,suivi}]}
  const pulse = (pointDerived && pointDerived.pulse) || {}; // {dossier:[{day,n}]}
  const veloc = {}; for (const d of (projections?.dossiers || [])) veloc[d.dossier] = d.rythme;
  const riskMap = {}; for (const d of (risk?.dossiers || [])) riskMap[d.dossier] = d;

  const quotes = [];
  for (const [dossier, s] of Object.entries(series)) {
    if (dossier === "Tous dossiers" || !s.length) continue;
    const last = s[s.length - 1];
    const prev = s.length >= 2 ? s[s.length - 2] : null;
    const value = pctOf(last.done, last.suivi);           // « cours » = avancement %
    const prevValue = prev ? pctOf(prev.done, prev.suivi) : null;
    const varPct = value != null && prevValue != null ? Math.round((value - prevValue) * 10) / 10 : null;
    const varDone = prev ? last.done - prev.done : null;  // tickets terminés depuis le dernier point
    const spark = s.slice(-14).map((x) => pctOf(x.done, x.suivi)).filter((v) => v != null);
    const pl = pulse[dossier] || [];
    const volume = pl.length ? pl[pl.length - 1].n : 0;   // mouvements du dernier jour
    const dir = varDone == null ? "flat" : varDone > 0 ? "up" : varDone < 0 ? "down" : "flat";
    quotes.push({
      dossier,
      value, varPct, varDone, dir,
      spark,
      volume,
      velocite: veloc[dossier] != null ? veloc[dossier] : null,   // terminés/jour
      risque: riskMap[dossier] ? riskMap[dossier].score : null,
      niveau: riskMap[dossier] ? riskMap[dossier].niveau : null,
      suivi: last.suivi,
    });
  }

  // Tri « ce qui bouge le plus » : |variation| puis volume puis risque.
  quotes.sort((a, b) =>
    (Math.abs(b.varDone || 0) - Math.abs(a.varDone || 0)) ||
    (b.volume - a.volume) ||
    ((b.risque || 0) - (a.risque || 0)));

  // ---- INDICE GLOBAL (un seul nombre qui monte/descend), agrégé par jour. ----
  const perDay = {};
  for (const s of Object.values(series)) for (const x of s) {
    (perDay[x.day] ||= { done: 0, suivi: 0 });
    perDay[x.day].done += x.done; perDay[x.day].suivi += x.suivi;
  }
  const days = Object.keys(perDay).sort();
  const idxSeries = days.map((d) => pctOf(perDay[d].done, perDay[d].suivi)).filter((v) => v != null);
  const idxVal = idxSeries.length ? idxSeries[idxSeries.length - 1] : null;
  const idxPrev = idxSeries.length >= 2 ? idxSeries[idxSeries.length - 2] : null;
  const idxVar = idxVal != null && idxPrev != null ? Math.round((idxVal - idxPrev) * 10) / 10 : null;
  const lastDay = days.length ? days[days.length - 1] : null;
  const prevDay = days.length >= 2 ? days[days.length - 2] : null;
  const doneVar = lastDay && prevDay ? perDay[lastDay].done - perDay[prevDay].done : null;
  const volTotal = quotes.reduce((n, q) => n + (q.volume || 0), 0);
  const index = {
    label: "Indice portefeuille",
    value: idxVal, variation: idxVar, doneVar,
    spark: idxSeries.slice(-14),
    dir: doneVar == null ? "flat" : doneVar > 0 ? "up" : doneVar < 0 ? "down" : "flat",
    volume: volTotal,
    dossiers: quotes.length,
  };

  // ---- TÉLÉSCRIPTEUR : derniers mouvements (2 derniers jours), plus récents d'abord. ----
  const ds = (pointDerived && Array.isArray(pointDerived.days)) ? pointDerived.days : [];
  const ticker = [];
  for (let i = ds.length - 1; i >= 0 && ticker.length < 40; i--) {
    for (const m of (ds[i].movements || [])) {
      ticker.push({ cle: m.cle, dossier: m.dossier || "—", from: m.fromLabel || m.fromCat || "", to: m.toLabel || m.toCat || "", dir: m.regression ? "down" : "up", day: ds[i].day });
      if (ticker.length >= 40) break;
    }
  }

  return { generatedAt: new Date().toISOString(), index, quotes, ticker };
}
