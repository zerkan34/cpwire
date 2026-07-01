import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchActivite } from "../api.js";

// Flux d'activité — ce qui bouge, avec de la donnée RÉELLE, zéro invention.
//  • Aujourd'hui, à l'heure : transitions de statut du changelog Jira (from → to, qui, heure) + apparitions.
//  • Jours précédents, au jour : mouvements dérivés des relevés quotidiens (pointHistory), 0 appel Jira.
//  • Régressions (retours en arrière) mises en évidence, « depuis ta dernière visite », pouls par client,
//    et classement des basculeurs du jour.

const SEEN_KEY = "cpwire:activite:seen";
const norm = (s) => String(s || "").trim();
const PAD = (n) => String(n).padStart(2, "0");
const hhmm = (iso) => { try { const d = new Date(iso); return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`; } catch { return "—"; } };
const nowHM = () => { const d = new Date(); return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`; };
const dayFR = (ymd) => { try { const d = new Date(ymd + "T00:00:00"); return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }); } catch { return ymd; } };

// Couleur grossière d'un statut/catégorie, pour la pastille (réutilise l'esprit des pills de l'app).
function coarse(s) {
  const x = String(s || "").toLowerCase();
  if (!x) return "none";
  if (/(termin|clos|clot|clôt|done|prod|résolu|resolu|ferm)/.test(x)) return "done";
  if (/(bloq|block|attente|hold|susp|stand)/.test(x)) return "block";
  if (/(cours|progress|dev|recett|test|review|reprise|vérif|verif)/.test(x)) return "prog";
  if (/(faire|to ?do|ouvert|open|nouveau|backlog|traiter|qualifier)/.test(x)) return "todo";
  return "none";
}

// Mini-courbe (sparkline) SVG pour le pouls d'un client.
function Sparkline({ data = [], w = 108, h = 24 }) {
  if (!data.length) return <span className="af-spark-empty">—</span>;
  const max = Math.max(1, ...data.map((d) => d.n));
  const n = data.length;
  const x = (i) => (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => h - 3 - (v / max) * (h - 6);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.n).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  return (
    <svg className="af-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Pouls : ${data.reduce((s, d) => s + d.n, 0)} mouvements`}>
      <polyline points={pts} className="af-spark-line" />
      <circle cx={x(n - 1)} cy={y(last.n)} r="2.2" className="af-spark-dot" />
    </svg>
  );
}

export default function ActivityFeed({ issues = [], onTicket }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [client, setClient] = useState("Tous");
  const [type, setType] = useState("Tous"); // Tous | transition | creation | regression
  const [auto, setAuto] = useState(true);
  const [lastAt, setLastAt] = useState("");
  const [openRank, setOpenRank] = useState(false);
  const [openPulse, setOpenPulse] = useState(true);
  const timer = useRef(null);
  const lastSeenRef = useRef(Number(localStorage.getItem(SEEN_KEY)) || 0);

  const byKey = useMemo(() => { const m = {}; for (const i of issues) m[i.cle] = i; return m; }, [issues]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await fetchActivite();
      setPayload(r);
      setLastAt(nowHM());
    } catch (e) {
      setErr(e && e.message ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { if (timer.current) { clearInterval(timer.current); timer.current = null; } return; }
    timer.current = setInterval(load, 60000);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [auto, load]);
  // On mémorise l'heure de cette visite en sortant, pour que la prochaine « depuis ta dernière visite » soit juste.
  useEffect(() => () => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* ignore */ } }, []);

  const events = payload?.events || [];
  const history = payload?.history || [];
  const pulse = payload?.pulse || {};

  const clients = useMemo(() => {
    const set = new Set();
    events.forEach((e) => set.add(norm(e.dossier)));
    history.forEach((d) => (d.movements || []).forEach((m) => set.add(norm(m.dossier))));
    Object.keys(pulse).forEach((d) => set.add(norm(d)));
    return [...set].filter((d) => d && d !== "—").sort();
  }, [events, history, pulse]);

  const inClient = (d) => client === "Tous" || norm(d) === client;

  const shownToday = useMemo(() => events.filter((e) =>
    inClient(e.dossier) &&
    (type === "Tous" ? true : type === "regression" ? e.regression : e.kind === type)
  ), [events, client, type]);

  const nMov = events.filter((e) => e.kind === "transition").length;
  const nNew = events.filter((e) => e.kind === "creation").length;
  const nReg = events.filter((e) => e.regression).length;
  const dateFR = payload?.dateISO
    ? new Date(payload.dateISO).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })
    : "";

  // Depuis ta dernière visite : mouvements/apparitions plus récents que la dernière ouverture.
  const seen = lastSeenRef.current;
  const isNew = (at) => seen > 0 && at && new Date(at).getTime() > seen;
  const sinceCount = useMemo(() => events.filter((e) => isNew(e.at)).length, [events]);

  // Classement des basculeurs du jour (qui a fait avancer combien de tickets), périmètre client courant.
  const rank = useMemo(() => {
    const m = {};
    events.forEach((e) => { if (e.kind === "transition" && inClient(e.dossier) && e.who) m[e.who] = (m[e.who] || 0) + 1; });
    return Object.entries(m).map(([who, n]) => ({ who, n })).sort((a, b) => b.n - a.n).slice(0, 10);
  }, [events, client]);

  // Pouls par client (sparkline sur la fenêtre). Filtré si un client est sélectionné.
  const pulseRows = useMemo(() => {
    return Object.entries(pulse)
      .filter(([d]) => inClient(d))
      .map(([d, series]) => ({ dossier: d, series, total: series.reduce((s, x) => s + x.n, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [pulse, client]);

  // Traîne : jours précédents filtrés (client + type). Créations n'existent pas dans la traîne.
  const shownHistory = useMemo(() => {
    if (type === "creation") return [];
    return history.map((d) => ({
      ...d,
      movements: (d.movements || []).filter((m) => inClient(m.dossier) && (type !== "regression" || m.regression)),
    })).filter((d) => d.movements.length);
  }, [history, client, type]);

  const openTicket = (cle) => { if (onTicket) onTicket(byKey[cle] || { cle }); };

  const StatusChips = ({ from, to, fromLabel, toLabel, statut, kind, regression }) => {
    if (kind === "creation") return (
      <span className="af-move"><span className="af-new">Nouveau</span>{statut ? <span className={`af-st af-st-${coarse(statut)}`}>{statut}</span> : null}</span>
    );
    const f = fromLabel || from, t = toLabel || to;
    return (
      <span className="af-move">
        <span className={`af-st af-st-${coarse(f)}`}>{f || "∅"}</span>
        <span className="af-arr">→</span>
        <span className={`af-st af-st-${coarse(t)}`}>{t || "∅"}</span>
        {regression ? <span className="af-reg-badge" title="Retour en arrière">↩ régression</span> : null}
      </span>
    );
  };

  return (
    <div className="af">
      <div className="af-intro">
        <b>Flux d'activité.</b> Aujourd'hui <b>à l'heure</b> (transitions du changelog Jira + apparitions), puis les jours précédents <b>au jour</b> (dérivés des relevés quotidiens). Retours en arrière signalés. Source réelle uniquement — si rien ne bouge, le flux reste vide.
      </div>

      <div className="af-bar">
        <div className="af-live">
          <span className={`af-dot ${loading ? "load" : "on"}`} />
          <span className="af-live-t">En direct</span>
          <span className="af-live-when">{lastAt ? `dernier relevé à ${lastAt}` : "…"}</span>
        </div>
        <div className="af-bar-r">
          <label className="af-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto (1 min)</label>
          <button type="button" className="af-refresh" onClick={load} disabled={loading} title="Actualiser maintenant">↻ Actualiser</button>
        </div>
      </div>

      {sinceCount > 0 ? (
        <div className="af-since">
          <span className="af-since-dot" /> <b>{sinceCount}</b> mouvement{sinceCount > 1 ? "s" : ""} depuis ta dernière visite{seen ? ` (${hhmm(new Date(seen).toISOString())})` : ""}.
        </div>
      ) : null}

      <div className="af-kpis">
        <div className="af-kpi"><b>{nMov}</b><span>mouvements (jour)</span></div>
        <div className="af-kpi"><b>{nNew}</b><span>apparitions</span></div>
        <div className={`af-kpi ${nReg ? "af-kpi-reg" : ""}`}><b>{nReg}</b><span>régressions</span></div>
        <div className="af-kpi af-kpi-d"><b>{dateFR || "—"}</b><span>journée</span></div>
      </div>

      {payload?.capped ? (
        <p className="af-cap">Aujourd'hui plafonné aux <b>{payload.scanned}</b> tickets les plus récemment bougés (sur {payload.total}), pour garder le flux rapide. La traîne des jours précédents n'est pas concernée.</p>
      ) : null}

      {/* Pouls par client */}
      {pulseRows.length ? (
        <div className="af-panel">
          <button type="button" className="af-panel-hd" onClick={() => setOpenPulse((v) => !v)}>
            <span>Pouls des clients <small>· mouvements/jour sur la fenêtre</small></span>
            <span className="af-panel-x">{openPulse ? "▾" : "▸"}</span>
          </button>
          {openPulse ? (
            <div className="af-pulse">
              {pulseRows.map((r) => (
                <button type="button" key={r.dossier} className={`af-pulse-row ${client === r.dossier ? "on" : ""}`} onClick={() => setClient(client === r.dossier ? "Tous" : r.dossier)} title="Filtrer sur ce client">
                  <span className="af-pulse-name">{r.dossier}</span>
                  <Sparkline data={r.series} />
                  <span className="af-pulse-tot">{r.total}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Classement des basculeurs du jour */}
      {rank.length ? (
        <div className="af-panel">
          <button type="button" className="af-panel-hd" onClick={() => setOpenRank((v) => !v)}>
            <span>Qui fait avancer quoi <small>· aujourd'hui{client !== "Tous" ? ` · ${client}` : ""}</small></span>
            <span className="af-panel-x">{openRank ? "▾" : "▸"}</span>
          </button>
          {openRank ? (
            <ol className="af-rank">
              {rank.map((r, i) => (
                <li key={r.who}><span className="af-rank-i">{i + 1}</span><span className="af-rank-who">{r.who}</span><span className="af-rank-bar"><span style={{ width: `${Math.round((r.n / rank[0].n) * 100)}%` }} /></span><b>{r.n}</b></li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {/* Filtres */}
      <div className="af-filters">
        <button type="button" className={`af-chip ${client === "Tous" ? "on" : ""}`} onClick={() => setClient("Tous")}>Tous <b>{events.length}</b></button>
        {clients.map((c) => (
          <button type="button" key={c} className={`af-chip ${client === c ? "on" : ""}`} onClick={() => setClient(c)}>{c}</button>
        ))}
      </div>
      <div className="af-types" role="tablist" aria-label="Type d'événement">
        {[["Tous", "Tout"], ["transition", "Mouvements"], ["creation", "Apparitions"], ["regression", `Régressions${nReg ? " " + nReg : ""}`]].map(([id, lbl]) => (
          <button type="button" key={id} className={`af-type ${type === id ? "on" : ""} ${id === "regression" && nReg ? "has-reg" : ""}`} onClick={() => setType(id)}>{lbl}</button>
        ))}
      </div>

      {err ? (
        <p className="af-empty af-err">Flux indisponible : {err}</p>
      ) : loading && !events.length ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : (
        <>
          {/* Aujourd'hui (à l'heure) */}
          {shownToday.length ? (
            <div className="af-day">
              <div className="af-day-hd">{dateFR ? `Aujourd'hui — ${dateFR}` : "Aujourd'hui"} <b>{shownToday.length}</b></div>
              <ul className="af-list">
                {shownToday.map((e, idx) => (
                  <li className={`af-ev af-ev-${e.kind} ${e.regression ? "af-ev-reg" : ""} ${isNew(e.at) ? "af-ev-new" : ""}`} key={`${e.cle}-${e.at}-${idx}`}>
                    <span className="af-h">{hhmm(e.at)}</span>
                    <span className="af-cli">{norm(e.dossier) || "—"}</span>
                    <button type="button" className="af-cle" onClick={() => openTicket(e.cle)} title="Ouvrir le ticket">{e.cle}</button>
                    <StatusChips from={e.from} to={e.to} statut={e.statut} kind={e.kind} regression={e.regression} />
                    <span className="af-t" title={e.resume}>{e.resume || "—"}</span>
                    {(e.who || e.dev) ? (
                      <span className="af-who">{e.who ? <>par <b>{e.who}</b></> : null}{e.dev && e.dev !== e.who ? <span className="af-dev"> · dév. {e.dev}</span> : null}</span>
                    ) : <span className="af-who af-who-none">—</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (type !== "creation" || nNew === 0) && !shownHistory.length ? (
            <p className="af-empty">Rien à afficher{client !== "Tous" ? ` sur ${client}` : ""}{type !== "Tous" ? ` (${type === "transition" ? "mouvements" : type === "creation" ? "apparitions" : "régressions"})` : ""}. Le flux se remplit dès qu'un ticket bouge ou apparaît.</p>
          ) : null}

          {/* Traîne : jours précédents (au jour) */}
          {shownHistory.map((d) => (
            <div className="af-day af-day-past" key={d.day}>
              <div className="af-day-hd">{dayFR(d.day)} <b>{d.movements.length}</b> <span className="af-day-tag">au jour</span></div>
              <ul className="af-list">
                {d.movements.map((m, idx) => (
                  <li className={`af-ev af-ev-transition ${m.regression ? "af-ev-reg" : ""}`} key={`${m.cle}-${d.day}-${idx}`}>
                    <span className="af-h af-h-day">—</span>
                    <span className="af-cli">{norm(m.dossier) || "—"}</span>
                    <button type="button" className="af-cle" onClick={() => openTicket(m.cle)} title="Ouvrir le ticket">{m.cle}</button>
                    <StatusChips fromLabel={m.fromLabel} toLabel={m.toLabel} kind="transition" regression={m.regression} />
                    <span className="af-t" title={m.resume}>{m.resume || "—"}</span>
                    <span className="af-who af-who-none">—</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
