import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSla } from "../api.js";

// Alerte SLA en direct — tickets ouverts qui DÉPASSENT ou APPROCHENT (> 80 %) la cible GTR.
// Donnée RÉELLE : cibles GTR de server/sla.json croisées avec l'âge depuis création (calcul serveur
// buildSlaReport). Zéro invention — « à risque » = seuil explicite de 80 % de la cible.

const norm = (s) => String(s || "").trim();
const nowHM = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtH = (h) => { if (h == null) return "—"; const x = Math.round(h); return x >= 48 ? `${Math.round(h / 24)} j` : `${x} h`; };
const bkCls = (b) => ({ P1: "p1", P2: "p2", P3: "p3", P4: "p4" }[b] || "p3");

export default function SlaAlert({ issues = [], onTicket, onClient }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [client, setClient] = useState("Tous");
  const [auto, setAuto] = useState(true);
  const [lastAt, setLastAt] = useState("");
  const timer = useRef(null);

  const byKey = useMemo(() => { const m = {}; for (const i of issues) m[i.cle] = i; return m; }, [issues]);

  const load = useCallback(async () => {
    setErr("");
    try { const r = await fetchSla(); setPayload(r); setLastAt(nowHM()); }
    catch (e) { setErr(e && e.message ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { if (timer.current) { clearInterval(timer.current); timer.current = null; } return; }
    timer.current = setInterval(load, 60000);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [auto, load]);

  const configured = payload?.configured;
  const alerts = payload?.alerts || [];
  const over = alerts.filter((a) => a.state === "over");
  const risk = alerts.filter((a) => a.state === "risk");
  const global = payload?.global;

  const clients = useMemo(() => [...new Set(alerts.map((a) => norm(a.dossier)).filter((d) => d && d !== "—"))].sort(), [alerts]);
  const inClient = (d) => client === "Tous" || norm(d) === client;
  const shownOver = over.filter((a) => inClient(a.dossier));
  const shownRisk = risk.filter((a) => inClient(a.dossier));

  const openTicket = (cle) => { if (onTicket) onTicket(byKey[cle] || { cle }); };

  const Row = ({ a }) => {
    const pct = a.gtrH ? Math.round((a.ageH / a.gtrH) * 100) : null;
    const mesure = a.state === "over"
      ? `${fmtH(a.ageH)} / cible ${fmtH(a.gtrH)} · +${fmtH(a.depassementH)}`
      : `${fmtH(a.ageH)} / cible ${fmtH(a.gtrH)} · ${pct}%`;
    return (
      <li className={`af-ev sla-ev sla-ev-${a.state}`}>
        <span className={`sla-bk sla-bk-${bkCls(a.bucket)}`} title={`Priorité ${a.priorite || a.bucket}`}>{a.bucket}</span>
        {onClient
          ? <button type="button" className="af-cli af-cli-btn" onClick={() => onClient(a.dossier)} title="Ouvrir la fiche client">{norm(a.dossier) || "—"}</button>
          : <span className="af-cli">{norm(a.dossier) || "—"}</span>}
        <button type="button" className="af-cle" onClick={() => openTicket(a.cle)} title="Ouvrir le ticket">{a.cle}</button>
        <span className={`pill ${a.statut === "Terminé" ? "done" : a.statut === "En cours" ? "prog" : a.statut === "Bloqué" ? "block" : "todo"}`}>{a.statut}</span>
        <span className="af-t" title={a.resume}>{a.resume || "—"}</span>
        <span className="sla-mesure">
          <span className="sla-gauge"><span className={`sla-gauge-f ${a.state}`} style={{ width: `${Math.min(100, pct || 0)}%` }} /></span>
          <span className="sla-mesure-t">{mesure}</span>
        </span>
      </li>
    );
  };

  return (
    <div className="af sla">
      <div className="af-intro">
        <b>Alerte SLA — en direct.</b> Tickets ouverts qui <b>dépassent</b> ou <b>approchent</b> (&gt; 80 %) la cible de résolution (GTR). Cibles réelles de <code>sla.json</code> croisées avec l'âge depuis création. Le compte à rebours avance tout seul — actualisation automatique.
      </div>
      <p className="af-do">→ <b>Quoi en faire :</b> traite les <b>dépassés</b> (rouge) d'abord, puis les <b>P1/P2 à risque</b> — ce sont les engagements client en jeu. Clique un ticket pour l'ouvrir, un client pour sa fiche.</p>

      <div className="af-bar">
        <div className="af-live">
          <span className={`af-dot ${loading ? "load" : "on"}`} />
          <span className="af-live-t">En direct</span>
          <span className="af-live-when">{lastAt ? `dernier calcul à ${lastAt}` : "…"}</span>
        </div>
        <div className="af-bar-r">
          <label className="af-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto (1 min)</label>
          <button type="button" className="af-refresh" onClick={load} disabled={loading} title="Recalculer maintenant">↻ Actualiser</button>
        </div>
      </div>

      {err ? (
        <p className="af-empty af-err">Alerte indisponible : {err}</p>
      ) : loading && !payload ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : !configured ? (
        <p className="af-empty">SLA non configuré. Renseigne les cibles GTI/GTR dans <code>server/sla.json</code> (par dossier et priorité) pour activer l'alerte.</p>
      ) : (
        <>
          <div className="af-kpis">
            <div className={`af-kpi ${over.length ? "af-kpi-reg" : ""}`}><b>{over.length}</b><span>en dépassement</span></div>
            <div className="af-kpi sla-kpi-risk"><b>{risk.length}</b><span>à risque (&gt; 80 %)</span></div>
            <div className="af-kpi"><b>{global?.ouverts ?? "—"}</b><span>ouverts suivis</span></div>
            <div className="af-kpi af-kpi-d"><b>{global?.tauxGtr != null ? `${global.tauxGtr} %` : "—"}</b><span>taux GTR (résolus)</span></div>
          </div>

          <div className="af-filters">
            <button type="button" className={`af-chip ${client === "Tous" ? "on" : ""}`} onClick={() => setClient("Tous")}>Tous <b>{alerts.length}</b></button>
            {clients.map((c) => (
              <button type="button" key={c} className={`af-chip ${client === c ? "on" : ""}`} onClick={() => setClient(c)}>{c}</button>
            ))}
          </div>

          {shownOver.length ? (
            <div className="af-day">
              <div className="af-day-hd sla-hd-over">⚠ Dépassés <b>{shownOver.length}</b></div>
              <ul className="af-list">{shownOver.map((a) => <Row a={a} key={a.cle} />)}</ul>
            </div>
          ) : null}

          {shownRisk.length ? (
            <div className="af-day af-day-past">
              <div className="af-day-hd sla-hd-risk">◔ À risque <b>{shownRisk.length}</b></div>
              <ul className="af-list">{shownRisk.map((a) => <Row a={a} key={a.cle} />)}</ul>
            </div>
          ) : null}

          {!shownOver.length && !shownRisk.length ? (
            <p className="af-empty">Aucune alerte SLA{client !== "Tous" ? ` sur ${client}` : ""} — tout est dans les temps.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
