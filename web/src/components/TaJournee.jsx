import React from "react";

// ============================================================================
//  « Ta journée » — le radar du matin.
//  100% déterministe, calculé sur les VRAIS chiffres (facts / computeFacts).
//  Aucun texte inventé : on classe les dossiers par ce qui demande attention
//  (retards > retours > non assignés) et on remonte le haut du panier.
// ============================================================================
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function TaJournee({ facts, role, anomalies, changedKeys, onOpen360 }) {
  const g = facts?.global || {};
  const name = role === "owner" ? " Nikko" : "";
  const changed = changedKeys && changedKeys.size ? changedKeys.size : 0;

  // Construction des points d'attention, par ordre de gravité.
  const items = [];
  for (const [d, f] of Object.entries(facts?.byDossier || {})) {
    if (f.enRetard > 0) items.push({ score: 1000 + f.enRetard * 5, dossier: d, tone: "late", txt: `${f.enRetard} ticket${f.enRetard > 1 ? "s" : ""} en retard` });
    if (f.retours > 0) items.push({ score: 500 + f.retours * 3, dossier: d, tone: "ret", txt: `${f.retours} retour${f.retours > 1 ? "s" : ""} à retravailler` });
    if (f.nonAssigne > 0 && f.afaireEncours > 0) items.push({ score: 100 + f.nonAssigne, dossier: d, tone: "na", txt: `${f.nonAssigne} actif${f.nonAssigne > 1 ? "s" : ""} non assigné${f.nonAssigne > 1 ? "s" : ""}` });
  }
  items.sort((a, b) => b.score - a.score);
  const top = items.slice(0, 4);
  const dossiers = new Set(top.map((i) => i.dossier)).size;

  const headline = top.length === 0
    ? "Rien d'urgent — tu peux avancer sereinement."
    : `${dossiers} dossier${dossiers > 1 ? "s" : ""} demande${dossiers > 1 ? "nt" : ""} ton attention aujourd'hui.`;

  return (
    <div className="tj">
      <div className="tj-eyebrow">Ton radar du jour · {cap(DATE_FMT.format(new Date()))}</div>
      <h2 className="tj-greet">{greeting()}{name}.</h2>
      <p className="tj-head">{headline}</p>
      {changed > 0 ? <p className="tj-changed">↻ {changed} ticket{changed > 1 ? "s" : ""} {changed > 1 ? "ont" : "a"} bougé récemment</p> : null}

      <div className="tj-pouls">
        <div className="tj-stat"><b>{g.actifsDev || 0}</b><span>en cours</span></div>
        <div className="tj-stat rec"><b>{g.enRecette || 0}</b><span>en recette</span></div>
        <div className="tj-stat late"><b>{g.enRetard || 0}</b><span>en retard</span></div>
        {anomalies ? <div className="tj-stat"><b>{anomalies}</b><span>anomalies qualité</span></div> : null}
      </div>

      {top.length > 0 ? (
        <div className="tj-list">
          {top.map((it, i) => (
            <div className="tj-item" key={i} onClick={() => onOpen360 && onOpen360(it.dossier)} title={`Ouvrir la fiche ${it.dossier}`}>
              <span className={`tj-dot ${it.tone}`} />
              <span className="tj-item-txt"><span className="tj-item-dossier">{it.dossier}</span> — {it.txt}</span>
              <span className="tj-chev">›</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="tj-calm">✓ Aucun retard, aucun retour en attente. Belle journée pour faire avancer le fond.</p>
      )}
    </div>
  );
}
