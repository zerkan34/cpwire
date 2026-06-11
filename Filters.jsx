import React from "react";

function Kpi({ lbl, val, cls }) {
  return (
    <div className={`kpi ${cls || ""}`}>
      <div className="lbl">{lbl}</div>
      <div className="val">{val ?? "—"}</div>
    </div>
  );
}

export default function Header({ kpis, source, generatedAt, loading, me, onRefresh, onLogout }) {
  const k = kpis || {};
  const when = generatedAt ? new Date(generatedAt).toLocaleString("fr-FR") : "—";
  return (
    <header className="hdr">
      <div className="hdr-row">
        <div>
          <img src="/cpwire-logo.png" alt="CPwire" className="hdr-logo" />
          <div className="eyebrow">Cockpit de pilotage</div>
          <h1>Ce qu'il reste à faire &amp; ce qui avance</h1>
        </div>
        <div className="hdr-actions">
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn gold" onClick={onRefresh} disabled={loading}>
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
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
