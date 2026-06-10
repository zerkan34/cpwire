import React, { useEffect, useState } from "react";
import { fetchHistory } from "../api.js";
import { frDate } from "../utils.js";

const LABELS = { cr_journalier: "CR journalier", cr_reunion: "CR réunion", ticket_push: "Mise à jour Jira" };

export default function History() {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetchHistory().then((d) => setEvents(d.events)).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="banner">Erreur : {err}</div>;
  return (
    <>
      <div className="section-title">Historique</div>
      <p className="hint" style={{ marginTop: -6 }}>Tout ce qui a été produit ou poussé depuis l'application.</p>
      {!events ? (
        <div className="panel empty">Chargement…</div>
      ) : events.length === 0 ? (
        <div className="panel empty">Rien pour l'instant. Génère un CR ou pousse un ticket pour démarrer l'historique.</div>
      ) : (
        <div className="hist">
          {events.map((e) => (
            <div className="hist-row" key={e.id}>
              <span className="when">{frDate(e.at)}</span>
              <span className="type">{LABELS[e.type] || e.type}</span>
              <span style={{ flex: 1 }}>{e.label}{e.meta?.simulated ? " (simulé)" : ""}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
