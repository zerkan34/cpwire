import React, { useEffect, useState } from "react";
import { fetchHygiene } from "../api.js";
import TaJournee from "./TaJournee.jsx";
import DailyRecap from "./DailyRecap.jsx";
import Portfolio from "./Portfolio.jsx";
import EnCours from "./EnCours.jsx";
import Recette from "./Recette.jsx";

// Écran d'accueil UNIQUE : une seule page complète, tout au même endroit.
// Toutes les sections lisent la MÊME donnée (computeFacts / mêmes tickets) :
// aucun chiffre ne peut diverger d'une section à l'autre.
//   1) « Ta journée » — radar du matin (ce qui demande ton attention, vrais chiffres)
//   2) récap temps réel qui explique ce qui bouge
//   3) tableau par dossier (clic → Fiche 360)
//   4) Activité (tickets actifs + mouvements récents)
//   5) Recette (avancement par dossier)
export default function Home({ facts, issues = [], role, engagement, onOpen, onOpen360, can360, onTicket, onDev, deletedDevs, changedKeys }) {
  const [anomalies, setAnomalies] = useState(null);
  useEffect(() => {
    let on = true;
    fetchHygiene()
      .then((r) => { if (on) setAnomalies((r.byDossier || []).reduce((s, d) => s + (d.aCorriger || 0), 0)); })
      .catch(() => { if (on) setAnomalies(null); });
    return () => { on = false; };
  }, []);

  return (
    <div className="home-wrap">
      <TaJournee facts={facts} role={role} anomalies={anomalies} changedKeys={changedKeys} onOpen360={onOpen360} />

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
