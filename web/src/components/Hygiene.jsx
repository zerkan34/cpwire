import React, { useEffect, useMemo, useState } from "react";
import { fetchHygiene } from "../api.js";

function scoreClass(s) { if (s == null) return ""; if (s >= 90) return "sla-ok"; if (s >= 70) return "sla-warn"; return "sla-bad"; }

export default function Hygiene({ issues = [], onTicket }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openCheck, setOpenCheck] = useState(null);
  const [selDossier, setSelDossier] = useState(null);
  const [q, setQ] = useState(""); // recherche propre à la page (clé, résumé, dossier, dev)
  const [fullId, setFullId] = useState(null); // anomalie dont on affiche TOUS les tickets

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
      <div className="page-hero hero-with-search">
        <div className="ph-main">
          <span className="page-hero-k">Qualité</span>
          <h2>Contrôle qualité Jira</h2>
          <p>Ce qui manque ou cloche dans Jira, à corriger à la source. 100 % issu de tes données — rien n'est inventé.</p>
        </div>
        <div className="page-search on-hero">
          <span className="ps-ic">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ticket, un dossier, un développeur…" aria-label="Rechercher dans les anomalies" />
          {q && <button className="ps-x" onClick={() => setQ("")} title="Effacer">×</button>}
        </div>
      </div>


      <table className="cpw-tbl data">
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
          const ql = q.trim().toLowerCase();
          const tks = (selDossier ? c.tickets.filter((t) => t.dossier === selDossier) : c.tickets)
            .filter((t) => !ql || `${t.cle} ${t.resume || ""} ${t.dossier || ""} ${t.who || ""}`.toLowerCase().includes(ql));
          if ((selDossier || ql) && tks.length === 0) return null;
          const isOpen = openCheck === c.id;
          const groups = {};
          tks.forEach((t) => { (groups[t.dossier] ||= []).push(t); });
          const groupNames = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
          return (
            <div className="hyg-check" key={c.id}>
              <div className="hyg-head" onClick={() => setOpenCheck(openCheck === c.id ? null : c.id)} title="Voir les tickets">
                <span className="hyg-count">{tks.length}</span>
                <div className="hyg-head-main">
                  <span className="hyg-label">{c.label}</span>
                  <span className="hyg-hint">{c.hint}</span>
                </div>
                <span className="hyg-toggle">{isOpen ? "▾" : "▸"}</span>
              </div>
              {isOpen && (
                <div className="sla-list">
                  {groupNames.map((dn) => {
                    const full = fullId === c.id;
                    const rows = full ? groups[dn] : groups[dn].slice(0, 8);
                    return (
                      <div key={dn} className="hyg-grp-wrap">
                        <div className="hyg-grp">{dn} <span>({groups[dn].length})</span></div>
                        {rows.map((t) => (
                          <div className="sla-row" key={t.cle + c.id} onClick={() => open(t.cle)} title="Ouvrir le ticket">
                            <span className="k">{t.cle}</span>
                            <span className="sla-resume">{t.resume}</span>
                            {t.extra && <span className="sla-late">{t.extra}</span>}
                            {t.who && <span className="hyg-dev">{t.who}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {tks.length > 8 && fullId !== c.id && (
                    <button className="hyg-more" onClick={(e) => { e.stopPropagation(); setFullId(c.id); }}>Afficher les {tks.length} tickets</button>
                  )}
                  {fullId === c.id && tks.length > 8 && (
                    <button className="hyg-more" onClick={(e) => { e.stopPropagation(); setFullId(null); }}>Réduire</button>
                  )}
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
