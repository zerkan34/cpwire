// digest.js — DIGEST QUOTIDIEN (« le point du soir qui vient à toi »).
// -----------------------------------------------------------------------------
// Compose, à partir de faits DÉJÀ calculés, un résumé de fin de journée :
// ce qui a bougé, ce qui a dépassé (SLA/GTI), les échéances de la semaine, et
// les récurrences à surveiller. Zéro invention : chaque ligne vient d'une source
// réelle. L'ENVOI (mail/Slack) est séparé et conditionné aux accès (voir app.js) —
// on ne prétend jamais avoir envoyé quelque chose qu'on n'a pas pu envoyer.

const cap = (n, arr) => arr.slice(0, n);

export function buildDigest({ pointDerived = null, slaReport = null, radar = [], recurrences = [] } = {}) {
  const date = new Date().toISOString().slice(0, 10);

  // Mouvements du jour (dernier jour dérivé des instantanés).
  const days = pointDerived && Array.isArray(pointDerived.days) ? pointDerived.days : [];
  const last = days.length ? days[days.length - 1] : null;
  const movs = last && Array.isArray(last.movements) ? last.movements : [];
  const regressions = movs.filter((m) => m.regression)
    .map((m) => ({ cle: m.cle, dossier: m.dossier || "—", detail: `${m.fromLabel || "?"} → ${m.toLabel || "?"}` }));
  const mouvements = { total: movs.length, top: cap(6, movs.map((m) => ({ cle: m.cle, dossier: m.dossier || "—", detail: `${m.fromLabel || "?"} → ${m.toLabel || "?"}` }))) };

  // SLA (résolution) et GTI (prise en charge) — dépassements.
  const overGtr = (slaReport?.alerts || []).filter((a) => a.state === "over");
  const overGti = (slaReport?.gtiAlerts || []).filter((a) => a.state === "over");
  const sla = { depasses: overGtr.length, top: cap(5, overGtr.map((a) => ({ cle: a.cle, dossier: a.dossier || "—", detail: `${a.bucket || ""} +${Math.round(a.depassementH || 0)} h` }))) };
  const gti = { depasses: overGti.length, top: cap(5, overGti.map((a) => ({ cle: a.cle, dossier: a.dossier || "—", detail: `${a.bucket || ""} prise en charge +${Math.round(a.depassementH || 0)} h` }))) };

  // Échéances : en retard + cette semaine (fait deadlines.js).
  const retard = (radar || []).filter((r) => r.statut === "retard").map((r) => ({ dossier: r.dossier, label: r.label, jours: r.joursRestants }));
  const semaine = (radar || []).filter((r) => r.statut === "semaine").map((r) => ({ dossier: r.dossier, label: r.label, jours: r.joursRestants }));
  const echeances = { retard: cap(8, retard), semaine: cap(8, semaine) };

  return {
    date,
    mouvements, regressions: cap(8, regressions),
    sla, gti,
    echeances,
    recurrences: cap(6, recurrences || []),
    vide: !mouvements.total && !sla.depasses && !gti.depasses && !retard.length && !semaine.length,
  };
}

// Version texte simple, prête pour un corps de mail / message Slack.
export function digestText(d) {
  const L = [];
  L.push(`cp|WIRE — point du soir du ${d.date}`);
  L.push("");
  L.push(`• Mouvements aujourd'hui : ${d.mouvements.total}`);
  if (d.regressions.length) L.push(`• Retours en arrière : ${d.regressions.length} (${d.regressions.slice(0, 3).map((r) => r.cle).join(", ")}…)`);
  L.push(`• SLA dépassés (résolution) : ${d.sla.depasses}`);
  L.push(`• Prise en charge dépassée (GTI) : ${d.gti.depasses}`);
  L.push(`• Échéances en retard : ${d.echeances.retard.length} · cette semaine : ${d.echeances.semaine.length}`);
  if (d.recurrences.length) {
    L.push("");
    L.push("Récurrences à surveiller :");
    for (const r of d.recurrences) L.push(`  - ${r.dossier} : ${r.type} ×${r.n}`);
  }
  L.push("");
  L.push("— Établi automatiquement par cp|WIRE, à partir des données Jira. Aucune valeur estimée.");
  return L.join("\n");
}
