// projections.js — PROJECTIONS ancrées sur l'historique réel (pointHistory).
// -----------------------------------------------------------------------------
// À partir des instantanés quotidiens DÉJÀ relevés, on calcule sans rien inventer :
//   - le rythme de résorption (tickets terminés par jour, sur la fenêtre observée) ;
//   - une tendance (accélère / stable / décroche) en comparant deux moitiés ;
//   - une projection de délai pour absorber le reste À CE RYTHME.
//
// GARDE-FOUS (règle sacrée) :
//   - Il faut au moins 2 jours d'historique distincts, sinon rien (« — »).
//   - Toute sortie est ÉTIQUETÉE « projection » avec le nombre de jours de recul.
//   - Un rythme nul ou négatif ⇒ pas de date projetée (on ne divise pas par ~0).
//   - On ne projette JAMAIS un fait : c'est une extrapolation clairement assumée.

import { seriesByDossier } from "./pointHistory.js";

const MIN_POINTS = 2;

function slope(series, key) {
  // pente moyenne (Δ/jour) entre le premier et le dernier point de la fenêtre.
  if (series.length < 2) return null;
  const a = series[0], b = series[series.length - 1];
  const days = (Date.parse(b.day) - Date.parse(a.day)) / 86400000;
  if (!days) return null;
  return (b[key] - a[key]) / days;
}

function trendLabel(series) {
  // Compare le rythme de résorption de la 1re moitié à celui de la 2de.
  if (series.length < 4) return "insuffisant";
  const mid = Math.floor(series.length / 2);
  const r1 = slope(series.slice(0, mid + 1), "done");
  const r2 = slope(series.slice(mid), "done");
  if (r1 == null || r2 == null) return "insuffisant";
  const d = r2 - r1;
  if (Math.abs(d) < 0.15) return "stable";
  return d > 0 ? "accélère" : "décroche";
}

export function buildProjections() {
  const byDoss = seriesByDossier();
  const dossiers = [];
  for (const [dossier, series] of Object.entries(byDoss)) {
    if (dossier === "Tous dossiers") continue;
    const jours = series.length;
    if (jours < MIN_POINTS) { dossiers.push({ dossier, jours, insuffisant: true }); continue; }
    const rate = slope(series, "done");             // terminés/jour
    const last = series[series.length - 1];
    const reste = last.reste;
    const etaJours = (rate != null && rate > 0.05) ? Math.ceil(reste / rate) : null;
    const etaDate = etaJours != null ? new Date(Date.now() + etaJours * 86400000).toISOString().slice(0, 10) : null;
    dossiers.push({
      dossier, jours,
      rythme: rate != null ? Math.round(rate * 100) / 100 : null,  // terminés/jour
      reste, suivi: last.suivi,
      tendance: trendLabel(series),
      etaJours, etaDate,
    });
  }
  // Ordre : ceux qui décrochent d'abord, puis reste décroissant.
  const rank = { "décroche": 0, "stable": 1, "accélère": 2, "insuffisant": 3 };
  dossiers.sort((a, b) => (rank[a.tendance] ?? 3) - (rank[b.tendance] ?? 3) || (b.reste || 0) - (a.reste || 0));
  const withData = dossiers.filter((d) => !d.insuffisant).length;
  return { generatedAt: new Date().toISOString(), dossiers, withData, total: dossiers.length };
}
