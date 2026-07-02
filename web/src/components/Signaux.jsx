import React, { useState } from "react";
import Sante from "./Sante.jsx";
import SlaAlert from "./SlaAlert.jsx";

// Signaux — LA surface d'alerte unique. Réunit « Santé & signaux » (score de
// risque + cohérence + projections + journal des signaux) et la liste SLA
// opérationnelle, au même endroit, via un simple sélecteur de section.
// Aucune logique réécrite : chaque section réutilise le composant existant.

export default function Signaux({ issues = [], onTicket, onClient, changedKeys }) {
  const [mode, setMode] = useState("sante");
  return (
    <div className="xpl">
      <div className="xpl-modes">
        <button className={`xpl-mode ${mode === "sante" ? "on" : ""}`} onClick={() => setMode("sante")}>Santé &amp; signaux</button>
        <button className={`xpl-mode ${mode === "sla" ? "on" : ""}`} onClick={() => setMode("sla")}>SLA</button>
        <span className="xpl-hint">Risque, cohérence, projections, stagnation &amp; SLA — au même endroit.</span>
      </div>
      <div className="xpl-body">
        {mode === "sante" && <Sante onTicket={onTicket} onClient={onClient} />}
        {mode === "sla" && <SlaAlert issues={issues} onTicket={onTicket} onClient={onClient} changedKeys={changedKeys} />}
      </div>
    </div>
  );
}
