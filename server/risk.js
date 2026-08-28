import { CLOS_SET as CLOSED } from "../shared/groupes.js";
// risk.js — SCORE DE RISQUE par dossier.
// -----------------------------------------------------------------------------
// Condense en UN indicateur (0–100) tout ce que le cockpit sait déjà repérer :
// régressions, dépassements SLA (GTR) et de prise en charge (GTI), tickets figés,
// divergences de date, incohérences internes. Chaque point du score est TRACÉ à un
// compte réel (règle sacrée : zéro invention). Le « pourquoi » est toujours déplié.
//
// Ce n'est pas une vérité absolue mais une aide à la priorisation : un chiffre pour
// dire « regarde ici en premier », avec le détail qui le justifie.

// « Figé » = aucune activité depuis longtemps → on mesure la dernière MISE À JOUR
// (i.maj = champ Jira « updated »), et NON statutDepuis (= entrée de catégorie de
// statut, trop grossier : un ticket « En cours » depuis des mois mais travaillé hier
// n'est PAS figé). Utiliser statutDepuis ici saturait le score (tout « critique »).
const daysSinceUpdate = (i) => {
  const d = i.maj; if (!d) return null;
  const t = Date.parse(d); if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
};

// Poids par unité (contribution au score avant plafond à 100).
const W = { reg: 8, slaOver: 12, gtiOver: 7, slaRisk: 4, fige: 3, diverg: 9, incohAlerte: 6 };
const LEVEL = (s) => (s >= 70 ? "critique" : s >= 45 ? "élevé" : s >= 20 ? "modéré" : "faible");

export function buildRiskScores({ issues = [], slaReport = null, radar = [], coherence = null, pointDerived = null } = {}) {
  const byDoss = {};
  const bucket = (d) => (byDoss[d] ||= { dossier: d, reg: 0, slaOver: 0, gtiOver: 0, slaRisk: 0, fige: 0, diverg: 0, incohAlerte: 0, tickets: 0, figesCles: [] });

  // Assiette : nombre de tickets par dossier (pour contextualiser, pas pour scorer).
  for (const i of issues) { bucket(i.dossier || "—").tickets += 1; }

  // Figés : tickets actifs sans changement d'état depuis ≥ 30 j.
  for (const i of issues) {
    if (CLOSED.has(i.categorie)) continue;
    const a = daysSinceUpdate(i);
    if (a != null && a >= 30) { const b = bucket(i.dossier || "—"); b.fige += 1; if (b.figesCles.length < 8) b.figesCles.push(i.cle); }
  }

  // SLA (GTR) : dépassés / à risque.
  for (const al of (slaReport?.alerts || [])) {
    const b = bucket(al.dossier || "—");
    if (al.state === "over") b.slaOver += 1; else if (al.state === "risk") b.slaRisk += 1;
  }
  // GTI (prise en charge) dépassée.
  for (const al of (slaReport?.gtiAlerts || [])) if (al.state === "over") bucket(al.dossier || "—").gtiOver += 1;

  // Régressions du jour (retours en arrière).
  const days = pointDerived && Array.isArray(pointDerived.days) ? pointDerived.days : [];
  const last = days.length ? days[days.length - 1] : null;
  for (const m of (last?.movements || [])) if (m.regression) bucket(m.dossier || "—").reg += 1;

  // Divergences de date.
  for (const r of (radar || [])) if (r.divergence) bucket(r.dossier || "—").diverg += 1;

  // Incohérences internes (uniquement les « alertes » : échéance dépassée, actif sans porteur).
  for (const c of (coherence?.checks || [])) {
    if (c.severity !== "alerte") continue;
    for (const it of (c.items || [])) bucket(it.dossier || "—").incohAlerte += 1;
  }

  const facteurLabel = {
    reg: "régression(s) récente(s)", slaOver: "SLA (résolution) dépassé(s)", gtiOver: "prise en charge (GTI) dépassée",
    slaRisk: "SLA à risque", fige: "ticket(s) figé(s) ≥ 30 j", diverg: "divergence(s) de date", incohAlerte: "incohérence(s) à traiter",
  };

  const dossiers = Object.values(byDoss).map((b) => {
    const facteurs = [];
    let score = 0;
    for (const k of ["reg", "slaOver", "gtiOver", "slaRisk", "fige", "diverg", "incohAlerte"]) {
      if (b[k] > 0) {
        const contrib = b[k] * W[k];
        score += contrib;
        facteurs.push({ cle: k, label: facteurLabel[k], n: b[k], poids: contrib, detail: k === "fige" && b.figesCles.length ? b.figesCles.join(", ") : "" });
      }
    }
    score = Math.min(100, Math.round(score));
    facteurs.sort((x, y) => y.poids - x.poids);
    return { dossier: b.dossier, score, niveau: LEVEL(score), tickets: b.tickets, facteurs };
  }).filter((d) => d.dossier && d.dossier !== "—");

  dossiers.sort((a, b) => b.score - a.score);
  const critiques = dossiers.filter((d) => d.niveau === "critique").length;
  const eleves = dossiers.filter((d) => d.niveau === "élevé").length;
  return { generatedAt: new Date().toISOString(), dossiers, critiques, eleves };
}
