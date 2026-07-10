import React, { useState } from "react";
import { PILOT_DATA_URI } from "../pilot.js";
import natachaWink from "../assets/natacha-wink.png";

// Natacha en grand dans le header : avatar animé (clin d'œil + léger mouvement de
// tête, en boucle) + barre de recherche. Entrée = on envoie la question à
// l'assistant Natacha (événement écouté par Assistant.jsx → réponse + sources).
export default function NatachaHero() {
  const [q, setQ] = useState("");
  const ask = () => {
    const t = q.trim();
    if (!t) return;
    window.dispatchEvent(new CustomEvent("cpwire-pilot-ask", { detail: { prompt: t } }));
    setQ("");
  };
  return (
    <div className="nhero">
      <button className="nhero-ava" type="button" title="Ouvrir Natacha"
        onClick={() => window.dispatchEvent(new Event("cpwire-pilot"))} aria-label="Hôtesse Natacha">
        <img src={PILOT_DATA_URI} alt="Natacha" draggable="false" />
        <img className="nhero-wink" src={natachaWink} alt="" aria-hidden="true" draggable="false" />
      </button>
      <div className="nhero-search">
        <span className="nhero-search-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }}
          placeholder="Demande à Natacha… (ex. « le patron de Ségurel ? », « à quoi sert le programme XXX ? »)"
          aria-label="Demander à Natacha"
        />
        {q ? <button className="nhero-clear" type="button" onClick={() => setQ("")} aria-label="Effacer">×</button> : null}
        <button className="nhero-go" type="button" onClick={ask} aria-label="Envoyer la question">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
        </button>
      </div>
    </div>
  );
}
