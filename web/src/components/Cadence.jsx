import React, { useEffect, useState } from "react";
import { fetchCadence } from "../api.js";

const fmt = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);

export default function Cadence({ issues = [], onTicket }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [weeks, setWeeks] = useState(8);

  useEffect(() => {
    let alive = true; setLoading(true); setErr("");
    fetchCadence(weeks)
      .then((r) => { if (alive) setRep(r); })
      .catch((e) => { if (alive) setErr(e.message || "Erreur"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [weeks]);

  const openTicket = (cle) => {
    if (!onTicket || !cle) return;
    const t = issues.find((i) => i.cle === cle);
    if (t) onTicket(t);
  };

  if (loading) return <div className="empty">Calcul du rythme de l'équipe…</div>;
  if (err) return <div className="empty">Cadence indisponible : {err}</div>;
  if (!rep) return null;

  const e = rep.equipe || {};
  const maxW = Math.max(1, ...(rep.hebdo || []).map((h) => h.count));
  const seuil = rep.seuilSouffranceJours;

  return (
    <div className="cad">
      <div className="section-title">Cadence de l'équipe — rythme réel, calculé depuis Jira</div>
      <p className="hint">
        Le débit, les délais et la charge sont déduits des dates Jira (création, résolution).
        Aucune IA ici : ce sont des faits, et ils s'affinent tout seuls à mesure que les données s'accumulent.
      </p>

      <div className="enc-toggle" role="tablist" style={{ marginBottom: 18 }}>
        {[8, 12, 16].map((w) => (
          <button key={w} className={`enc-tg ${weeks === w ? "on" : ""}`} onClick={() => setWeeks(w)}>{w} sem.</button>
        ))}
      </div>

      <div className="cad-kpis">
        <div className="cad-kpi"><div className="cad-n">{fmt(e.resolus30)}</div><div className="cad-l">Résolus (30 j)</div></div>
        <div className="cad-kpi"><div className="cad-n">{fmt(e.debitHebdoMoyen)}</div><div className="cad-l">Débit moyen / semaine</div></div>
        <div className="cad-kpi"><div className="cad-n">{fmt(e.delaiMedianJours, " j")}</div><div className="cad-l">Délai médian de résolution</div></div>
        <div className="cad-kpi"><div className="cad-n">{fmt(e.enCours)}</div><div className="cad-l">Tickets ouverts</div></div>
        <div className={`cad-kpi ${e.enSouffrance ? "cad-alert" : ""}`}><div className="cad-n">{fmt(e.enSouffrance)}</div><div className="cad-l">En souffrance (&gt; {seuil} j)</div></div>
        <div className="cad-kpi"><div className="cad-n">{fmt(e.devsActifs)}</div><div className="cad-l">Développeurs actifs</div></div>
      </div>

      <div className="section-title" style={{ marginTop: 26 }}>Débit hebdomadaire — tickets résolus</div>
      <div className="cad-chart">
        {(rep.hebdo || []).map((h, idx) => (
          <div className="cad-bar-wrap" key={idx} title={`Semaine du ${h.label} : ${h.count} résolu(s)`}>
            <div className="cad-bar-v">{h.count || ""}</div>
            <div className="cad-bar" style={{ height: `${Math.round((h.count / maxW) * 100)}%` }} />
            <div className="cad-bar-x">{h.label}</div>
          </div>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 26 }}>Par développeur</div>
      <p className="hint">Trié par tickets résolus sur 30 jours. Un « plus ancien en cours » au-delà de {seuil} j est signalé — c'est ce qui mérite ton attention.</p>
      <div className="cad-table-wrap">
        <table className="data cad-table">
          <thead>
            <tr>
              <th>Développeur</th>
              <th className="r">Résolus 30 j</th>
              <th className="r">Débit / sem</th>
              <th className="r">Délai médian</th>
              <th className="r">En cours</th>
              <th className="r">Plus ancien en cours</th>
            </tr>
          </thead>
          <tbody>
            {rep.devs.length === 0 && <tr><td colSpan={6} className="cad-muted">Aucune activité sur la période.</td></tr>}
            {rep.devs.map((d) => {
              const traine = d.plusAncienJours > seuil;
              return (
                <tr key={d.nom}>
                  <td><span className="who">{d.nom}</span></td>
                  <td className="r"><b>{d.resolus30}</b></td>
                  <td className="r">{fmt(d.debitHebdo)}</td>
                  <td className="r">{fmt(d.delaiMedianJours, " j")}</td>
                  <td className="r">{d.enCours}</td>
                  <td className="r">
                    {d.plusAncienCle ? (
                      <span className={traine ? "cad-old cad-old-bad" : "cad-old"}>
                        <button className="cad-link" onClick={() => openTicket(d.plusAncienCle)}>{d.plusAncienCle}</button>
                        {" "}· {d.plusAncienJours} j
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="cad-foot">
        Lecture : <b>débit</b> = tickets résolus par semaine · <b>délai médian</b> = temps entre création et résolution (90 j glissants) ·
        <b> en souffrance</b> = ticket ouvert depuis plus de {seuil} j (1,5× le délai médian de l'équipe).
        Attribution sur l'assigné courant.
      </p>
    </div>
  );
}
