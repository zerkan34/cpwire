import React, { useEffect, useState } from "react";
import { fetchRecap, genDailyCR, genWrittenCR, genGlobalCR } from "../api.js";
import DocPreview from "./DocPreview.jsx";

const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

function shorten(s, n = 72) {
  s = (s || "").trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// Produit un paragraphe explicatif, factuel et structuré, de ce qui a avancé pour un client.
function describeDossier(items) {
  const n = items.length;
  if (!n) return "Aucune activité enregistrée aujourd'hui.";
  const by = (st) => items.filter((i) => i.statut === st);
  const done = by("Terminé"), prog = by("En cours"), todo = by("À faire"), blocked = by("Bloqué");

  const bits = [];
  if (done.length) bits.push(`${done.length} terminé${done.length > 1 ? "s" : ""}`);
  if (prog.length) bits.push(`${prog.length} en cours`);
  if (todo.length) bits.push(`${todo.length} à faire`);
  if (blocked.length) bits.push(`${blocked.length} bloqué${blocked.length > 1 ? "s" : ""}`);

  let p = `${n} sujet${n > 1 ? "s ont" : " a"} avancé aujourd'hui`;
  p += bits.length ? ` — ${bits.join(", ")}.` : ".";

  if (done.length) {
    const t = done.slice(0, 2).map((i) => `« ${shorten(i.resume)} »`).join(", ");
    const reste = done.length - 2;
    p += ` Livré : ${t}${reste > 0 ? `, plus ${reste} autre${reste > 1 ? "s" : ""}` : ""}.`;
  }
  if (blocked.length) {
    const reste = blocked.length - 1;
    p += ` À débloquer en priorité : « ${shorten(blocked[0].resume)} »${reste > 0 ? ` (et ${reste} autre${reste > 1 ? "s" : ""})` : ""}.`;
  } else if (prog.length && !done.length) {
    p += ` Travaux en cours, rien de bloquant à ce stade.`;
  }
  return p;
}

export default function DailyRecap({ onTicket, onDev, deletedDevs = [] }) {
  const [recap, setRecap] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [doc, setDoc] = useState(null);
  const delSet = new Set(deletedDevs);

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

  const makeWritten = async (dossier) => {
    setBusy(dossier + "::w"); setErr("");
    try {
      const { html } = await genWrittenCR(dossier);
      setDoc({ title: `Compte rendu écrit — ${dossier}`, html, dossier, filename: `CR_ecrit_${dossier}_${new Date().toISOString().slice(0, 10)}.html` });
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
              <div className="recap-hd">
                <span className="recap-hd-name">{dossier}</span>
                <span className="recap-hd-meta">
                  {done} fait{done > 1 ? "s" : ""}{blocked ? ` · ${blocked} bloqué${blocked > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              <div className="recap-bd">
              <p className="recap-desc">
                <span className="rd-label">Ce qui a avancé</span>
                {describeDossier(items)}
              </p>
              <ul>
                {items.slice(0, 6).map((i) => {
                  const dev = i.dev || i.assigne || "";
                  const showDev = dev && dev !== "Non assigné";
                  const isDel = delSet.has(dev);
                  return (
                    <li key={i.cle} className="ri" onClick={() => onTicket(i)}>
                      <div className="ri-top">
                        <span className="k">{i.cle}</span>
                        <span className={`pill ${PILL[i.statut]}`}>{i.statut}</span>
                      </div>
                      <div className="ri-res">{i.resume}{i.flagged ? <span className="flag" title="Flaggé"> 🚩</span> : null}</div>
                      {showDev && (
                        <div className="ri-dev">
                          <span className={`dev-chip ${isDel ? "del" : ""}`} title="Voir la fiche du développeur"
                            onClick={(e) => { e.stopPropagation(); onDev && onDev(dev); }}>
                            {dev}{isDel ? <span className="dev-del-tag">supprimé</span> : null}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
                {items.length > 6 && <li className="ri-more" style={{ color: "var(--muted)" }}>+ {items.length - 6} autre(s)…</li>}
              </ul>
              <div className="cr-btns">
                <button className="btn-solid gold" onClick={() => makeCR(dossier)} disabled={busy === dossier}>
                  {busy === dossier ? "Rédaction…" : "CR journalier détaillé"}
                </button>
                <button className="btn-solid" onClick={() => makeWritten(dossier)} disabled={busy === dossier + "::w"}>
                  {busy === dossier + "::w" ? "Rédaction…" : "Compte rendu écrit"}
                </button>
              </div>
              </div>
            </div>
          );
        })}
      </div>
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </>
  );
}
