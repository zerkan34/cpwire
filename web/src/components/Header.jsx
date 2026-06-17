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

export default function Header({ kpis, source, generatedAt, syncedAt, loading, me, onRefresh, onReloadAll, onLogout, onRelaunch, role, presence = [], onPresence, query, onQuery, notifOn, onToggleNotifOn, notifs = [], onOpenNotif, onMarkAllRead, issues = [], onOpenTicket, onBurger, tab, pageLabel, onKpi, activeKpi }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = notifs.filter((n) => !n.read).length;

  // ----- Recherche : suggestions en accordéon sous la barre -----
  const [sFocus, setSFocus] = useState(false);
  const [seeAll, setSeeAll] = useState(false);
  const [sRect, setSRect] = useState(null);
  const searchRef = useRef();
  const q = (query || "").trim().toLowerCase();
  const allMatches = useMemo(() => {
    if (q.length < 2) return [];
    const hit = (i) => `${i.cle} ${i.resume} ${i.dossier} ${(i.contributors || []).join(" ")} ${(i.labels || []).join(" ")} ${i.assigne || ""}`.toLowerCase().includes(q);
    const arr = issues.filter(hit);
    arr.sort((a, b) => (String(b.cle).toLowerCase().includes(q) ? 1 : 0) - (String(a.cle).toLowerCase().includes(q) ? 1 : 0));
    return arr;
  }, [issues, q]);
  const suggestions = allMatches.slice(0, 8);
  const showSuggest = sFocus && q.length >= 2 && !seeAll;
  useEffect(() => { if (q.length < 2) setSeeAll(false); }, [q]);
  useEffect(() => {
    if (!seeAll) return;
    const onKey = (e) => { if (e.key === "Escape") setSeeAll(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seeAll]);
  useEffect(() => {
    if (!showSuggest) return;
    const upd = () => { if (searchRef.current) { const r = searchRef.current.getBoundingClientRect(); setSRect({ left: r.left, top: r.bottom + 6, width: r.width }); } };
    upd();
    window.addEventListener("resize", upd); window.addEventListener("scroll", upd, true);
    return () => { window.removeEventListener("resize", upd); window.removeEventListener("scroll", upd, true); };
  }, [showSuggest, q]);
  const k = kpis || {};
  const when = (syncedAt || generatedAt) ? new Date(syncedAt || generatedAt).toLocaleString("fr-FR") : "—";

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
        onKeyDown={(e) => { if (e.key === "Enter" && q.length >= 2) { e.preventDefault(); setSeeAll(true); setSFocus(false); } }}
        placeholder="Rechercher un ticket, une personne… (Entrée = tout voir)" />
      {query ? <button className="hs-x" onClick={() => onQuery("")} title="Effacer">×</button> : null}
      {showSuggest && sRect && (
        <div className="search-suggest" style={{ position: "fixed", left: sRect.left, top: sRect.top, width: Math.min(Math.max(sRect.width, 480), (typeof window !== "undefined" ? window.innerWidth : 1200) - sRect.left - 12), zIndex: 2000 }}>
          {suggestions.length === 0 ? (
            <div className="ss-empty">Aucun résultat pour « {query} »</div>
          ) : (<>
            {suggestions.map((i) => (
              <button className="ss-item" key={i.cle}
                onMouseDown={(e) => { e.preventDefault(); onOpenTicket && onOpenTicket(i); setSFocus(false); }}>
                <span className="ss-key">{i.cle}</span>
                <span className="ss-res">{i.resume}</span>
                <span className="ss-meta">
                  <span className="tag">{i.dossier}</span>
                  {(i.contributors && i.contributors[0]) || i.assigne || ""}
                  {i.statut ? <span className={`pill ${PILL[i.statut] || ""}`}>{i.statut}</span> : null}
                </span>
              </button>
            ))}
            {allMatches.length > suggestions.length && (
              <button className="ss-all" onMouseDown={(e) => { e.preventDefault(); setSeeAll(true); setSFocus(false); }}>
                ↵ Voir les {allMatches.length} résultats
              </button>
            )}
          </>)}
        </div>
      )}
      {seeAll && q.length >= 2 && (
        <div className="ss-modal-back" onMouseDown={() => setSeeAll(false)}>
          <div className="ss-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ss-modal-hd">
              <span>Résultats pour « {query} » <b>{allMatches.length}</b></span>
              <button onClick={() => setSeeAll(false)} title="Fermer (Échap)">×</button>
            </div>
            <div className="ss-modal-list">
              {allMatches.length === 0 ? <div className="ss-empty">Aucun résultat.</div> : allMatches.map((i) => (
                <button className="ss-item" key={i.cle}
                  onClick={() => { onOpenTicket && onOpenTicket(i); setSeeAll(false); }}>
                  <span className="ss-key">{i.cle}</span>
                  <span className="ss-res">{i.resume}</span>
                  <span className="ss-meta">
                    <span className="tag">{i.dossier}</span>
                    {(i.contributors && i.contributors[0]) || i.assigne || ""}
                    {i.statut ? <span className={`pill ${PILL[i.statut] || ""}`}>{i.statut}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const refresh = (
    <button className={`hdr-ic refresh ${loading ? "spin" : ""}`} onClick={onRefresh} disabled={loading}
      title={loading ? `Actualisation… ${Math.round(prog)}%` : "Actualiser depuis Jira"} aria-label="Actualiser">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
    </button>
  );

  const reloadAll = onReloadAll && (
    <button className={`hdr-ic ${loading ? "spin" : ""}`} onClick={onReloadAll} disabled={loading}
      title="Tout recharger : réimporte l'intégralité des tickets depuis Jira" aria-label="Tout recharger">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
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

  const isDesktop = typeof document !== "undefined" && document.documentElement.classList.contains("is-desktop");
  // Boutons fenêtre : seulement si la coquille Tauri expose vraiment les contrôles (sinon ils seraient inertes).
  const isTauri = typeof window !== "undefined" && !!(window.__TAURI__ && window.__TAURI__.window && window.__TAURI__.window.getCurrentWindow);

  return (
    <header className={`hdr ${tab === "cockpit" ? "is-dash" : "is-sub"}`} data-tauri-drag-region>
      {/* Barre du haut : marque à gauche, contrôles à droite (même ligne) */}
      <div className="hdr-top" data-tauri-drag-region>
        <span className="hdr-brand" data-tauri-drag-region>
          <button className="hdr-burger" type="button" aria-label="Ouvrir le menu" onClick={onBurger}>☰</button>
          <img src="/cpwire-logo.png" alt="cp|WIRE" className="hdr-logo" />
          <span className="eyebrow">Cockpit de pilotage <span className="hdr-build" title="Version du code en ligne">BUILD stable-v123</span></span>
        </span>
        <div className="hdr-controls">
          {search}
          {role === "owner" && onPresence && (
            <button className={`hdr-ic pres ${presence.length ? "on" : ""}`} onClick={onPresence}
              title={presence.length ? "Connectés : " + presence.map((u) => u.email).join(", ") + " · Admin & accès" : "Personne d'autre connecté · Admin & accès"} aria-label="Présence et accès">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg>
              {presence.length > 0 && <span className="ic-badge">{presence.length}</span>}
            </button>
          )}
          {reloadAll}
          {refresh}
          {bell}
          <button className="hdr-ic" onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h12"/></svg>
            </button>
          {isTauri && (
            <div className="winctl">
              <button className="winbtn" title="Réduire" onClick={() => window.__TAURI__?.window?.getCurrentWindow?.().minimize?.()}>–</button>
              <button className="winbtn" title="Agrandir / restaurer" onClick={() => window.__TAURI__?.window?.getCurrentWindow?.().toggleMaximize?.()}>▢</button>
              <button className="winbtn winbtn-close" title="Fermer" onClick={() => window.__TAURI__?.window?.getCurrentWindow?.().close?.()}>✕</button>
            </div>
          )}
        </div>
      </div>

      {/* Titre + fraîcheur des données */}
      <div className="hdr-headline" data-tauri-drag-region>
        <div className="hdr-left" data-tauri-drag-region>
          <h1 className="hdr-title">Welcome to the jungle, <span className="hdr-tagline">we take it day-by-day !</span></h1>
          <div className="hdr-page">{pageLabel || ""}</div>
        </div>
        <div className="src">{source ? `Source : ${source}` : "Chargement…"}<br />Données Jira au {when} <span className="hdr-build hdr-build-src" title="Version du code en ligne">BUILD stable-v123</span></div>
      </div>

      <div className="progress">
        <span>Avancement ({k["Terminé"] ?? 0} terminés sur {k.total ?? 0})</span>
        <span className="bar"><span style={{ width: `${k.avancement || 0}%` }} /></span>
        <b>{k.avancement || 0}&nbsp;%</b>
      </div>
    </header>
  );
}
