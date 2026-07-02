import React, { useMemo, useState } from "react";
import { genWrittenCR } from "../api.js";
import { buildRecapDoc } from "../recapDoc.js";
import DocPreview from "./DocPreview.jsx";

// Statuts à passer en revue le matin : ce qui est en mouvement (En cours + Retour test).
import { ACTIFS as ACTIVE } from "../groups.js";
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

// « depuis X » : temps écoulé dans le statut courant (source : statuscategorychangedate Jira).
function sinceTxt(d) {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (isNaN(days)) return "";
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "1 j";
  if (days < 30) return days + " j";
  const m = Math.floor(days / 30); return m + (m > 1 ? " mois" : " mois");
}

export default function Morning({ issues = [], onTicket, embedded = false }) {
  const [busy, setBusy] = useState("");
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState("");
  const [openD, setOpenD] = useState(null);
  const [eng, setEng] = useState("all"); // périmètre du récap à générer : all | TMA | Projet

  const parDossier = useMemo(() => {
    const m = {};
    issues.filter((i) => ACTIVE.includes(i.categorie)).forEach((i) => {
      (m[i.dossier] ||= []).push(i);
    });
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [issues]);

  const make = async (dossier, kind = "morning") => {
    const key = `${dossier}|${kind}`;
    setBusy(key); setErr("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (kind === "written") {
        const { html } = await genWrittenCR(dossier);
        setDoc({ title: `CR écrit — ${dossier}`, html, filename: `CR_ecrit_${dossier}_${today}.html` });
      } else {
        // Récap = générateur unique, alimenté par computeFacts (mêmes chiffres que le point du soir).
        const scope = dossier === "Tous" ? "Tous" : dossier;
        const { html, filename, title } = buildRecapDoc({ issues, scope, engagement: eng });
        setDoc({ title, html, filename });
      }
    } catch (e) {
      console.error("[Morning]", e && e.message ? e.message : e); setErr(e.message); }
    finally { setBusy(""); }
  };

  const totalActif = parDossier.reduce((s, [, arr]) => s + arr.length, 0);

  return (
    <>
      {!embedded && (
        <>
          <div className="page-hero">
            <span className="page-hero-k">Comptes rendus</span>
            <h2>Récap du jour</h2>
            <p>État des lieux de ce qu'il reste à traiter ({totalActif} ticket{totalActif > 1 ? "s" : ""}).</p>
          </div>
          <p className="hint" style={{ marginTop: -6 }}>
            Ce qui est en mouvement (En cours · Retour test) par client, pour ton récapitulatif de la journée.
          </p>
        </>
      )}
      {err && <div className="banner">Erreur : {err}</div>}
      <div className="row-actions" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="hint" style={{ margin: 0 }}>Périmètre du récap</span>
          <div className="pds-scope" role="group" aria-label="Périmètre du récap à générer">
            {[["all", "TMA + Projet"], ["TMA", "TMA"], ["Projet", "Projet"]].map(([id, label]) => (
              <button key={id} type="button" className={`pds-scope-b ${eng === id ? "on" : ""}`}
                aria-pressed={eng === id} onClick={() => setEng(id)}>{label}</button>
            ))}
          </div>
        </div>
        <button className="btn-solid" onClick={() => make("Tous", "morning")} disabled={busy === "Tous|morning"}>
          {busy === "Tous|morning" ? "Préparation…" : `Préparer le récap (tous les clients)${eng !== "all" ? " · " + eng : ""}`}
        </button>
      </div>

      {parDossier.length === 0 ? (
        <div className="panel empty">Rien d'actif à passer en revue — tout est en recette, en prod ou terminé. 🎉</div>
      ) : (
        <div className="recap-grid">
          {parDossier.map(([dossier, items]) => {
            const count = (c) => items.filter((i) => i.categorie === c).length;
            const open = openD === dossier;
            const nbRetard = items.filter((i) => i.enRetard).length;
            const nbBlocked = items.filter((i) => i.statut === "Bloqué" || i.flagged).length;
            const cls = (nbBlocked > 0 || nbRetard >= 3) ? "red" : (nbRetard > 0 ? "amber" : "green");
            return (
              <div className={`pcard sev-${cls} brief-card`} key={dossier}>
                <div className="pc-head">
                  <div className="pc-title">
                    <span className={`pc-pastille ${cls}`} aria-hidden="true" />
                    <h3>{dossier}</h3>
                  </div>
                  <span className="brief-count">{items.length} actif{items.length > 1 ? "s" : ""}</span>
                </div>
                <div className="stats brief-stats">
                  {count("encours") ? <span className="dot prog">{count("encours")} en cours</span> : null}
                  {count("retourTest") ? <span className="dot todo">{count("retourTest")} retour test</span> : null}
                  {nbRetard ? <span className="dot block">{nbRetard} en retard</span> : null}
                  {nbBlocked ? <span className="dot block">{nbBlocked} bloqué{nbBlocked > 1 ? "s" : ""}</span> : null}
                </div>
                <ul className="brief-list">
                  {(open ? items : items.slice(0, 5)).map((i) => {
                    const blocked = i.statut === "Bloqué" || i.flagged;
                    return (
                      <li key={i.cle}>
                        <button type="button" className="pc-acc-row" onClick={() => onTicket(i)}>
                          <span className="pc-acc-l1">{i.flagged ? <span className="brief-flag">🚩 </span> : null}<b className="pc-acc-key">{i.cle}</b>{i.resume}</span>
                          <span className={`pc-acc-l2 ${blocked ? "blocked" : ""}`}>
                            {i.dev && i.dev !== "Non assigné" ? <>suivi par <b>{i.dev}</b> · </> : null}<b>{etatLabel(i)}</b>{i.statutDepuis ? <span className="brief-since"> · depuis {sinceTxt(i.statutDepuis)}</span> : null}{i.enRetard ? <span className="brief-late"> · en retard ⚠</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {items.length > 5 && (
                  <button type="button" className="brief-more" onClick={() => setOpenD(open ? null : dossier)}>
                    {open ? "▾ réduire" : `▸ voir les ${items.length - 5} autre(s)…`}
                  </button>
                )}
                <div className="mb-actions">
                  <button className="btn-solid gold" onClick={() => make(dossier, "morning")} disabled={busy === `${dossier}|morning`}>
                    {busy === `${dossier}|morning` ? "Préparation…" : "Récap du jour"}
                  </button>
                  <button className="btn-solid" onClick={() => make(dossier, "written")} disabled={busy === `${dossier}|written`}>
                    {busy === `${dossier}|written` ? "Génération…" : "CR écrit"}
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
