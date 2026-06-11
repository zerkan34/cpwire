import React from "react";

export default function Filters({
  issues, statuts, dossier, statut, onlyLate, onlyMine, onlyFlagged, query, person, priorite,
  onDossier, onStatut, onToggleLate, onToggleMine, onToggleFlagged, onQuery, onPerson, onPriorite, onReset,
}) {
  const dossiers = ["Tous", ...Array.from(new Set(issues.map((i) => i.dossier))).sort()];
  const persons = ["Tous", ...Array.from(new Set(issues.map((i) => i.assigne || "Non assigné"))).sort((a, b) => a.localeCompare(b))];
  const priorites = ["Tous", ...Array.from(new Set(issues.map((i) => i.priorite || "—"))).sort()];
  const count = (key, val) => (val === "Tous" ? issues.length : issues.filter((i) => i[key] === val).length);
  const nbFlagged = issues.filter((i) => i.flagged).length;
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
                {d}<span className="cnt">{d === "Tous" ? issues.length : count("dossier", d)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-grp">
          <span className="fg-lbl">Statut</span>
          <div className="fg-chips">
            <button className={`fbtn ${statut === "Tous" ? "active" : ""}`} onClick={() => onStatut("Tous")}>
              Tous<span className="cnt">{issues.length}</span>
            </button>
            {statuts.map((s) => (
              <button key={s} className={`fbtn ${statut === s ? "active" : ""}`} onClick={() => onStatut(s)}>
                {s}<span className="cnt">{count("statut", s)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-grp">
          <span className="fg-lbl">Vues rapides</span>
          <div className="fg-chips">
            <button className={`fbtn ${onlyLate ? "active" : ""}`} onClick={onToggleLate}>
              En retard<span className="cnt">{issues.filter((i) => i.enRetard).length}</span>
            </button>
            <button className={`fbtn ${onlyMine ? "active" : ""}`} onClick={onToggleMine}>
              Mes tickets<span className="cnt">{issues.filter((i) => i.mine).length}</span>
            </button>
            <button className={`fbtn ${onlyFlagged ? "active" : ""}`} onClick={onToggleFlagged}>
              🚩 Flaggés<span className="cnt">{nbFlagged}</span>
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
