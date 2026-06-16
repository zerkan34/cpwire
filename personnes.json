// hygiene.js — Contrôle qualité des données Jira.
// 100 % à partir du snapshot DÉJÀ chargé : aucun appel Jira en plus, aucune invention.
// On signale, surtout sur les tickets OUVERTS, ce qui manque ou cloche dans Jira,
// pour le faire corriger à la source. Le cockpit ne corrige pas Jira : il montre où ça cloche.

const DONE = new Set(["termine", "miseEnProd"]);
const STALE_DAYS = 30; // un ticket ouvert sans mise à jour depuis 30 j "dort"

const daysSince = (iso) => { const t = new Date(iso).getTime(); return isNaN(t) ? null : (Date.now() - t) / 86400000; };
const isOpen = (i) => !DONE.has(i.categorie) && i.categorie !== "annule";

// Checks "ouverts" : entrent dans le score de qualité du backlog actif.
const OPEN_CHECKS = new Set(["sansPriorite", "sansAssigne", "echeanceDepassee", "dort", "exDevAssigne"]);

export function buildHygiene(issues = [], partis = []) {
  const partiSet = new Set(partis.map((s) => String(s).toLowerCase().trim()).filter(Boolean));
  const def = (id, label, hint) => ({ id, label, hint, tickets: [] });
  const checks = {
    sansPriorite: def("sansPriorite", "Sans priorité", "Ticket ouvert sans priorité Jira renseignée."),
    sansAssigne: def("sansAssigne", "Sans assigné", "Ticket ouvert sans personne assignée."),
    echeanceDepassee: def("echeanceDepassee", "Échéance dépassée", "Ticket ouvert dont la date d'échéance est passée."),
    dort: def("dort", `Sans mouvement (> ${STALE_DAYS} j)`, `Ticket ouvert non mis à jour depuis plus de ${STALE_DAYS} jours.`),
    exDevAssigne: def("exDevAssigne", "Ex-dev encore assigné", "Ticket ouvert encore assigné à une personne marquée « partie »."),
    termineSansResolu: def("termineSansResolu", "Terminé sans date de résolution", "Statut terminé/MEP mais aucune date de résolution dans Jira — incohérence."),
    resoluNonTermine: def("resoluNonTermine", "Résolu mais non clôturé", "Une date de résolution existe mais le ticket n'est ni terminé ni annulé — incohérence."),
  };

  const agg = {}; // dossier -> compteurs
  const card = (i, extra = "") => ({
    cle: i.cle, dossier: i.dossier, resume: i.resume, statut: i.statut,
    prio: i.priorite || "", who: (i.dev && i.dev !== "Non assigné") ? i.dev : (i.assigne || ""), extra,
  });

  for (const i of issues) {
    if (i.categorie === "annule") continue;
    const open = isOpen(i);
    const a = (agg[i.dossier] ||= { dossier: i.dossier, ouverts: 0, aCorriger: 0, incoherences: 0 });
    if (open) a.ouverts += 1;

    let openFlag = false;
    const mark = (id, extra) => {
      checks[id].tickets.push(card(i, extra));
      if (OPEN_CHECKS.has(id)) openFlag = true; else a.incoherences += 1;
    };

    if (open) {
      if (!i.priorite) mark("sansPriorite");
      if (!i.assigne || i.assigne === "Non assigné") mark("sansAssigne");
      if (i.enRetard) mark("echeanceDepassee", i.echeance ? `échéance ${String(i.echeance).slice(0, 10)}` : "");
      const d = daysSince(i.maj);
      if (d != null && d > STALE_DAYS) mark("dort", `dernière maj il y a ${Math.round(d)} j`);
      const dev = String((i.dev && i.dev !== "Non assigné") ? i.dev : (i.assigne || "")).toLowerCase().trim();
      if (dev && partiSet.has(dev)) mark("exDevAssigne", `assigné : ${i.dev || i.assigne}`);
    }
    // Incohérences de données : quel que soit l'état.
    if (DONE.has(i.categorie) && !i.resolu) mark("termineSansResolu");
    if (i.resolu && !DONE.has(i.categorie)) mark("resoluNonTermine", `résolu ${String(i.resolu).slice(0, 10)}`);

    if (openFlag) a.aCorriger += 1;
  }

  const byDossier = Object.values(agg)
    .map((a) => ({ ...a, score: a.ouverts ? Math.round(((a.ouverts - a.aCorriger) / a.ouverts) * 100) : null }))
    .sort((x, y) => (x.score ?? 101) - (y.score ?? 101)); // pires d'abord

  const gOuv = byDossier.reduce((s, d) => s + d.ouverts, 0);
  const gCorr = byDossier.reduce((s, d) => s + d.aCorriger, 0);
  const gInc = byDossier.reduce((s, d) => s + d.incoherences, 0);
  const global = { ouverts: gOuv, aCorriger: gCorr, incoherences: gInc, score: gOuv ? Math.round(((gOuv - gCorr) / gOuv) * 100) : null };

  const checksList = Object.values(checks)
    .map((c) => ({ id: c.id, label: c.label, hint: c.hint, count: c.tickets.length, tickets: c.tickets }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return { global, byDossier, checks: checksList, staleDays: STALE_DAYS };
}
