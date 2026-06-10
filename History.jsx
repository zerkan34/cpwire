import React, { useEffect, useState } from "react";
import { fetchRecap, genDailyCR, genGlobalCR } from "../api.js";
import DocPreview from "./DocPreview.jsx";

const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

export default function DailyRecap({ onTicket }) {
  const [recap, setRecap] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    fetchRecap().then(setRecap).catch((e) => setErr(e.message));
  }, []);

  const makeCR = async (dossier) => {
    setBusy(dossier); setErr("");
    try {
      const { html } = await genDailyCR(dossier);
      setDoc({ title: `CR journalier — ${dossier}`, html, dossier, filename: `CR_journalier_${dossier}_${new Date().toISOString().slice(0, 10)}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };

  const makeGlobal = async () => {
    setBusy("__global__"); setErr("");
    try {
      const { html } = await genGlobalCR();
      setDoc({ title: "Rapport journalier global", html, filename: `CR_global_${new Date().toISOString().slice(0, 10)}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };

  if (err) return <div className="banner">Erreur : {err}</div>;
  if (!recap) return <div className="panel empty">Chargement du récap…</div>;

  const entries = Object.entries(recap.byDossier).sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <div className="section-title">Récap de la journée</div>
      <p className="hint" style={{ marginTop: -6 }}>
        Base : {recap.basis}. Clique sur un ticket pour le détailler, ou génère le compte rendu journalier d'un client.
      </p>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button className="btn-solid" onClick={makeGlobal} disabled={busy === "__global__"}>
          {busy === "__global__" ? "Génération…" : "Rapport global (tous les clients)"}
        </button>
      </div>
      <div className="recap-grid">
        {entries.map(([dossier, items]) => {
          const done = items.filter((i) => i.statut === "Terminé").length;
          const blocked = items.filter((i) => i.statut === "Bloqué").length;
          return (
            <div className="recap-card" key={dossier}>
              <h3>
                {dossier}
                <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                  {done} fait{done > 1 ? "s" : ""}{blocked ? ` · ${blocked} bloqué${blocked > 1 ? "s" : ""}` : ""}
                </span>
              </h3>
              <ul>
                {items.slice(0, 6).map((i) => (
                  <li key={i.cle} onClick={() => onTicket(i)} style={{ cursor: "pointer" }}>
                    <span className="k">{i.cle}</span>
                    <span style={{ flex: 1 }}>{i.resume}</span>
                    <span className={`pill ${PILL[i.statut]}`}>{i.statut}</span>
                  </li>
                ))}
                {items.length > 6 && <li style={{ color: "var(--muted)" }}>+ {items.length - 6} autre(s)…</li>}
              </ul>
              <button className="btn-solid gold" style={{ width: "100%" }} onClick={() => makeCR(dossier)} disabled={busy === dossier}>
                {busy === dossier ? "Rédaction du CR…" : `Formuler le CR journalier de ${dossier}`}
              </button>
            </div>
          );
        })}
      </div>
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </>
  );
}
