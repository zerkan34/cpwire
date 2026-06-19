import React, { useEffect, useMemo, useState } from "react";
import { fetchHygiene } from "../api.js";

function scoreClass(s) { if (s == null) return ""; if (s >= 90) return "sla-ok"; if (s >= 70) return "sla-warn"; return "sla-bad"; }

export default function Hygiene({ issues = [], onTicket }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openCheck, setOpenCheck] = useState(null);
  const [selDossier, setSelDossier] = useState(null);

  useEffect(() => {
    let alive = true; setLoading(true); setErr("");
    fetchHygiene()
      .then((r) => { if (alive) setRep(r); })
      .catch((e) => { if (alive) setErr(e.message || "Erreur"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const byKey = useMemo(() => { const m = {}; issues.forEach((i) => { m[i.cle] = i; }); return m; }, [issues]);
  const open = (cle) => { if (onTicket && byKey[cle]) onTicket(byKey[cle]); };

  if (loading) return <div className="empty">Analyse de la qualité des données…</div>;
  if (err) return <div className="empty">Contrôle qualité indisponible : {err}</div>;
  if (!rep) return null;

  const g = rep.global || {};
  return (
    <div className="sla-wrap">
      <h2 className="section-title">Contrôle qualité Jira</h2>
      <p className="sla-note" style={{ marginTop: 0 }}>
        Ce qui manque ou cloche dans Jira, à corriger à la source. 100 % issu de tes données — rien n'est inventé.
      </p>

      <div className="sla-kpis">
        <div className="sla-kpi"><div className={`v ${scoreClass(g.score)}`}>{g.score == null ? "—" : `${g.score}%`}</div><div className="l">Ouverts « propres »</div></div>
        <div className="sla-kpi"><div className={`v ${g.aCorriger ? "sla-bad" : "sla-ok"}`}>{g.aCorriger}</div><div className="l">Ouverts à corriger</div></div>
        <div className="sla-kpi"><div className={`v ${g.incoherences ? "sla-warn" : ""}`}>{g.incoherences}</div><div className="l">Incohérences</div></div>
        <div className="sla-kpi"><div className="v">{g.ouverts}</div><div className="l">Tickets ouverts</div></div>
      </div>

      <table className="data">
        <thead><tr><th>Client / dossier</th><th>Ouverts</th><th>À corriger</th><th>Incohér.</th><th>Qualité</th></tr></thead>
        <tbody>
          {rep.byDossier.map((d) => (
            <tr key={d.dossier} className={`hyg-drow ${selDossier === d.dossier ? "on" : ""}`} onClick={() => setSelDossier(selDossier === d.dossier ? null : d.dossier)} title="Voir les anomalies de ce client">
              <td><span className="tag">{d.dossier}</span></td>
              <td>{d.ouverts}</td>
              <td className={d.aCorriger ? "sla-bad" : ""}><b>{d.aCorriger || "—"}</b></td>
              <td className={d.incoherences ? "sla-warn" : ""}>{d.incoherences || "—"}</td>
              <td className={scoreClass(d.score)}><b>{d.score == null ? "—" : `${d.score}%`}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="sla-h">Anomalies à corriger {selDossier && <span className="hyg-filter">{selDossier} <button onClick={() => setSelDossier(null)} title="Tout afficher">✕</button></span>}</h3>
      {rep.checks.length === 0 && <p className="sla-note">Aucune anomalie détectée 🎉</p>}
      <div className="hyg-checks">
        {rep.checks.map((c) => {
          const tks = selDossier ? c.tickets.filter((t) => t.dossier === selDossier) : c.tickets;
          if (selDossier && tks.length === 0) return null;
          const isOpen = selDossier ? true : openCheck === c.id;
          const groups = {};
          tks.forEach((t) => { (groups[t.dossier] ||= []).push(t); });
          const groupNames = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
          return (
            <div className="hyg-check" key={c.id}>
              <div className="hyg-head" onClick={() => { if (!selDossier) setOpenCheck(openCheck === c.id ? null : c.id); }} title="Voir les tickets">
                <span className="hyg-count">{tks.length}</span>
                <span className="hyg-label">{c.label}</span>
                {!selDossier && <span className="hyg-toggle">{isOpen ? "▾" : "▸"}</span>}
              </div>
              <div className="hyg-hint">{c.hint}</div>
              {isOpen && (
                <div className="sla-list">
                  {groupNames.map((dn) => (
                    <div key={dn} className="hyg-grp-wrap">
                      <div className="hyg-grp">{dn} <span>({groups[dn].length})</span></div>
                      {groups[dn].map((t) => (
                        <div className="sla-row" key={t.cle + c.id} onClick={() => open(t.cle)} title="Ouvrir le ticket">
                          <span className="k">{t.cle}</span>
                          <span className="sla-resume">{t.resume}</span>
                          {t.who && <span className="sla-prio">{t.who}</span>}
                          {t.extra && <span className="sla-late">{t.extra}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="sla-note">
        Anomalies calculées sur le snapshot Jira courant ({rep.staleDays} j = seuil de « sans mouvement »).
        « Sans description » et « sans estimation » pourront s'ajouter en v2 (champs non chargés en masse aujourd'hui, pour préserver la vitesse d'import).
      </p>
    </div>
  );
}
