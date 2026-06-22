import React, { useState } from "react";
import { ACTIFS } from "../groups.js";

// Sévérité du moteur « Attention requise » → classe couleur (même verdict partout).
const SEV_CLS = { critique: "red", surveiller: "amber", controle: "green" };
const CAT_LABEL = { encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod" };
const CAT_CLS = { encours: "prog", retourTest: "block", retourProd: "block" };

function Card({ dossier, f, eng, att, onClick, onOpen360, can360, onTicket }) {
  const [open, setOpen] = useState(false);
  // La carte prend la couleur du moteur ; repli simple tant que l'attention n'est pas chargée.
  const sev = att?.severity || ((f.enRetard || 0) > 0 || (f.retours || 0) > 2 ? "surveiller" : "controle");
  const cls = SEV_CLS[sev] || "green";
  const reason = att?.reasons?.[0]?.text || null;
  // « Ce qui se fait » = tickets actifs du dossier (en cours, retour test/prod).
  const active = (f.items || []).filter((i) => ACTIFS.includes(i.categorie));

  return (
    <div className={`pcard sev-${cls}`} onClick={onClick}>
      <div className="pc-head">
        <div className="pc-title">
          <span className={`pc-pastille ${cls}`} aria-hidden="true" />
          <h3>{dossier}</h3>
          {eng ? <span className={`eng-badge ${eng === "Projet" ? "is-projet" : eng === "TMA" ? "is-tma" : "is-mix"}`}>{eng}</span> : null}
        </div>
      </div>
      {sev !== "controle" && reason ? (
        <div className="pc-why">
          <div className={`pc-reason ${cls}`}>{reason}</div>
          {att?.action ? <div className="pc-action">→ {att.action}</div> : null}
        </div>
      ) : (
        <div className="pc-reason calm">À jour</div>
      )}
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

      {active.length > 0 ? (
        <div className="pc-acc">
          <button className="pc-acc-tg" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            <span className={`pc-acc-cv ${open ? "o" : ""}`} aria-hidden="true">›</span>
            Ce qui se fait <b>{active.length}</b>
          </button>
          {open ? (
            <ul className="pc-acc-list">
              {active.map((i) => (
                <li key={i.cle}>
                  <button className="pc-acc-row" onClick={(e) => { e.stopPropagation(); onTicket && onTicket(i); }}>
                    <span className={`pc-acc-pill ${CAT_CLS[i.categorie] || "prog"}`}>{CAT_LABEL[i.categorie] || i.statut}</span>
                    <span className="pc-acc-key">{i.cle}</span>
                    <span className="pc-acc-res">{i.resume}</span>
                    {i.assigne ? <span className="pc-acc-who">{i.assigne}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {onOpen360 && (!can360 || can360(dossier)) ? <button className="pcard-360" onClick={(e) => { e.stopPropagation(); onOpen360(dossier); }} title="Vue complète du client">Fiche 360°</button> : null}
    </div>
  );
}

export default function Portfolio({ facts, engagement = {}, attention = {}, onOpen, onOpen360, can360, onTicket }) {
  // Tri « risque en haut » : on suit le score du moteur Attention ; repli local sinon.
  const localScore = (f) => (f.enRetard || 0) * 1000 + (f.retours || 0) * 50 + (f.reste || 0);
  const score = (d, f) => (attention[d]?.score ?? localScore(f));
  const entries = Object.entries(facts?.byDossier || {}).sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]));
  if (!entries.length) return <div className="panel empty">Aucun projet à afficher pour l'instant.</div>;
  return (
    <div className="cards">
      {entries.map(([dossier, f]) => (
        <Card key={dossier} dossier={dossier} f={f} eng={engagement[dossier]} att={attention[dossier]}
          onClick={() => onOpen(dossier)} onOpen360={onOpen360} can360={can360} onTicket={onTicket} />
      ))}
    </div>
  );
}
