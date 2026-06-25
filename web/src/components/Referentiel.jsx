import React, { useEffect, useMemo, useState } from "react";
import { fetchReferentiel, fetchReferentielClients } from "../api.js";
import CopilotDot from "./CopilotDot.jsx";
import { RefState } from "./RefState.jsx";

// Catégorie Jira → [libellé, classe de pastille]. Aligné sur server/config.js.
const CAT = {
  afaire: ["À faire", "todo"],
  encours: ["En cours", "prog"],
  retourTest: ["Retour test", "block"],
  retourProd: ["Retour prod", "block"],
  recetteArmonie: ["Recette Armonie", "rec"],
  recetteClient: ["Recette client", "rec"],
  attenteClient: ["Attente client", "todo"],
  miseEnProd: ["Mise en prod", "done"],
  termine: ["Terminé", "done"],
  annule: ["Annulé", "todo"],
};
function Pill({ cat }) {
  const c = CAT[cat];
  if (!c) return <span className="pill todo">non lié</span>;
  return <span className={`pill ${c[1]}`}>{c[0]}</span>;
}

// Pipeline bout-en-bout : réécriture → recette Armonie → recette client → MEP.
const STAGES = [
  { key: "afaire", label: "À faire", cls: "st-afaire", cats: ["afaire"] },
  { key: "encours", label: "En cours", cls: "st-encours", cats: ["encours"] },
  { key: "retour", label: "Retour test", cls: "st-retour", cats: ["retourTest", "retourProd"] },
  { key: "recArm", label: "Recette Armonie", cls: "st-recarm", cats: ["recetteArmonie"] },
  { key: "recCli", label: "Recette client", cls: "st-reccli", cats: ["recetteClient", "attenteClient"] },
  { key: "mep", label: "MEP / terminé", cls: "st-mep", cats: ["miseEnProd", "termine"] },
];
const STAGE_OF = {};
STAGES.forEach((s) => s.cats.forEach((c) => { STAGE_OF[c] = s.key; }));

function pipelineOf(programmes) {
  const counts = { noncouvert: 0 };
  STAGES.forEach((s) => { counts[s.key] = 0; });
  const blocants = [], noncouverts = [];
  programmes.forEach((p) => {
    if (!p.lie) { counts.noncouvert++; noncouverts.push(p.nom); return; }
    const k = STAGE_OF[p.etat] || "encours";
    counts[k]++;
    if (k === "retour") blocants.push(p.nom);
  });
  return { counts, blocants, noncouverts, total: programmes.length };
}

function Pipeline({ programmes }) {
  const { counts, blocants, noncouverts, total } = pipelineOf(programmes);
  if (!total) return null;
  const segs = [
    { key: "noncouvert", label: "Non couvert", cls: "st-noncouvert", n: counts.noncouvert },
    ...STAGES.map((s) => ({ key: s.key, label: s.label, cls: s.cls, n: counts[s.key] })),
  ].filter((s) => s.n > 0);
  return (
    <div className="ref-pipe">
      <div className="ref-pipe-bar" title="Avancement des programmes par étape de recette">
        {segs.map((s) => <span key={s.key} className={`rp-seg ${s.cls}`} style={{ flexGrow: s.n }} title={`${s.label} : ${s.n}`} />)}
      </div>
      <div className="ref-pipe-legend">
        {segs.map((s) => <span key={s.key} className="rp-leg"><i className={`rp-dot ${s.cls}`} />{s.label} <b>{s.n}</b></span>)}
      </div>
      {(blocants.length || noncouverts.length) ? (
        <div className="ref-bloc">
          ⚠ <b>Ce qui bloque&nbsp;:</b>
          {blocants.length ? <> {blocants.length} en retour ({blocants.slice(0, 6).join(", ")}{blocants.length > 6 ? "…" : ""})</> : null}
          {blocants.length && noncouverts.length ? " · " : null}
          {noncouverts.length ? <> {noncouverts.length} non couvert{noncouverts.length > 1 ? "s" : ""} (sans ticket Jira)</> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Referentiel({ issues = [], onTicket }) {
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState({}); // code option → déplié ?
  const retry = () => { setErr(""); setData(null); setLoading(true); setNonce((n) => n + 1); };

  // Pour ouvrir la fiche ticket complète au clic, on retrouve l'issue par sa clé.
  const byCle = useMemo(() => {
    const m = {};
    issues.forEach((i) => { m[i.cle] = i; });
    return m;
  }, [issues]);

  useEffect(() => {
    fetchReferentielClients()
      .then((r) => {
        const cs = r.clients || [];
        setClients(cs);
        if (cs.length) setClient(cs[0]); else setLoading(false);
      })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [nonce]);

  useEffect(() => {
    if (!client) return;
    setLoading(true); setErr("");
    fetchReferentiel(client)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setErr(e.message); setLoading(false); });
  }, [client, nonce]);

  const openTicket = (cle) => { const full = byCle[cle]; if (full && onTicket) onTicket(full); };

  if (loading) return <RefState kind="load" title="Chargement de l'annuaire…" message="Rapprochement des programmes et de leurs tickets Jira." />;
  if (err) return <RefState kind="err" title="L'annuaire n'a pas pu se charger" message="La récupération du référentiel a échoué. Vérifiez la connexion à Jira, puis réessayez." detail={err} onRetry={retry} />;
  if (!clients.length || !data) return <RefState kind="empty" title="Aucun référentiel pour l'instant" message="Aucune option ni programme n'est encore rattaché. L'annuaire se remplira dès que des programmes seront renseignés et liés à des tickets." />;

  return (
    <>
      <p className="hint" style={{ marginTop: -2 }}>
        <b>Référentiel recette</b> — {data.nbOptions} option{data.nbOptions > 1 ? "s" : ""} · {data.nbProgrammes} programme{data.nbProgrammes > 1 ? "s" : ""} · chaque programme est rapproché de son ticket Jira (« non lié » sinon).{data.majSource ? <> <i>{data.majSource}.</i></> : null}
      </p>

      {clients.length > 1 && (
        <div className="filters" style={{ marginBottom: 12 }}>
          {clients.map((c) => (
            <button key={c} className={`btn-line sm ${c === client ? "on" : ""}`} onClick={() => setClient(c)}>{c}</button>
          ))}
        </div>
      )}

      {data.domaines.map((dom) => (
        <div key={dom.domaine} style={{ marginBottom: 18 }}>
          <div className="ref-dom">{dom.domaine.replace(/_/g, " ")}</div>
          <div className="recap-grid">
            {dom.options.map((o) => {
              const isOpen = !!open[o.code];
              const shown = isOpen ? o.programmes : o.programmes.slice(0, 6);
              return (
                <div className="recap-card" key={o.code}>
                  <div className="recap-hd">
                    <span className="recap-hd-name">{o.code}</span>
                    <div className="recap-hd-r">
                      <span className="recap-hd-meta">{o.statutRecette === "Armonie" ? "Recette Armonie" : "Recette client"}</span>
                      <CopilotDot prompt={`Analyse l'option ${o.code} « ${o.libelle} » du client ${client} (domaine « ${dom.domaine.replace(/_/g, " ")} »). Explique à quoi elle sert, les programmes qu'elle regroupe, ce qui bloque et où en est la recette. Appuie-toi uniquement sur les tickets Jira réels.`} />
                    </div>
                  </div>
                  <div className="recap-bd">
                    <div className="ref-card-ctx"><b>{client}</b> · {dom.domaine.replace(/_/g, " ")}</div>
                    <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600, marginBottom: 6 }}>{o.libelle}</div>
                    <div className="ref-meta">
                      {o.livraison ? <span>Livraison {o.livraison}</span> : null}
                      <span>{o.lies}/{o.total} programme{o.total > 1 ? "s" : ""} lié{o.lies > 1 ? "s" : ""}</span>
                      {o.retours ? <span className="late">{o.retours} en retour</span> : null}
                    </div>
                    {o.total > 0 && <Pipeline programmes={o.programmes} />}
                    {o.noteChaine ? <p className="hint" style={{ margin: "6px 0 0" }}>{o.noteChaine}</p> : null}

                    {o.total === 0 ? (
                      <p className="hint" style={{ margin: "8px 0 0" }}>Programmes à renseigner par le dev.</p>
                    ) : (
                      <ul className="mb-list" style={{ marginTop: 8 }}>
                        {shown.map((p) => (
                          <li key={p.nom} className="ref-prog">
                            <span className="ref-prog-nom">{p.nom}</span>
                            {p.lie ? (
                              <span className="ref-prog-tk">
                                <Pill cat={p.etat} />
                                {p.tickets.map((t) => (
                                  <button key={t.cle} className="ref-tk-link" onClick={() => openTicket(t.cle)} title={t.resume}>{t.cle}</button>
                                ))}
                              </span>
                            ) : (
                              <span className="ref-prog-none">non lié à un ticket</span>
                            )}
                          </li>
                        ))}
                        {o.programmes.length > 6 && (
                          <li className="mb-more" onClick={() => setOpen((s) => ({ ...s, [o.code]: !isOpen }))}>
                            {isOpen ? "▾ réduire" : `▸ voir les ${o.programmes.length - 6} autre(s)…`}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
