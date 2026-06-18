import React from "react";

export default function Filters({
  issues, counts = null, statuts, dossier, statut, onlyLate, onlyMine, onlyFlagged, query, person, priorite,
  onDossier, onStatut, onToggleLate, onToggleMine, onToggleFlagged, onQuery, onPerson, onPriorite, onReset,
}) {
  const dossiers = ["Tous", ...Array.from(new Set(issues.map((i) => i.dossier))).sort()];
  const persons = ["Tous", ...Array.from(new Set(issues.flatMap((i) => (i.contributors && i.contributors.length ? i.contributors : [i.assigne || "Non assigné"])))).sort((a, b) => a.localeCompare(b))];
  const priorites = ["Tous", ...Array.from(new Set(issues.map((i) => i.priorite || "—"))).sort()];
  // Compteurs : si App fournit des compteurs à facettes (cohérents avec le tableau), on les utilise ;
  // sinon repli sur un comptage global.
  const cDossier = (d) => counts ? (d === "Tous" ? counts.dossierAll : (counts.dossier[d] || 0)) : (d === "Tous" ? issues.length : issues.filter((i) => i.dossier === d).length);
  const cStatut = (s) => counts ? (s === "Tous" ? counts.statutAll : (counts.statut[s] || 0)) : (s === "Tous" ? issues.length : issues.filter((i) => i.statut === s).length);
  const cLate = counts ? counts.late : issues.filter((i) => i.enRetard).length;
  const cMine = counts ? counts.mine : issues.filter((i) => i.mine).length;
  const cFlagged = counts ? counts.flagged : issues.filter((i) => i.flagged).length;
  const active = dossier !== "Tous" || statut !== "Tous" || onlyLate || onlyMine || onlyFlagged || person !== "Tous" || priorite !== "Tous" || (query && query.trim());

  return (
    <div className="filter-box">
      <div className="filter-box-hd">
        <span>Filtres</span>
        {active ? <button className="filter-reset" onClick={onReset} title="Réinitialiser tous les filtres">✕ Réinitialiser</button> : null}
      </div>
      <div className="filter-box-bd">
        <div className="filter-grp">
          <span className="fg-lbl">Dossier</span>
          <div className="fg-chips">
            {dossiers.map((d) => (
              <button key={d} className={`fbtn ${dossier === d ? "active" : ""}`} onClick={() => onDossier(d)}>
                {d}<span className="cnt">{cDossier(d)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-grp">
          <span className="fg-lbl">Statut</span>
          <div className="fg-chips">
            <button className={`fbtn ${statut === "Tous" ? "active" : ""}`} onClick={() => onStatut("Tous")}>
              Tous<span className="cnt">{cStatut("Tous")}</span>
            </button>
            {statuts.map((s) => (
              <button key={s} className={`fbtn ${statut === s ? "active" : ""}`} onClick={() => onStatut(s)}>
                {s}<span className="cnt">{cStatut(s)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-grp">
          <span className="fg-lbl">Vues rapides</span>
          <div className="fg-chips">
            <button className={`fbtn ${onlyLate ? "active" : ""}`} onClick={onToggleLate}>
              En retard<span className="cnt">{cLate}</span>
            </button>
            <button className={`fbtn ${onlyMine ? "active" : ""}`} onClick={onToggleMine}>
              Mes tickets<span className="cnt">{cMine}</span>
            </button>
            <button className={`fbtn ${onlyFlagged ? "active" : ""}`} onClick={onToggleFlagged}>
              🚩 Flaggés<span className="cnt">{cFlagged}</span>
            </button>
          </div>
        </div>

        <div className="filter-grp">
          <span className="fg-lbl">Personne</span>
          <select className="fselect" value={person} onChange={(e) => onPerson(e.target.value)}>
            {persons.map((p) => <option key={p} value={p}>{p === "Tous" ? "Toutes" : p}</option>)}
          </select>
          <span className="fg-lbl" style={{ marginLeft: 10 }}>Priorité</span>
          <select className="fselect" value={priorite} onChange={(e) => onPriorite(e.target.value)}>
            {priorites.map((p) => <option key={p} value={p}>{p === "Tous" ? "Toutes" : p}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
