import React from "react";
import { PILOT_DATA_URI } from "../pilot.js";

// Petit logo copilote à poser sur n'importe quel conteneur (en haut à droite).
// Au clic : ouvre le copilote au premier plan et lance directement l'analyse
// du contexte fourni (prompt). Réutilisable partout pour une UX cohérente.
export default function CopilotDot({ prompt, title = "Analyser avec le copilote", label = "" }) {
  const ask = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("cpwire-pilot-ask", { detail: { prompt } }));
  };
  return (
    <button type="button" className="copilot-dot" onClick={ask} title={title} aria-label={title}>
      <img src={PILOT_DATA_URI} alt="" />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
