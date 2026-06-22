import React, { useEffect, useMemo, useState } from "react";
import { fetchSla } from "../api.js";

// Humanise une durée en heures : "6 h", "3 j", "2 sem".
function dur(h) {
  if (h == null) return "—";
  if (h < 24) return `${Math.round(h)} h`;
  const j = h / 24;
  if (j < 14) return `${Math.round(j)} j`;
  return `${Math.round(j / 7)} sem`;
}
function tauxClass(t) {
  if (t == null) return "";
  if (t >= 95) return "sla-ok";
  if (t >= 85) return "sla-warn";
  return "sla-bad";
}

export default function SLA({ issues = [], onTicket }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr("");
    fetchSla()
      .then((r) => { if (alive) setRep(r); })
      .catch((e) => { if (alive) setErr(e.message || "Erreur"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const byKey = useMemo(() => { const m = {}; issues.forEach((i) => { m[i.cle] = i; }); return m; }, [issues]);
  const open = (cle) => { if (onTicket && byKey[cle]) onTicket(byKey[cle]); };

  if (loading) return <div className="empty">Calcul des SLA…</div>;
  if (err) return <div className="empty">SLA indisponible : {err}</div>;
  if (!rep || !rep.configured) {
    return (
      <div className="sla-intro">
        <h2 className="section-title">Pilotage SLA</h2>
        <p>Aucune cible définie. Renseigne les engagements (GTI/GTR) par client dans <code>server/sla.json</code>, puis redéploie.</p>
      </div>
    );
  }

  const g = rep.global || {};
  return (
    <div className="sla-wrap">
      <h2 className="section-title">Pilotage des engagements (SLA)</h2>

      <div className="sla-kpis">
        <div className="sla-kpi"><div className={`v ${tauxClass(g.tauxGtr)}`}>{g.tauxGtr == null ? "—" : `${g.tauxGtr}%`}</div><div className="l">Respect GTR (résolus)</div></div>
        <div className="sla-kpi"><div className={`v ${g.ouvDepasse ? "sla-bad" : "sla-ok"}`}>{g.ouvDepasse}</div><div className="l">Ouverts en dépassement</div></div>
        <div className="sla-kpi"><div className={`v ${g.ouvRisque ? "sla-warn" : ""}`}>{g.ouvRisque}</div><div className="l">Ouverts à risque</div></div>
        <div className="sla-kpi"><div className="v">{g.resolus}</div><div className="l">Résolus analysés</div></div>
      </div>

      <table className="data">
        <thead><tr><th>Client / dossier</th><th>Résolus</th><th>Respect GTR</th><th>Dépass.</th><th>Ouverts en dépass.</th><th>À risque</th><th>Sans cible</th></tr></thead>
        <tbody>
          {rep.byDossier.map((d) => (
            <tr key={d.dossier}>
              <td><span className="tag">{d.dossier}</span></td>
              <td>{d.resolus}</td>
              <td className={tauxClass(d.tauxGtr)}><b>{d.tauxGtr == null ? "—" : `${d.tauxGtr}%`}</b></td>
              <td>{d.gtrKo || "—"}</td>
              <td className={d.ouvDepasse ? "sla-bad" : ""}><b>{d.ouvDepasse || "—"}</b></td>
              <td className={d.ouvRisque ? "sla-warn" : ""}>{d.ouvRisque || "—"}</td>
              <td className="muted-cell">{d.sansCible || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rep.depassements.length > 0 && (
        <>
          <h3 className="sla-h">Tickets ouverts en dépassement de GTR</h3>
          <div className="sla-list">
            {rep.depassements.map((t) => (
              <div className="sla-row sla-bad-row" key={t.cle} onClick={() => open(t.cle)} title="Ouvrir le ticket">
                <span className="k">{t.cle}</span>
                <span className="tag">{t.dossier}</span>
                <span className="sla-prio">{t.bucket}</span>
                <span className="sla-resume">{t.resume}</span>
                <span className="sla-late">ouvert depuis {dur(t.ageH)} · cible {dur(t.gtrH)} · <b>+{dur(t.depassementH)}</b></span>
              </div>
            ))}
          </div>
        </>
      )}

      {rep.aRisque.length > 0 && (
        <>
          <h3 className="sla-h">Tickets à risque (proches de la cible)</h3>
          <div className="sla-list">
            {rep.aRisque.map((t) => (
              <div className="sla-row sla-warn-row" key={t.cle} onClick={() => open(t.cle)} title="Ouvrir le ticket">
                <span className="k">{t.cle}</span>
                <span className="tag">{t.dossier}</span>
                <span className="sla-prio">{t.bucket}</span>
                <span className="sla-resume">{t.resume}</span>
                <span className="sla-late">ouvert depuis {dur(t.ageH)} · cible {dur(t.gtrH)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="sla-note">
        GTR = délai de résolution (créé → résolu), comparé à la cible contractuelle par client et priorité.
        Délais <b>calendaires</b> pour l'instant (pas encore en heures ouvrées). La <b>prise en charge (GTI)</b> arrive en phase 2
        (elle nécessite l'historique ticket par ticket). Cibles éditables dans <code>server/sla.json</code>.
      </p>
    </div>
  );
}
