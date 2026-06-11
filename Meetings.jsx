import React, { useEffect, useState } from "react";

function Kpi({ lbl, val, cls }) {
  return (
    <div className={`kpi ${cls || ""}`}>
      <div className="lbl">{lbl}</div>
      <div className="val">{val ?? "—"}</div>
    </div>
  );
}

export default function Header({ kpis, source, generatedAt, loading, me, onRefresh, onLogout, query, onQuery, notifOn, onToggleNotif, notifCount = 0 }) {
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
            {onToggleNotif && (
              <button className={`btn bell ${notifOn ? "on" : "ghost"}`} onClick={onToggleNotif}
                title={notifOn ? "Notifications activées (actualisation auto). Clic pour acquitter / couper." : "Activer les notifications + actualisation auto"}>
                {notifOn ? "🔔" : "🔕"}
                {notifCount > 0 && <span className="bell-badge">{notifCount > 99 ? "99+" : notifCount}</span>}
              </button>
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
