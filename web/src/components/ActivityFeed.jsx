import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchActivite } from "../api.js";

// Flux d'activité — ce qui bouge AUJOURD'HUI, en direct.
// Source RÉELLE : transitions de statut du changelog Jira (from → to, qui, heure) + apparitions
// (date de création). Aucune donnée inventée : si rien ne bouge, le flux reste vide.

const norm = (s) => String(s || "").trim();
const PAD = (n) => String(n).padStart(2, "0");
const hhmm = (iso) => { try { const d = new Date(iso); return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`; } catch { return "—"; } };
const nowHM = () => { const d = new Date(); return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`; };

// Couleur grossière d'un statut Jira brut, pour la pastille de transition (réutilise l'esprit des pills).
function coarse(s) {
  const x = String(s || "").toLowerCase();
  if (!x) return "none";
  if (/(termin|clos|clot|clôt|done|prod|résolu|resolu|ferm)/.test(x)) return "done";
  if (/(bloq|block|attente|hold|susp|stand)/.test(x)) return "block";
  if (/(cours|progress|dev|recett|test|review|reprise|vérif|verif)/.test(x)) return "prog";
  if (/(faire|to ?do|ouvert|open|nouveau|backlog|traiter|à qualifier)/.test(x)) return "todo";
  return "none";
}

export default function ActivityFeed({ issues = [], onTicket }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [client, setClient] = useState("Tous");
  const [type, setType] = useState("Tous"); // Tous | transition | creation
  const [auto, setAuto] = useState(true);
  const [lastAt, setLastAt] = useState("");
  const timer = useRef(null);

  // Index des issues (pour ouvrir le ticket complet au clic).
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

  const events = payload?.events || [];
  const clients = useMemo(
    () => [...new Set(events.map((e) => norm(e.dossier)).filter((d) => d && d !== "—"))].sort(),
    [events]
  );
  const shown = useMemo(() => events.filter((e) =>
    (client === "Tous" || norm(e.dossier) === client) &&
    (type === "Tous" || e.kind === type)
  ), [events, client, type]);

  const nMov = events.filter((e) => e.kind === "transition").length;
  const nNew = events.filter((e) => e.kind === "creation").length;
  const dateFR = payload?.dateISO
    ? new Date(payload.dateISO).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })
    : "";

  const openTicket = (cle) => { if (onTicket) onTicket(byKey[cle] || { cle }); };

  return (
    <div className="af">
      <div className="af-intro">
        <b>Flux d'activité — aujourd'hui, en direct.</b> Les vrais mouvements de la journée : <b>changements de statut</b> (d'où vers où, par qui, à quelle heure) et <b>apparitions</b> de tickets. Source : changelog Jira. Aucune donnée inventée — si rien ne bouge, le flux reste vide.
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

      <div className="af-kpis">
        <div className="af-kpi"><b>{nMov}</b><span>mouvements</span></div>
        <div className="af-kpi"><b>{nNew}</b><span>apparitions</span></div>
        <div className="af-kpi af-kpi-d"><b>{dateFR || "—"}</b><span>journée</span></div>
      </div>

      {payload?.capped ? (
        <p className="af-cap">Affichage plafonné aux <b>{payload.scanned}</b> tickets les plus récemment bougés (sur {payload.total}). Les transitions au-delà ne sont pas relues, pour garder le flux rapide.</p>
      ) : null}

      <div className="af-filters">
        <button type="button" className={`af-chip ${client === "Tous" ? "on" : ""}`} onClick={() => setClient("Tous")}>Tous <b>{events.length}</b></button>
        {clients.map((c) => (
          <button type="button" key={c} className={`af-chip ${client === c ? "on" : ""}`} onClick={() => setClient(c)}>{c}</button>
        ))}
      </div>
      <div className="af-types" role="tablist" aria-label="Type d'événement">
        {[["Tous", "Tout"], ["transition", "Mouvements"], ["creation", "Apparitions"]].map(([id, lbl]) => (
          <button type="button" key={id} className={`af-type ${type === id ? "on" : ""}`} onClick={() => setType(id)}>{lbl}</button>
        ))}
      </div>

      {err ? (
        <p className="af-empty af-err">Flux indisponible : {err}</p>
      ) : loading && !events.length ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : shown.length ? (
        <div className="af-day">
          <div className="af-day-hd">{dateFR ? `Aujourd'hui — ${dateFR}` : "Aujourd'hui"} <b>{shown.length}</b></div>
          <ul className="af-list">
            {shown.map((e, idx) => (
              <li className={`af-ev af-ev-${e.kind}`} key={`${e.cle}-${e.at}-${idx}`}>
                <span className="af-h">{hhmm(e.at)}</span>
                <span className="af-cli">{norm(e.dossier) || "—"}</span>
                <button type="button" className="af-cle" onClick={() => openTicket(e.cle)} title="Ouvrir le ticket">{e.cle}</button>
                <span className="af-move">
                  {e.kind === "creation" ? (
                    <>
                      <span className="af-new">Nouveau</span>
                      {e.statut ? <span className={`af-st af-st-${coarse(e.statut)}`}>{e.statut}</span> : null}
                    </>
                  ) : (
                    <>
                      <span className={`af-st af-st-${coarse(e.from)}`}>{e.from || "∅"}</span>
                      <span className="af-arr">→</span>
                      <span className={`af-st af-st-${coarse(e.to)}`}>{e.to || "∅"}</span>
                    </>
                  )}
                </span>
                <span className="af-t" title={e.resume}>{e.resume || "—"}</span>
                {(e.who || e.dev) ? (
                  <span className="af-who">
                    {e.who ? <>par <b>{e.who}</b></> : null}
                    {e.dev && e.dev !== e.who ? <span className="af-dev"> · dév. {e.dev}</span> : null}
                  </span>
                ) : <span className="af-who af-who-none">—</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="af-empty">Rien n'a bougé aujourd'hui{client !== "Tous" ? ` sur ${client}` : ""}{type !== "Tous" ? ` (${type === "transition" ? "mouvements" : "apparitions"})` : ""}. Le flux se remplira dès qu'un ticket change de statut ou apparaît.</p>
      )}
    </div>
  );
}
