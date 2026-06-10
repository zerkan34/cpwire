import React from "react";

// Détermine un indicateur de santé simple à partir des blocages / retards.
function health(stats) {
  if (stats["Bloqué"] > 0 || stats.enRetard > 1) return ["red", "Risque"];
  if (stats.enRetard > 0) return ["amber", "Attention"];
  return ["green", "Conforme"];
}

function Card({ dossier, stats, onClick }) {
  const total = stats.total || 0;
  const done = stats["Terminé"] || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const [hCls, hLbl] = health(stats);
  return (
    <div className="pcard" onClick={onClick}>
      <span className={`health ${hCls}`}>{hLbl}</span>
      <h3>{dossier}</h3>
      <div className="meta">{total} ticket{total > 1 ? "s" : ""} · {pct}% terminé</div>
      <div className="pbar"><span style={{ width: `${pct}%` }} /></div>
      <div className="stats">
        {stats["Bloqué"] > 0 && <span className="dot block">{stats["Bloqué"]} bloqué{stats["Bloqué"] > 1 ? "s" : ""}</span>}
        <span className="dot todo">{stats["À faire"] || 0} à faire</span>
        <span className="dot prog">{stats["En cours"] || 0} en cours</span>
        <span className="dot done">{done} fait{done > 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

export default function Portfolio({ parDossier, onOpen }) {
  const entries = Object.entries(parDossier || {}).sort((a, b) => b[1].total - a[1].total);
  if (!entries.length) return <div className="panel empty">Aucun projet à afficher pour l'instant.</div>;
  return (
    <div className="cards">
      {entries.map(([dossier, stats]) => (
        <Card key={dossier} dossier={dossier} stats={stats} onClick={() => onOpen(dossier)} />
      ))}
    </div>
  );
}
