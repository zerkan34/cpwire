import React, { useEffect, useState, useRef, useMemo } from "react";

function Kpi({ lbl, val, cls, onClick, active }) {
  if (onClick) {
    return (
      <button type="button" className={`kpi ${cls || ""} clickable ${active ? "active" : ""}`} onClick={onClick} title={`Voir : ${lbl}`}>
        <div className="lbl">{lbl}</div>
        <div className="val">{val ?? "—"}</div>
      </button>
    );
  }
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

export default function Header({ kpis, source, generatedAt, loading, me, onRefresh, onLogout, onRelaunch, query, onQuery, notifOn, onToggleNotifOn, notifs = [], onOpenNotif, onMarkAllRead, issues = [], onOpenTicket, onBurger, tab, pageLabel, onKpi, activeKpi }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter((n) => !n.read).length;

  // ----- Recherche : suggestions en accordéon sous la barre -----
  const [sFocus, setSFocus] = useState(false);
  const [sRect, setSRect] = useState(null);
  const searchRef = useRef();
  const q = (query || "").trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (q.length < 2) return [];
    const hit = (i) => `${i.cle} ${i.resume} ${i.dossier} ${(i.contributors || []).join(" ")} ${(i.labels || []).join(" ")} ${i.assigne || ""}`.toLowerCase().includes(q);
    const arr = issues.filter(hit);
    arr.sort((a, b) => (String(b.cle).toLowerCase().includes(q) ? 1 : 0) - (String(a.cle).toLowerCase().includes(q) ? 1 : 0));
    return arr.slice(0, 8);
  }, [issues, q]);
  const showSuggest = sFocus && q.length >= 2;
  useEffect(() => {
    if (!showSuggest) return;
    const upd = () => { if (searchRef.current) { const r = searchRef.current.getBoundingClientRect(); setSRect({ left: r.left, top: r.bottom + 6, width: r.width }); } };
    upd();
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, true);
    return () => { window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd, true); };
  }, [showSuggest, q]);
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

  const search = onQuery && (
    <div className="hdr-search" ref={searchRef}>
      <span className="hs-ic">🔎</span>
      <input value={query || ""} onChange={(e) => onQuery(e.target.value)}
        onFocus={() => setSFocus(true)} onBlur={() => setTimeout(() => setSFocus(false), 160)}
        placeholder="Rechercher un ticket, une personne…" />
      {query ? <button className="hs-x" onClick={() => onQuery("")} title="Effacer">×</button> : null}
      {showSuggest && sRect && (
        <div className="search-suggest" style={{ position: "fixed", left: sRect.left, top: sRect.top, width: sRect.width, zIndex: 2000 }}>
          {suggestions.length === 0 ? (
            <div className="ss-empty">Aucun résultat pour « {query} »</div>
          ) : suggestions.map((i) => (
            <button className="ss-item" key={i.cle}
              onMouseDown={(e) => { e.preventDefault(); onOpenTicket && onOpenTicket(i); setSFocus(false); }}>
              <span className="ss-key">{i.cle}</span>
              <span className="ss-res">{i.resume}</span>
              <span className="ss-meta">
                {(i.contributors && i.contributors[0]) || i.assigne || ""}
                {i.statut ? <span className={`pill ${PILL[i.statut] || ""}`}>{i.statut}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const refresh = (
    <button className="btn gold gauge-btn" onClick={onRefresh} disabled={loading} title="Actualiser depuis Jira">
      <span className="gauge-fill" style={{ width: `${prog}%` }} />
      <span className="gauge-label">{loading ? `Actualisation… ${Math.round(prog)}%` : "Actualiser"}</span>
    </button>
  );

  const bell = onOpenNotif && (
    <div className="bell-wrap">
      <button className={`btn bell ${notifOn ? "on" : "ghost"}`} onClick={() => setNotifOpen((o) => !o)} title="Notifications">
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
                      <span className="ni-expl">{n.who ? <b>{n.who}</b> : null}{n.who ? " · " : ""}{n.action || "Mis à jour"}</span>
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
  );

  return (
    <header className={`hdr ${tab === "cockpit" ? "is-dash" : "is-sub"}`}>
      {/* Barre du haut : marque à gauche, contrôles à droite (même ligne) */}
      <div className="hdr-top">
        <span className="hdr-brand">
          <button className="hdr-burger" type="button" aria-label="Ouvrir le menu" onClick={onBurger}>☰</button>
          <img src="/cpwire-logo.png" alt="cp|WIRE" className="hdr-logo" />
          <span className="eyebrow">Cockpit de pilotage <span className="hdr-build" title="Version du code en ligne">BUILD stable-v25</span></span>
        </span>
        <div className="hdr-controls">
          {search}
          {refresh}
          {bell}
          <button className="btn ghost hdr-logout" onClick={onLogout} title="Se déconnecter">Déconnexion</button>
        </div>
      </div>

      {/* Titre + fraîcheur des données */}
      <div className="hdr-headline">
        <div className="hdr-left">
          <h1 className="hdr-title">Welcome to the jungle !<span className="hdr-tagline">, we take it day-by-day !</span></h1>
          <div className="hdr-page">{pageLabel || ""}</div>
        </div>
        <div className="src">{source ? `Source : ${source}` : "Chargement…"}<br />Données au {when} <span className="hdr-build hdr-build-src" title="Version du code en ligne">BUILD stable-v25</span></div>
      </div>

      <div className="kpis">
        <Kpi lbl="Total" val={k.total} onClick={onKpi && (() => onKpi("total"))} active={activeKpi === "total"} />
        <Kpi lbl="À faire" val={k["À faire"]} cls="todo" onClick={onKpi && (() => onKpi("À faire"))} active={activeKpi === "À faire"} />
        <Kpi lbl="En cours" val={k["En cours"]} cls="prog" onClick={onKpi && (() => onKpi("En cours"))} active={activeKpi === "En cours"} />
        <Kpi lbl="Bloqués" val={k["Bloqué"]} cls="block" onClick={onKpi && (() => onKpi("Bloqué"))} active={activeKpi === "Bloqué"} />
        <Kpi lbl="En retard" val={k.enRetard} cls="late" onClick={onKpi && (() => onKpi("late"))} active={activeKpi === "late"} />
        <Kpi lbl="Terminés" val={k["Terminé"]} cls="done" onClick={onKpi && (() => onKpi("Terminé"))} active={activeKpi === "Terminé"} />
      </div>

      <div className="progress">
        <span>Avancement ({k["Terminé"] ?? 0} terminés sur {k.total ?? 0})</span>
        <span className="bar"><span style={{ width: `${k.avancement || 0}%` }} /></span>
        <b>{k.avancement || 0}&nbsp;%</b>
      </div>
    </header>
  );
}
