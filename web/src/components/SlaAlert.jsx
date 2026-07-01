import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSla } from "../api.js";

// Alerte SLA en direct — tickets ouverts qui DÉPASSENT ou APPROCHENT (> 80 %) la cible GTR.
// Donnée RÉELLE : cibles GTR de server/sla.json croisées avec l'âge depuis création (calcul serveur
// buildSlaReport). Zéro invention — « à risque » = seuil explicite de 80 % de la cible.

const norm = (s) => String(s || "").trim();
const nowHM = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtH = (h) => { if (h == null) return "—"; const x = Math.round(h); return x >= 48 ? `${Math.round(h / 24)} j` : `${x} h`; };
const bkCls = (b) => ({ P1: "p1", P2: "p2", P3: "p3", P4: "p4" }[b] || "p3");

export default function SlaAlert({ issues = [], onTicket, onClient, changedKeys }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [client, setClient] = useState("Tous");
  const [auto, setAuto] = useState(true);
  const [hideOld, setHideOld] = useState(true); // masquer les dormants > 3 mois (sans utilisation)
  const [lastAt, setLastAt] = useState("");
  const timer = useRef(null);

  const byKey = useMemo(() => { const m = {}; for (const i of issues) m[i.cle] = i; return m; }, [issues]);

  // « Sans utilisation » = dernière modif Jira (maj) il y a plus de 90 j. Repli sur la date de création
  // si maj absente. Donnée RÉELLE issue du ticket — pas de valeur fabriquée : si aucune date, non masqué.
  const OLD_DAYS = 90;
  const daysSinceUse = useCallback((cle) => {
    const it = byKey[cle]; if (!it) return null;
    const d = it.maj || it.cree; if (!d) return null;
    const t = Date.parse(d); if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
  }, [byKey]);
  const isDormant = useCallback((cle) => { const n = daysSinceUse(cle); return n != null && n >= OLD_DAYS; }, [daysSinceUse]);

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
  const gtiAll = payload?.gtiAlerts || [];
  const gtiOver = gtiAll.filter((a) => a.state === "over");
  const global = payload?.global;

  const clients = useMemo(() => [...new Set(alerts.map((a) => norm(a.dossier)).filter((d) => d && d !== "—"))].sort(), [alerts]);
  const inClient = (d) => client === "Tous" || norm(d) === client;
  const okOld = (a) => !hideOld || !isDormant(a.cle);
  const shownOver = over.filter((a) => inClient(a.dossier) && okOld(a));
  const shownRisk = risk.filter((a) => inClient(a.dossier) && okOld(a));
  const shownGtiOver = gtiOver.filter((a) => inClient(a.dossier) && okOld(a));
  // Nombre de dormants masqués dans le périmètre client courant (pour l'affichage de l'œil).
  const hiddenOld = hideOld ? [...over, ...risk].filter((a) => inClient(a.dossier) && isDormant(a.cle)).length : 0;

  const openTicket = (cle) => { if (onTicket) onTicket(byKey[cle] || { cle }); };

  const Row = ({ a }) => {
    const cible = a.kind === "gti" ? a.gtiH : a.gtrH;
    const pct = cible ? Math.round((a.ageH / cible) * 100) : null;
    const quoi = a.kind === "gti" ? "prise en charge" : "";
    const mesure = a.state === "over"
      ? `${fmtH(a.ageH)} / cible ${fmtH(cible)} · +${fmtH(a.depassementH)}${quoi ? " · " + quoi : ""}`
      : `${fmtH(a.ageH)} / cible ${fmtH(cible)} · ${pct}%${quoi ? " · " + quoi : ""}`;
    return (
      <li className={`af-ev sla-ev sla-ev-${a.state}${changedKeys && changedKeys.has && changedKeys.has(a.cle) ? " is-fresh is-fresh-down" : ""}`}>
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
        <b>Alerte SLA — en direct.</b> Deux horloges : <b>résolution (GTR)</b> — tickets ouverts qui dépassent ou approchent (&gt; 80 %) la cible depuis la création — et <b>prise en charge (GTI)</b> — tickets encore « à faire » non pris en charge dans les temps. Cibles réelles de <code>sla.json</code>. Le compte à rebours avance tout seul.
      </div>
      <p className="af-do">→ <b>Quoi en faire :</b> traite les <b>dépassés</b> (rouge) d'abord, puis les <b>P1/P2 à risque</b> — ce sont les engagements client en jeu. Les tickets <b>dormants</b> (&gt; 3 mois sans utilisation) sont masqués par défaut : clique l'<b>œil</b> pour les revoir. Clique un ticket pour l'ouvrir, un client pour sa fiche.</p>

      <div className="af-bar">
        <div className="af-live">
          <span className={`af-dot ${loading ? "load" : "on"}`} />
          <span className="af-live-t">En direct</span>
          <span className="af-live-when">{lastAt ? `dernier calcul à ${lastAt}` : "…"}</span>
        </div>
        <div className="af-bar-r">
          <button type="button" className={`af-eye ${hideOld ? "off" : "on"}`} onClick={() => setHideOld((v) => !v)}
            aria-pressed={hideOld}
            title={hideOld ? "Afficher les tickets dormants (plus de 3 mois sans utilisation)" : "Masquer les tickets dormants (plus de 3 mois sans utilisation)"}>
            {hideOld
              ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" /><path d="M9.4 5.2A9.9 9.9 0 0 1 12 5c5 0 9 5 9 7a12 12 0 0 1-2.2 2.7" /><path d="M6.1 6.6C3.8 8 2 10.6 2 12c0 2 4 7 10 7a9.7 9.7 0 0 0 3.4-.6" /></svg>
              : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
            <span className="af-eye-t">{hideOld ? `Dormants masqués${hiddenOld ? ` · ${hiddenOld}` : ""}` : "Dormants affichés"}</span>
          </button>
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
            <div className={`af-kpi ${over.length ? "af-kpi-reg" : ""}`}><b>{over.length}</b><span>GTR en dépassement</span></div>
            <div className="af-kpi sla-kpi-risk"><b>{risk.length}</b><span>GTR à risque (&gt; 80 %)</span></div>
            <div className={`af-kpi ${gtiOver.length ? "af-kpi-reg" : ""}`}><b>{gtiOver.length}</b><span>prise en charge (GTI) dépassée</span></div>
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

          {shownGtiOver.length ? (
            <div className="af-day">
              <div className="af-day-hd sla-hd-over">⏱ Prise en charge (GTI) dépassée <b>{shownGtiOver.length}</b></div>
              <ul className="af-list">{shownGtiOver.map((a) => <Row a={a} key={"gti-" + a.cle} />)}</ul>
            </div>
          ) : null}

          {!shownOver.length && !shownRisk.length && !shownGtiOver.length ? (
            hiddenOld ? (
              <p className="af-empty">Aucune alerte active{client !== "Tous" ? ` sur ${client}` : ""} — mais <b>{hiddenOld}</b> ticket{hiddenOld > 1 ? "s" : ""} dormant{hiddenOld > 1 ? "s" : ""} (&gt; 3 mois sans utilisation) {hiddenOld > 1 ? "sont masqués" : "est masqué"}. Clique l'œil pour {hiddenOld > 1 ? "les" : "l'"}afficher.</p>
            ) : (
              <p className="af-empty">Aucune alerte SLA{client !== "Tous" ? ` sur ${client}` : ""} — tout est dans les temps.</p>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
