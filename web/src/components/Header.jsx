import React, { useEffect, useState } from "react";

function Kpi({ lbl, val, cls }) {
  return (
    <div className={`kpi ${cls || ""}`}>
      <div className="lbl">{lbl}</div>
      <div className="val">{val ?? "—"}</div>
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24); return `il y a ${d} j`;
}
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

export default function Header({ kpis, source, generatedAt, loading, me, onRefresh, onLogout, onRelaunch, query, onQuery, notifOn, onToggleNotifOn, notifs = [], onOpenNotif, onMarkAllRead }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter((n) => !n.read).length;
  const k = kpis || {};
  const when = generatedAt ? new Date(generatedAt).toLocaleString("fr-FR") : "—";

  // Jauge de chargement (simulée : progresse vers ~92 %, puis 100 % à la fin).
  const [prog, setProg] = useState(0);
  useEffect(() => {
    let id;
    if (loading) {
      setProg((p) => (p > 0 && p < 92 ? p : 8));
      id = setInterval(() => setProg((p) => (p < 92 ? p + Math.max(1, (92 - p) * 0.07) : p)), 320);
      return () => clearInterval(id);
    } else {
      setProg((p) => (p > 0 ? 100 : 0));
      const t = setTimeout(() => setProg(0), 550);
      return () => clearTimeout(t);
    }
  }, [loading]);

  return (
    <header className="hdr">
      <div className="hdr-row">
        <div className="hdr-left">
          <span className="hdr-brand">
            <img src="/cpwire-logo.png" alt="cp|WIRE" className="hdr-logo" />
            <span className="eyebrow">Cockpit de pilotage</span>
          </span>
          <h1 className="hdr-title">Welcome to the jungle !</h1>
        </div>
        <div className="hdr-actions">
          <div className="hdr-bar">
            {onQuery && (
              <div className="hdr-search">
                <span className="hs-ic">🔎</span>
                <input value={query || ""} onChange={(e) => onQuery(e.target.value)}
                  placeholder="Rechercher un ticket, une personne, une clé…" />
                {query ? <button className="hs-x" onClick={() => onQuery("")} title="Effacer">×</button> : null}
              </div>
            )}
            <button className="btn gold gauge-btn" onClick={onRefresh} disabled={loading} title="Actualiser depuis Jira">
              <span className="gauge-fill" style={{ width: `${prog}%` }} />
              <span className="gauge-label">{loading ? `Actualisation… ${Math.round(prog)}%` : "Actualiser"}</span>
            </button>
            {onOpenNotif && (
              <div className="bell-wrap">
                <button className={`btn bell ${notifOn ? "on" : "ghost"}`} onClick={() => setNotifOpen((o) => !o)}
                  title="Notifications">
                  🔔{unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
                </button>
                {notifOpen && (
                  <>
                    <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />
                    <div className="notif-panel" role="dialog">
                      <div className="notif-hd">
                        <span className="notif-title">Notifications</span>
                        <label className="notif-toggle" title="Détection automatique des changements Jira">
                          <input type="checkbox" checked={notifOn} onChange={onToggleNotifOn} /> Auto
                        </label>
                      </div>
                      <div className="notif-sub">
                        <span>{notifs.length} récente(s){unread ? ` · ${unread} non lue(s)` : ""}</span>
                        {notifs.length > 0 && <button className="notif-clear" onClick={onMarkAllRead}>Tout marquer comme lu</button>}
                      </div>
                      <div className="notif-list">
                        {notifs.length === 0 ? (
                          <div className="notif-empty">
                            Aucune notification.<br />
                            {notifOn ? "Les tickets Jira modifiés apparaîtront ici." : "Active « Auto » pour détecter les changements."}
                          </div>
                        ) : (
                          notifs.slice(0, 30).map((n) => (
                            <button className={`notif-item ${n.read ? "" : "unread"}`} key={n.id}
                              onClick={() => { onOpenNotif(n.cle); setNotifOpen(false); }}>
                              <span className="ni-dot" />
                              <span className="ni-body">
                                <span className="ni-line"><b>{n.cle}</b> — {n.resume}</span>
                                <span className="ni-meta">{n.statut ? <span className={`pill ${PILL[n.statut] || ""}`}>{n.statut}</span> : null}<span className="ni-time">{timeAgo(n.at)}</span></span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {onRelaunch && (
              <button className="btn ghost relaunch" onClick={onRelaunch} title="Relancer l'application (recharge la page si elle se bloque)">⟳</button>
            )}
            <button className="btn ghost" onClick={onLogout}>Déconnexion</button>
          </div>
          <div className="src">
            {source ? `Source : ${source}` : "Chargement…"}
            <br />
            Données au {when}
          </div>
        </div>
      </div>

      <div className="kpis">
        <Kpi lbl="Total" val={k.total} />
        <Kpi lbl="À faire" val={k["À faire"]} cls="todo" />
        <Kpi lbl="En cours" val={k["En cours"]} cls="prog" />
        <Kpi lbl="Bloqués" val={k["Bloqué"]} cls="block" />
        <Kpi lbl="En retard" val={k.enRetard} cls="late" />
        <Kpi lbl="Terminés" val={k["Terminé"]} cls="done" />
      </div>

      <div className="progress">
        <span>Avancement ({k["Terminé"] ?? 0} terminés sur {k.total ?? 0})</span>
        <span className="bar">
          <span style={{ width: `${k.avancement || 0}%` }} />
        </span>
        <b>{k.avancement || 0}&nbsp;%</b>
      </div>
    </header>
  );
}
