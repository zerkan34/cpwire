import React from "react";

export default function Filters({
  issues, statuts, dossier, statut, onlyLate, onlyMine, me,
  onDossier, onStatut, onToggleLate, onToggleMine,
}) {
  const dossiers = ["Tous", ...Array.from(new Set(issues.map((i) => i.dossier))).sort()];
  const count = (key, val) => (val === "Tous" ? issues.length : issues.filter((i) => i[key] === val).length);

  return (
    <>
      <div className="filters">
        <span className="fg-lbl">Dossier</span>
        {dossiers.map((d) => (
          <button key={d} className={`fbtn ${dossier === d ? "active" : ""}`} onClick={() => onDossier(d)}>
            {d}<span className="cnt">{d === "Tous" ? issues.length : count("dossier", d)}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <span className="fg-lbl">Statut</span>
        <button className={`fbtn ${statut === "Tous" ? "active" : ""}`} onClick={() => onStatut("Tous")}>
          Tous<span className="cnt">{issues.length}</span>
        </button>
        {statuts.map((s) => (
          <button key={s} className={`fbtn ${statut === s ? "active" : ""}`} onClick={() => onStatut(s)}>
            {s}<span className="cnt">{count("statut", s)}</span>
          </button>
        ))}
        <button className={`fbtn ${onlyLate ? "active" : ""}`} onClick={onToggleLate}>
          En retard<span className="cnt">{issues.filter((i) => i.enRetard).length}</span>
        </button>
        <button className={`fbtn ${onlyMine ? "active" : ""}`} onClick={onToggleMine}>
          Mes tickets<span className="cnt">{issues.filter((i) => i.mine).length}</span>
        </button>
      </div>
    </>
  );
}
