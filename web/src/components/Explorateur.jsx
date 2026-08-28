import React, { useEffect, useMemo, useState } from "react";
import IssueTable from "./IssueTable.jsx";
import ActivityFeed from "./ActivityFeed.jsx";
import StaleTickets from "./StaleTickets.jsx";
import Projets from "./Projets.jsx";

// Explorateur — LA surface unique tickets & dossiers. Fusionne quatre anciens
// onglets (Tickets · Suivi projets · Flux d'activité · Tickets figés) en un seul
// endroit : mêmes facettes (recherche, dossier, statut, engagement, en retard)
// qui pilotent toutes les vues, + un simple sélecteur de MODE. Zéro logique
// dupliquée : chaque mode réutilise le composant éprouvé existant.

const STATUTS = ["À faire", "En cours", "Bloqué", "Terminé"];
const MODES = [["liste", "Liste"], ["flux", "Flux d'activité"], ["figes", "Figés"], ["projets", "Suivi projets"]];

function Explorateur({ issues = [], facts, loading, externalQuery = "", onTicket, onDev, onClient, changedKeys }) {
  const [mode, setMode] = useState("liste");
  const [q, setQ] = useState(externalQuery || "");
  useEffect(() => { if (externalQuery != null) setQ(externalQuery); }, [externalQuery]);
  const [dossier, setDossier] = useState("Tous");
  const [statut, setStatut] = useState("Tous");
  const [eng, setEng] = useState("Tous");
  const [retard, setRetard] = useState(false);

  const dossiers = useMemo(() => [...new Set(issues.map((i) => i.dossier).filter(Boolean))].sort(), [issues]);
  const engs = useMemo(() => [...new Set(issues.map((i) => i.engagement).filter(Boolean))].sort(), [issues]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return issues.filter((i) => {
      if (dossier !== "Tous" && i.dossier !== dossier) return false;
      if (statut !== "Tous" && i.statut !== statut) return false;
      if (eng !== "Tous" && i.engagement !== eng) return false;
      if (retard && !i.enRetard) return false;
      if (t) {
        const hay = `${i.cle || ""} ${i.resume || i.titre || ""} ${i.assigne || ""} ${i.dossier || ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [issues, q, dossier, statut, eng, retard]);

  const active = q || dossier !== "Tous" || statut !== "Tous" || eng !== "Tous" || retard;
  const reset = () => { setQ(""); setDossier("Tous"); setStatut("Tous"); setEng("Tous"); setRetard(false); };

  return (
    <div className="xpl">
      <div className="xpl-modes">
        {MODES.map(([id, lab]) => (
          <button key={id} className={`xpl-mode ${mode === id ? "on" : ""}`} onClick={() => setMode(id)}>{lab}</button>
        ))}
        <span className="xpl-hint">Une seule surface — les facettes pilotent toutes les vues.</span>
      </div>

      {mode !== "projets" && (
        <div className="xpl-facets">
          <input className="xpl-search" placeholder="Rechercher — clé, titre, personne, dossier…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={dossier} onChange={(e) => setDossier(e.target.value)} aria-label="Dossier">
            <option value="Tous">Tous les dossiers</option>{dossiers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut">
            <option value="Tous">Tous statuts</option>{STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={eng} onChange={(e) => setEng(e.target.value)} aria-label="Engagement">
            <option value="Tous">TMA + Projet</option>{engs.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="xpl-check"><input type="checkbox" checked={retard} onChange={(e) => setRetard(e.target.checked)} /> En retard</label>
          {active && <button className="xpl-reset" onClick={reset}>× réinitialiser</button>}
          <span className="xpl-count">{filtered.length} ticket{filtered.length > 1 ? "s" : ""}</span>
        </div>
      )}

      <div className="xpl-body">
        {mode === "liste" && <IssueTable rows={filtered} loading={loading} onTicket={onTicket} onDev={onDev} changedKeys={changedKeys} />}
        {mode === "flux" && <ActivityFeed issues={filtered} onTicket={onTicket} onDev={onDev} onClient={onClient} changedKeys={changedKeys} />}
        {mode === "figes" && <StaleTickets issues={filtered} onTicket={onTicket} onDev={onDev} onClient={onClient} changedKeys={changedKeys} />}
        {mode === "projets" && <Projets issues={issues} facts={facts} onTicket={onTicket} onDev={onDev} />}
      </div>
    </div>
  );
}

// Mémoïsé : ce composant est l'un des plus lourds de l'app et ses props sont stables
// (facts et issues mémoïsés côté racine, rappels en useCallback). Sans cela, il se
// re-rendait à chaque frappe de recherche et à chaque changement d'état de la racine.
export default React.memo(Explorateur);
