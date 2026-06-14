import React, { useMemo, useState } from "react";
import { genMorningCR } from "../api.js";
import DocPreview from "./DocPreview.jsx";

// Statuts à passer en revue le matin : ce qui est en mouvement (En cours + Retour test).
const ACTIVE = ["encours", "retourTest"];
const ORDER = [
  ["encours", "En cours", "prog"],
  ["retourTest", "Retour test", "todo"],
];

// Phrase d'état claire (langage courant) pour chaque ticket du brief.
function etatLabel(i) {
  if (i.statut === "Bloqué" || i.flagged) return "bloqué";
  if (i.categorie === "encours") return "en cours de réalisation";
  if (i.categorie === "retourTest") return "renvoyé en test";
  return (i.statut || "en cours").toLowerCase();
}

export default function Morning({ issues = [], onTicket }) {
  const [busy, setBusy] = useState("");
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState("");
  const [openD, setOpenD] = useState(null);

  const parDossier = useMemo(() => {
    const m = {};
    issues.filter((i) => ACTIVE.includes(i.categorie)).forEach((i) => {
      (m[i.dossier] ||= []).push(i);
    });
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [issues]);

  const make = async (dossier) => {
    setBusy(dossier); setErr("");
    try {
      const { html } = await genMorningCR(dossier);
      setDoc({ title: `Brief matin — ${dossier}`, html, filename: `Brief_matin_${dossier}_${new Date().toISOString().slice(0, 10)}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };

  const totalActif = parDossier.reduce((s, [, arr]) => s + arr.length, 0);

  return (
    <>
      <div className="section-title">Brief du matin
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— état des lieux de ce qu'il reste à traiter ({totalActif} ticket{totalActif > 1 ? "s" : ""})
        </span>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Ce qui est en mouvement (En cours · Retour test) par client, pour ta réunion matinale.
      </p>
      {err && <div className="banner">Erreur : {err}</div>}
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button className="btn-solid" onClick={() => make("Tous")} disabled={busy === "Tous"}>
          {busy === "Tous" ? "Préparation…" : "Préparer le brief (tous les clients)"}
        </button>
      </div>

      {parDossier.length === 0 ? (
        <div className="panel empty">Rien d'actif à passer en revue — tout est en recette, en prod ou terminé. 🎉</div>
      ) : (
        <div className="recap-grid">
          {parDossier.map(([dossier, items]) => {
            const count = (c) => items.filter((i) => i.categorie === c).length;
            const open = openD === dossier;
            return (
              <div className="recap-card" key={dossier}>
                <div className="recap-hd">
                  <span className="recap-hd-name">{dossier}</span>
                  <span className="recap-hd-meta">{items.length} actif{items.length > 1 ? "s" : ""}</span>
                </div>
                <div className="recap-bd">
                <div className="filters" style={{ marginBottom: 8 }}>
                  {ORDER.map(([c, label, pill]) => count(c) ? (
                    <span key={c} className={`pill ${pill}`}>{count(c)} {label.toLowerCase()}</span>
                  ) : null)}
                </div>
                <ul>
                  {(open ? items : items.slice(0, 5)).map((i) => (
                    <li key={i.cle} onClick={() => onTicket(i)} style={{ cursor: "pointer", display: "block" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span className="k">{i.cle}</span>
                        <span style={{ flex: 1 }}>{i.resume}</span>
                      </div>
                      <div className="mb-state">
                        {i.dev && i.dev !== "Non assigné" ? <>suivi par <b>{i.dev}</b> · </> : null}
                        <b>{etatLabel(i)}</b>{i.enRetard ? <span className="late"> · en retard ⚠</span> : null}
                      </div>
                    </li>
                  ))}
                  {items.length > 5 && (
                    <li style={{ color: "var(--purple-strong)", cursor: "pointer", fontWeight: 600 }} onClick={() => setOpenD(open ? null : dossier)}>
                      {open ? "▾ réduire" : `▸ voir les ${items.length - 5} autre(s)…`}
                    </li>
                  )}
                </ul>
                <button className="btn-solid gold" style={{ width: "100%" }} onClick={() => make(dossier)} disabled={busy === dossier}>
                  {busy === dossier ? "Préparation…" : `Préparer le brief de ${dossier}`}
                </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </>
  );
}
