import React from "react";

// Accueil natif PWA — reproduction fidèle de la maquette validée.
// Toutes les props sont optionnelles (valeurs de repli) : le composant ne peut
// pas planter même si une donnée manque. La barre de navigation du bas n'est
// PAS incluse ici : l'app en fournit déjà une (cnav).
const nf = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " "));

export default function MobileHome({
  build = "stable",
  source = "Jira",
  verified = "",
  whenText = "",
  pct = 0,
  valides = 0,
  total = 0,
  dateLabel = "",
  notif = 0,
  radarCount = 0,
  alertCount = 0,
  warningText = "",
  avatarUri = "",
  onSearch, onRadar, onTeam, onRefresh, onSync, onAlerts, onCR, onImport, onAdmin, onMemo, onAvatar, onBell,
}) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div className="mh">
      <div className="wrap">
        {/* HEADER */}
        <div className="hd">
          <div>
            <div className="logo"><span className="cp">cp</span><span style={{ color: "#46506b" }}>|</span><span className="wire">WIRE</span></div>
            <div className="logo-sub">COCKPIT DE PILOTAGE</div>
          </div>
          <div className="hd-r">
            <button className="ava" onClick={onAvatar} aria-label="Hôtesse Natacha">
              {avatarUri ? <img src={avatarUri} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : null}
              <span className="ava-dot" />
            </button>
            <button className="bell" onClick={onBell} aria-label="Notifications">
              <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              {notif > 0 ? <span className="badge violet">{notif}</span> : null}
            </button>
          </div>
        </div>

        {/* SEARCH */}
        <button className="search" onClick={onSearch} aria-label="Rechercher" style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <span style={{ flex: 1, color: "#737e96", fontSize: 15 }}>Rechercher un ticket, une personne, un projet…</span>
          <svg className="sliders" viewBox="0 0 24 24" fill="none" stroke="#8a93a8" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="#0e1428" /><circle cx="15" cy="12" r="2" fill="#0e1428" /><circle cx="8" cy="18" r="2" fill="#0e1428" /></svg>
        </button>

        {/* QUICK ACTIONS */}
        <div className="qa">
          <button className="qa-t radar" onClick={onRadar}>
            {radarCount > 0 ? <span className="qa-b v">{radarCount}</span> : null}
            <span className="qa-ic"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="#2bd97f" strokeWidth="1.2" opacity=".5" /><circle cx="20" cy="20" r="10" fill="none" stroke="#2bd97f" strokeWidth="1" opacity=".4" /><path d="M20 20 L33 14 A14 14 0 0 1 20 34 Z" fill="#2bd97f" opacity=".18" /><circle cx="26" cy="16" r="1.6" fill="#ff8c1a" /><circle cx="16" cy="25" r="1.4" fill="#ff5c6a" /><circle cx="20" cy="20" r="2" fill="#2bd97f" /></svg></span>
            <span className="qa-l">Radar</span>
          </button>
          <button className="qa-t" onClick={onTeam}>
            <span className="qa-ic"><svg viewBox="0 0 40 40"><circle cx="15" cy="16" r="5" fill="#8b5cf6" /><circle cx="26" cy="16" r="5" fill="#6d5df6" /><path d="M6 31c0-5 4-8 9-8s9 3 9 8M19 31c0-5 4-8 9-8s6 3 6 8" fill="#8b5cf6" opacity=".85" /></svg></span>
            <span className="qa-l">Équipe</span>
          </button>
          <button className="qa-t" onClick={onRefresh}>
            <span className="qa-ic"><svg viewBox="0 0 40 40" fill="none" stroke="#4a90e2" strokeWidth="2.4" strokeLinecap="round"><path d="M31 16a13 13 0 0 0-22-4M9 12V6M9 12h6" /><path d="M9 24a13 13 0 0 0 22 4M31 28v6M31 28h-6" /></svg></span>
            <span className="qa-l">Actualiser</span>
          </button>
          <button className="qa-t" onClick={onSync}>
            <span className="qa-ic"><svg viewBox="0 0 40 40" fill="none" stroke="#ff8c1a" strokeWidth="2.4" strokeLinecap="round"><path d="M31 16a13 13 0 0 0-22-4M9 12V6M9 12h6" /><path d="M9 24a13 13 0 0 0 22 4M31 28v6M31 28h-6" /></svg></span>
            <span className="qa-l">Synchroniser</span>
          </button>
          <button className="qa-t" onClick={onAlerts}>
            {alertCount > 0 ? <span className="qa-b o">{alertCount}</span> : null}
            <span className="qa-ic"><svg viewBox="0 0 40 40" fill="#ffb020"><path d="M28 26c0-9-4-13-4-13a4 4 0 0 0-8 0s-4 4-4 13l-2 3h20zM17 31a3 3 0 0 0 6 0" /></svg></span>
            <span className="qa-l">Alertes</span>
          </button>
        </div>

        {/* PROGRESS */}
        <div className="prog">
          <div className="prog-top">
            <div className="prog-src">
              <svg className="pin" viewBox="0 0 24 24" fill="#2684ff"><path d="M12 2 2 12l10 10 4-4-6-6 6-6z" /></svg>
              <div>
                <div className="prog-h">Source : {source}</div>
                <div className="prog-sub">{verified ? <>{verified}<br /><br /></> : null}{whenText || ""}</div>
              </div>
            </div>
            <span className="build">BUILD {build}</span>
          </div>
          <div className="ring-wrap">
            <div className="particles" />
            <div className="ring" style={{ background: `conic-gradient(from 220deg, var(--green), #22d3ee ${Math.round(p * 0.3)}%, var(--violet) ${Math.round(p * 0.8)}%, rgba(255,255,255,.06) ${p}% 100%)` }} />
            <div className="ring-ctr"><div className="ring-n">{p}%</div><div className="ring-l">Complet</div></div>
          </div>
          <div className="adv">
            <div className="adv-l">Avancement</div>
            <div className="adv-row"><span className="adv-n">{nf(valides)} / {nf(total)}</span><span className="adv-p">{p} %</span></div>
            <div className="bar"><i style={{ width: `${p}%` }} /></div>
          </div>
        </div>

        {/* MÉMOIRE */}
        <div className="mem"><span className="d" />Mémoire persistante</div>

        {/* PENSE-BÊTE */}
        <button className="card memo" onClick={onMemo} style={{ width: "100%", textAlign: "left", cursor: onMemo ? "pointer" : "default" }}>
          <span className="memo-ic"><svg viewBox="0 0 24 24" fill="none" stroke="#2bd97f" strokeWidth="1.6"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z" /></svg></span>
          <span className="memo-tx"><b>Pense-bête :</b> importer la situation actuelle du SharePoint</span>
          <span className="memo-plus">+</span>
          <span className="memo-tx">les fichiers Excel des projets en cours</span>
          <svg className="memo-xls" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#1d3d2f" /><path d="M14 2v6h6" fill="#2bd97f" opacity=".5" /><text x="12" y="17" fontSize="7" fill="#2bd97f" textAnchor="middle" fontFamily="Arial" fontWeight="bold">X</text></svg>
        </button>

        {/* DUO */}
        <div className="duo">
          <button className="card act" onClick={onCR} style={{ textAlign: "left", cursor: "pointer" }}>
            <span className="act-ic violet"><svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h4" /></svg></span>
            <span className="act-tx"><span className="act-t">CR du jour</span><span className="act-s">Voir les comptes rendus</span></span>
            <span className="act-arrow">→</span>
          </button>
          <button className="card act" onClick={onImport} style={{ textAlign: "left", cursor: "pointer" }}>
            <span className="act-ic blue"><svg viewBox="0 0 24 24" fill="none" stroke="#4a90e2" strokeWidth="1.8"><path d="M7 18a4 4 0 0 1 0-8 6 6 0 0 1 11-2 4 4 0 0 1 1 8M12 12v7M9 15l3-3 3 3" /></svg></span>
            <span className="act-tx"><span className="act-t">Import sources</span><span className="act-s">Intégrer de nouvelles données</span></span>
            <span className="act-arrow">→</span>
          </button>
        </div>

        {/* ADMIN */}
        <button className="card full" onClick={onAdmin} style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
          <span className="act-ic teal"><svg viewBox="0 0 24 24" fill="none" stroke="#2bd97f" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 18c0-2 2-3.5 4-3.5s2.5 1 2.5 3.5" /></svg></span>
          <span className="act-tx"><span className="act-t">Admin &amp; accès</span><span className="act-s">Gérer les utilisateurs et les droits</span></span>
          <span className="act-arrow">→</span>
        </button>

        {/* WARNING */}
        {warningText ? (
          <div className="warn"><svg viewBox="0 0 24 24" fill="none" stroke="#ff8c1a" strokeWidth="1.8"><path d="M12 3 2 20h20L12 3zM12 9v5M12 17.5v.5" /></svg><div className="warn-tx">{warningText}</div><span className="warn-ch">›</span></div>
        ) : null}

        {/* JUNGLE */}
        <div className="jungle">
          <h3>Welcome to the jungle,<br />we take it <span className="by">day-by-day</span> <span className="day">!</span></h3>
          <div className="jd"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>Ton cockpit du {dateLabel}</div>
          <svg className="leaf" viewBox="0 0 160 150"><path d="M150 150C120 120 130 60 90 40c20 40 10 80 30 110z" fill="#3a2f6b" /><path d="M155 150C140 90 90 70 70 30c30 30 30 80 50 120z" fill="#4a3d82" /><path d="M120 150C110 100 60 90 55 50c25 25 20 70 35 100z" fill="#2e6b52" opacity=".8" /><path d="M145 150C160 110 140 70 150 50c-5 35 5 70-5 100z" fill="#c97b4a" opacity=".7" /></svg>
        </div>
      </div>
    </div>
  );
}
