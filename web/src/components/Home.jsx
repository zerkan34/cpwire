import React, { useEffect, useState } from "react";
import { fetchHygiene } from "../api.js";
import DailyRecap from "./DailyRecap.jsx";
import Portfolio from "./Portfolio.jsx";
import EnCours from "./EnCours.jsx";
import Recette from "./Recette.jsx";

// Une pastille d'alerte ne s'affiche que si elle a du sens (n > 0).
function Chip({ tone, n, label }) {
  if (!n) return null;
  return <span className={`home-chip ${tone}`}>{n} {label}</span>;
}

// Écran d'accueil UNIQUE : une seule page complète, tout au même endroit.
// Toutes les sections lisent la MÊME donnée (computeFacts / mêmes tickets) :
// aucun chiffre ne peut diverger d'une section à l'autre — c'est un seul calcul.
//   1) ligne d'alertes (chiffres canoniques + anomalies qualité, même source que Qualité)
//   2) récap temps réel qui explique ce qui bouge
//   3) tableau par dossier (clic → Fiche 360)
//   4) Activité (tickets actifs + mouvements récents)
//   5) Recette (avancement par dossier)
export default function Home({ facts, issues = [], engagement, onOpen, onOpen360, can360, onTicket, onDev, deletedDevs, changedKeys }) {
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

      <div className="section-title" style={{ marginTop: 28 }}><span>Activité</span></div>
      <EnCours issues={issues} onTicket={onTicket} onDev={onDev} deletedDevs={deletedDevs} changedKeys={changedKeys} />

      <div className="section-title" style={{ marginTop: 28 }}><span>Recette</span></div>
      <Recette issues={issues} onTicket={onTicket} embedded />
    </div>
  );
}
