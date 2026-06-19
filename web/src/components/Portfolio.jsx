import React from "react";

// Indicateur de santé simple à partir des retards / retours (chiffres canoniques).
function health(f) {
  if (f.enRetard > 1) return ["amber", "À suivre"];
  if (f.enRetard > 0 || f.retours > 2) return ["amber", "À surveiller"];
  return ["green", "Conforme"];
}

function Card({ dossier, f, eng, onClick, onOpen360, can360 }) {
  const [hCls, hLbl] = health(f);
  return (
    <div className="pcard" onClick={onClick}>
      <div className="pc-head">
        <div className="pc-title">
          <h3>{dossier}</h3>
          {eng ? <span className={`eng-badge ${eng === "Projet" ? "is-projet" : eng === "TMA" ? "is-tma" : "is-mix"}`}>{eng}</span> : null}
        </div>
        <span className={`health ${hCls}`}>{hLbl}</span>
      </div>
      <div className="meta">{f.total} ticket{f.total > 1 ? "s" : ""} · {f.reste} à traiter · {f.pct}% validé</div>
      <div className="pbar"><span style={{ width: `${f.pct}%` }} /></div>
      <div className="stats">
        {f.enRetard > 0 && <span className="dot block">{f.enRetard} en retard</span>}
        {f.retours > 0 && <span className="dot ret">{f.retours} retour{f.retours > 1 ? "s" : ""}</span>}
        <span className="dot todo">{f.cats.afaire} à faire</span>
        <span className="dot prog">{f.actifsDev} en cours</span>
        {f.enRecette > 0 && <span className="dot rec">{f.enRecette} en recette</span>}
        <span className="dot done">{f.valides} validé{f.valides > 1 ? "s" : ""}</span>
      </div>
      {onOpen360 && (!can360 || can360(dossier)) ? <button className="pcard-360" onClick={(e) => { e.stopPropagation(); onOpen360(dossier); }} title="Vue complète du client">Fiche 360°</button> : null}
    </div>
  );
}

export default function Portfolio({ facts, engagement = {}, onOpen, onOpen360, can360 }) {
  const entries = Object.entries(facts?.byDossier || {}).sort((a, b) => b[1].total - a[1].total);
  if (!entries.length) return <div className="panel empty">Aucun projet à afficher pour l'instant.</div>;
  return (
    <div className="cards">
      {entries.map(([dossier, f]) => (
        <Card key={dossier} dossier={dossier} f={f} eng={engagement[dossier]} onClick={() => onOpen(dossier)} onOpen360={onOpen360} can360={can360} />
      ))}
    </div>
  );
}
