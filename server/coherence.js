// coherence.js — AUDIT DE COHÉRENCE (« on fait pas fausse route »).
// -----------------------------------------------------------------------------
// Croise les données ENTRE ELLES pour lever les incohérences AVANT qu'elles ne
// deviennent des surprises. Ici, tout est calculé à partir des tickets Jira réels
// (aucune valeur fabriquée). Les croisements avec des sources externes (GitLab,
// Arcad) sont PRÉVUS mais déclarés « non connectés » tant que l'accès n'est pas
// fourni — on ne simule jamais un résultat qu'on n'a pas.

const DONE = new Set(["termine", "miseEnProd"]);
const CLOSED = new Set(["termine", "miseEnProd", "annule"]);
const ACTIVE = new Set(["encours", "retourTest", "recetteArmonie", "recetteClient"]);
const today = () => new Date().toISOString().slice(0, 10);
const hasWorker = (i) => !!(i.assigne && String(i.assigne).trim()) || (Array.isArray(i.contributors) && i.contributors.length > 0);
const dstr = (d) => { const t = Date.parse(d); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); };

export function buildCoherence(issues = []) {
  const mk = (i, detail) => ({ cle: i.cle, dossier: i.dossier || "—", resume: i.resume || "", detail });

  const overdueOpen = [];
  const doneFlagged = [];
  const activeUnassigned = [];
  const doneNoDate = [];

  const t = today();
  for (const i of issues) {
    const cat = i.categorie;
    // 1) Échéance dépassée mais ticket non clôturé — le plus contractuel.
    if (i.echeance && !CLOSED.has(cat)) {
      const e = dstr(i.echeance);
      if (e && e < t) overdueOpen.push(mk(i, `échéance ${e} dépassée, statut « ${i.statut} »`));
    }
    // 2) Terminé mais drapeau resté levé — contradiction d'état.
    if (DONE.has(cat) && i.flagged) doneFlagged.push(mk(i, "terminé alors que le drapeau est encore levé"));
    // 3) Actif mais personne dessus — travail sans porteur.
    if (ACTIVE.has(cat) && !hasWorker(i)) activeUnassigned.push(mk(i, `« ${i.statut} » sans assigné ni contributeur`));
    // 4) Terminé sans date de résolution — hygiène de donnée (fiabilité des chiffres).
    if (DONE.has(cat) && !i.resolu) doneNoDate.push(mk(i, "terminé sans date de résolution renseignée"));
  }

  const checks = [
    { id: "overdue_open", label: "Échéance dépassée, ticket non clôturé", severity: "alerte", items: overdueOpen },
    { id: "active_unassigned", label: "Ticket actif sans personne assignée", severity: "alerte", items: activeUnassigned },
    { id: "done_flagged", label: "Terminé mais drapeau encore levé", severity: "attention", items: doneFlagged },
    { id: "done_no_date", label: "Terminé sans date de résolution", severity: "attention", items: doneNoDate },
  ].filter((c) => c.items.length > 0);

  const total = checks.reduce((s, c) => s + c.items.length, 0);

  // Croisements externes — déclarés honnêtement tant que l'accès n'est pas branché.
  const externes = [
    { source: "GitLab", status: "non_connecte", verifie: "« terminé côté Jira sans commit / merge côté GitLab »", hint: "Fournir un accès GitLab (token + projet) pour activer ce croisement." },
    { source: "Arcad", status: "non_connecte", verifie: "« livré/mis en prod sans version Arcad correspondante »", hint: "Fournir un accès Arcad pour activer ce croisement." },
  ];

  return { generatedAt: new Date().toISOString(), checks, total, externes };
}
