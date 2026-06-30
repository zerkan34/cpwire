import React, { useState } from "react";
import Referentiel from "./Referentiel.jsx";
import RefAnalyse from "./RefAnalyse.jsx";
import Connaissance from "./Connaissance.jsx";
import { RefBoundary } from "./RefState.jsx";

// Cœur « Référence » : trois vues navigables au lieu d'une page-fleuve.
//   Annuaire  — catalogue programmes/options × tickets (cliquable bout en bout)
//   Analyse   — lecture analytique du portefeuille (recette client, reprises, devs, du jour)
//   Mémoire   — base de connaissance éditable + contexte appris par l'IA (owner)
const VIEWS = [
  { id: "annuaire", label: "Annuaire", desc: "Programmes, options et tickets liés" },
  { id: "analyse", label: "Analyse & apprentissage", desc: "Ce que disent les données Jira" },
  { id: "memoire", label: "Mémoire", desc: "Connaissance + appris par l'IA", owner: true },
];

export default function Reference({ issues = [], role = "", onTicket, onDev }) {
  const views = VIEWS.filter((v) => !v.owner || role === "owner");
  const [view, setView] = useState("annuaire");
  const cur = views.find((v) => v.id === view) || views[0];

  return (
    <div className="ref-core">
      <div className="ref-head">
        <h2>Référence</h2>
        <p>Le socle vivant du portefeuille : l'annuaire des programmes rapprochés de leurs tickets, la lecture analytique des données Jira en direct, et la mémoire d'équipe que l'assistant enrichit automatiquement.</p>
      </div>

      <nav className="ref-nav" role="tablist" aria-label="Vues de la référence">
        {views.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={`ref-navbtn ${view === v.id ? "on" : ""}`}
            onClick={() => setView(v.id)}
          >
            <span className="ref-navbtn-l">{v.label}</span>
            <span className="ref-navbtn-d">{v.desc}</span>
          </button>
        ))}
      </nav>

      <div className="ref-view" key={view}>
        <RefBoundary>
          {cur.id === "annuaire" && <Referentiel issues={issues} onTicket={onTicket} />}
          {cur.id === "analyse" && <RefAnalyse issues={issues} onTicket={onTicket} onDev={onDev} />}
          {cur.id === "memoire" && role === "owner" && <Connaissance issues={issues} onTicket={onTicket} onDev={onDev} />}
        </RefBoundary>
      </div>
    </div>
  );
}
