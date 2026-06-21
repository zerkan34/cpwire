import React from "react";

// Sévérité du moteur « Attention requise » → classe couleur (même verdict partout).
const SEV_CLS = { critique: "red", surveiller: "amber", controle: "green" };

function Card({ dossier, f, eng, att, onClick, onOpen360, can360 }) {
  // La carte prend la couleur du moteur ; repli simple tant que l'attention n'est pas chargée.
  const sev = att?.severity || ((f.enRetard || 0) > 0 || (f.retours || 0) > 2 ? "surveiller" : "controle");
  const cls = SEV_CLS[sev] || "green";
  const reason = att?.reasons?.[0]?.text || null;
  return (
    <div className={`pcard sev-${cls}`} onClick={onClick}>
      <div className="pc-head">
        <div className="pc-title">
          <span className={`pc-pastille ${cls}`} aria-hidden="true" />
          <h3>{dossier}</h3>
          {eng ? <span className={`eng-badge ${eng === "Projet" ? "is-projet" : eng === "TMA" ? "is-tma" : "is-mix"}`}>{eng}</span> : null}
        </div>
      </div>
      {sev !== "controle" && reason
        ? <div className={`pc-reason ${cls}`}>{reason}</div>
        : <div className="pc-reason calm">À jour</div>}
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

export default function Portfolio({ facts, engagement = {}, attention = {}, onOpen, onOpen360, can360 }) {
  // Tri « risque en haut » : on suit le score du moteur Attention ; repli local sinon.
  const localScore = (f) => (f.enRetard || 0) * 1000 + (f.retours || 0) * 50 + (f.reste || 0);
  const score = (d, f) => (attention[d]?.score ?? localScore(f));
  const entries = Object.entries(facts?.byDossier || {}).sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]));
  if (!entries.length) return <div className="panel empty">Aucun projet à afficher pour l'instant.</div>;
  return (
    <div className="cards">
      {entries.map(([dossier, f]) => (
        <Card key={dossier} dossier={dossier} f={f} eng={engagement[dossier]} att={attention[dossier]}
          onClick={() => onOpen(dossier)} onOpen360={onOpen360} can360={can360} />
      ))}
    </div>
  );
}
