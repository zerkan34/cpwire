import React from "react";
import { cle } from "../lib/commun.js";

// Portefeuille en LISTE éditoriale (refonte accueil) — une rangée lisible par
// dossier : nom, engagement, pastille de risque, avancement, compteurs réels,
// dernier mouvement. Trié par risque puis par attention. Zéro invention.

const rel = (d) => {
  if (!d) return null;
  const t = Date.parse(d); if (isNaN(t)) return null;
  const h = Math.floor((Date.now() - t) / 3600000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return j === 1 ? "hier" : `il y a ${j} j`;
};
const lastMove = (f) => {
  let best = 0;
  for (const i of (f.items || [])) { const t = Date.parse(i.maj || i.cree || ""); if (!isNaN(t) && t > best) best = t; }
  return best ? rel(new Date(best).toISOString()) : null;
};

export default function PortfolioList({ entries = [], risk = {}, engagement = {}, attention = {}, onOpen, onOpen360, can360 }) {
  if (!entries.length) return <div className="panel empty">Aucun dossier à afficher.</div>;
  return (
    <div className="panel eh-list">
      {entries.map(([dossier, f]) => {
        const rk = risk[cle(dossier)];
        const eng = engagement[dossier];
        const mv = lastMove(f);
        const niv = rk && rk.score > 0 ? rk.niveau.replace(/é/g, "e") : null;
        return (
          <div className="eh-row" key={dossier} onClick={() => onOpen && onOpen(dossier)} role="button" tabIndex={0}>
            <div className="eh-row-id">
              <div className="eh-row-name">{dossier}
                {eng ? <span className={`eng-badge ${eng === "Projet" ? "is-projet" : eng === "TMA" ? "is-tma" : "is-mix"}`}>{eng}</span> : null}
              </div>
              <div className="eh-row-sub">
                <span className="eh-dot done">{f.valides} validé{f.valides > 1 ? "s" : ""}</span>
                <span className="eh-dot">{f.reste} à traiter</span>
                {f.enRetard > 0 ? <span className="eh-dot block">{f.enRetard} en retard</span> : null}
                {f.retours > 0 ? <span className="eh-dot ret">{f.retours} retour{f.retours > 1 ? "s" : ""}</span> : null}
              </div>
            </div>
            <div className="eh-row-prog">
              <div className="eh-bar"><span style={{ width: `${f.pct || 0}%` }} /></div>
              <span className="eh-pct">{f.pct || 0}%</span>
            </div>
            <div className="eh-row-end">
              {niv ? <span className={`eh-risk risk-niv-${niv}`} title={rk.facteurs.slice(0, 4).map((x) => `${x.n} ${x.label}`).join(" · ")}>risque {rk.score}</span>
                : <span className="eh-risk eh-risk-ok">sain</span>}
              {mv ? <span className="eh-mv">{mv}</span> : null}
            </div>
            {onOpen360 && (!can360 || can360(dossier)) ? (
              <button className="eh-360" onClick={(e) => { e.stopPropagation(); onOpen360(dossier); }} title="Fiche 360°">360°</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
