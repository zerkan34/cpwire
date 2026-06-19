import React, { useEffect, useState } from "react";
import { fetchHygiene } from "../api.js";
import DailyRecap from "./DailyRecap.jsx";
import Portfolio from "./Portfolio.jsx";

// Une pastille d'alerte ne s'affiche que si elle a du sens (n > 0).
function Chip({ tone, n, label }) {
  if (!n) return null;
  return <span className={`home-chip ${tone}`}>{n} {label}</span>;
}

// Écran d'accueil unique : tout au même endroit.
//  1) la ligne d'alertes (chiffres canoniques + anomalies qualité, même source que l'onglet Qualité)
//  2) le récap temps réel qui explique ce qui bouge
//  3) le tableau par dossier (clic → Fiche 360)
export default function Home({ facts, engagement, onOpen, onOpen360, can360, onTicket, onDev, deletedDevs }) {
  const g = facts?.global || {};
  const [anomalies, setAnomalies] = useState(null);
  useEffect(() => {
    let on = true;
    fetchHygiene()
      .then((r) => { if (on) setAnomalies((r.byDossier || []).reduce((s, d) => s + (d.aCorriger || 0), 0)); })
      .catch(() => { if (on) setAnomalies(null); });
    return () => { on = false; };
  }, []);

  const calme = !g.enRetard && !g.retours && !anomalies;

  return (
    <div className="home-wrap">
      <div className="home-alerts">
        {calme ? (
          <span className="home-chip ok">Rien d'urgent — portefeuille sous contrôle</span>
        ) : (
          <>
            <Chip tone="late" n={g.enRetard} label="en retard" />
            <Chip tone="ret" n={g.retours} label="retours" />
            <Chip tone="rec" n={g.enRecette} label="en recette" />
            <Chip tone="qual" n={anomalies} label="anomalies qualité" />
          </>
        )}
      </div>

      <DailyRecap onTicket={onTicket} onDev={onDev} deletedDevs={deletedDevs} />

      <div className="section-title"><span>Par dossier</span></div>
      <Portfolio facts={facts} engagement={engagement} onOpen={onOpen} onOpen360={onOpen360} can360={can360} />
    </div>
  );
}
