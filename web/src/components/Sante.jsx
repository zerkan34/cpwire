import { useEffect, useState } from "react";
import { fetchCoherence, fetchProjections, fetchSignals } from "../api.js";

// Vue « Santé & signaux » de la Tour de contrôle. Trois briques, toutes ancrées
// sur des données réelles : audit de cohérence (contradictions), projections
// (rythme/tendance/ETA depuis l'historique), et journal des signaux (tendances).
// Zéro invention : « — » quand la donnée manque.

const norm = (s) => String(s || "").trim();
const SIG_LBL = { regression: "Régression", sla: "SLA dépassé", stagnation: "Ticket figé", divergence: "Divergence de date" };
const TREND = { "accélère": { t: "Accélère", c: "up" }, "stable": { t: "Stable", c: "" }, "décroche": { t: "Décroche", c: "down" }, "insuffisant": { t: "Historique insuffisant", c: "muted" } };

export default function Sante({ onTicket, onClient }) {
  const [coh, setCoh] = useState(null);
  const [proj, setProj] = useState(null);
  const [sig, setSig] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    fetchCoherence().then((r) => on && setCoh(r)).catch((e) => on && setErr(e && e.message ? e.message : String(e)));
    fetchProjections().then((r) => on && setProj(r)).catch(() => { if (on) setProj({ dossiers: [] }); });
    fetchSignals(30).then((r) => on && setSig(r)).catch(() => { if (on) setSig({ rows: [], stats: { total: 0, byType: {}, recurrences: [] } }); });
    return () => { on = false; };
  }, []);

  const Cli = (d) => (onClient
    ? <button type="button" className="af-cli af-cli-btn" onClick={() => onClient(d)} title="Ouvrir la fiche client">{norm(d) || "—"}</button>
    : <span className="af-cli">{norm(d) || "—"}</span>);
  const Cle = (cle) => (cle ? <button type="button" className="af-cle" onClick={() => onTicket && onTicket({ cle })} title="Ouvrir le ticket">{cle}</button> : null);

  return (
    <div className="af sante">
      {/* ---- 1. Cohérence ---- */}
      <div className="af-intro"><b>Audit de cohérence.</b> Croisements qui repèrent les contradictions avant qu'elles ne surprennent — calculés à partir des tickets Jira réels.</div>
      <p className="af-do">→ <b>Quoi en faire :</b> les <b>alertes</b> (rouge) d'abord — échéance dépassée non clôturée, ticket actif sans personne. Les <b>attentions</b> sont surtout de l'hygiène de donnée (fiabilité des chiffres).</p>
      {err ? <p className="af-empty af-err">Audit indisponible : {err}</p> : coh === null ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : (
        <div className="panel sante-panel">
          {coh.total === 0 ? <p className="af-empty" style={{ margin: 0 }}>Aucune incohérence interne détectée. 👍</p> : coh.checks.map((c) => (
            <div className="sante-check" key={c.id}>
              <div className="sante-check-hd">
                <span className={`sante-sev sante-sev-${c.severity}`}>{c.severity === "alerte" ? "Alerte" : "Attention"}</span>
                <span className="sante-check-lbl">{c.label}</span>
                <b className="sante-check-n">{c.items.length}</b>
              </div>
              <ul className="sante-items">
                {c.items.slice(0, 12).map((it, i) => (
                  <li key={i} className="sante-item">
                    {Cli(it.dossier)}{Cle(it.cle)}
                    <span className="sante-item-d">{it.detail}</span>
                  </li>
                ))}
                {c.items.length > 12 ? <li className="sante-more">+ {c.items.length - 12} autre(s)…</li> : null}
              </ul>
            </div>
          ))}
          <div className="sante-ext">
            {coh.externes && coh.externes.map((e) => (
              <span key={e.source} className="sante-ext-chip" title={e.hint}>{e.source} : <b>non connecté</b> — {e.verifie}</span>
            ))}
          </div>
        </div>
      )}

      {/* ---- 2. Projections ---- */}
      <div className="section-title" style={{ marginTop: 18 }}><span>Projections</span></div>
      <div className="af-intro"><b>Extrapolations, pas des faits.</b> Rythme de résorption et délai estimé, calculés sur les instantanés quotidiens réels. Étiquetés avec le recul disponible ; « — » si moins de 2 jours d'historique.</div>
      {proj === null ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : !proj.dossiers || !proj.dossiers.length ? (
        <p className="af-empty">Pas encore d'historique. Les projections apparaîtront après quelques jours d'utilisation (au moins 2 relevés).</p>
      ) : (
        <div className="panel sante-panel">
          <ul className="proj-list">
            {proj.dossiers.map((d) => (
              <li className="proj-row" key={d.dossier}>
                {Cli(d.dossier)}
                {d.insuffisant ? (
                  <span className="proj-muted">historique insuffisant ({d.jours} j)</span>
                ) : (
                  <>
                    <span className={`proj-trend proj-${(TREND[d.tendance] || {}).c || ""}`}>{(TREND[d.tendance] || {}).t || d.tendance}</span>
                    <span className="proj-metric">{d.rythme != null ? `${d.rythme}/j` : "—"} <small>résorption</small></span>
                    <span className="proj-metric">{d.reste} <small>reste suivi</small></span>
                    <span className="proj-metric">{d.etaJours != null ? `≈ ${d.etaJours} j (${d.etaDate})` : "—"} <small>projection</small></span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="proj-note">Projection = reste ÷ rythme observé. Une extrapolation d'aide à la décision, jamais un engagement.</p>
        </div>
      )}

      {/* ---- 3. Signaux (historique) ---- */}
      <div className="section-title" style={{ marginTop: 18 }}><span>Signaux — 30 derniers jours</span></div>
      <div className="af-intro"><b>La mémoire des faits.</b> Chaque régression, dépassement SLA, ticket figé ou divergence de date est archivé jour après jour. Le copilote s'appuie dessus pour raisonner sur les <b>tendances</b>, pas seulement la photo du jour.</div>
      {sig === null ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : !sig.stats || !sig.stats.total ? (
        <p className="af-empty">Aucun signal archivé sur la période.</p>
      ) : (
        <div className="panel sante-panel">
          <div className="af-kpis">
            {Object.entries(sig.stats.byType).map(([t, n]) => (
              <div className="af-kpi" key={t}><b>{n}</b><span>{SIG_LBL[t] || t}</span></div>
            ))}
          </div>
          {sig.stats.recurrences && sig.stats.recurrences.length ? (
            <div className="sante-recur">
              <div className="sante-recur-hd">Récurrences à surveiller</div>
              <div className="sante-recur-list">
                {sig.stats.recurrences.slice(0, 8).map((r, i) => (
                  <span className="sante-recur-chip" key={i}>{Cli(r.dossier)} {SIG_LBL[r.type] || r.type} <b>×{r.n}</b></span>
                ))}
              </div>
            </div>
          ) : null}
          <ul className="sante-items sante-sig">
            {sig.rows.slice(0, 30).map((s, i) => (
              <li key={i} className="sante-item">
                <span className={`sante-sigt sante-sigt-${s.type}`}>{SIG_LBL[s.type] || s.type}</span>
                {Cli(s.dossier)}{Cle(s.cle)}
                <span className="sante-item-d">{s.detail}</span>
                <span className="sante-item-day">{s.day}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
