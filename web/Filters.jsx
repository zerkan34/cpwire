import React, { useEffect, useState } from "react";
import { fetchProjets } from "../api.js";

const EUR = (n) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));
const METEO = { vert: "#1f8a5f", orange: "#e0600f", rouge: "#c0392b", neutre: "#b8b5c9" };
const ETAT_CLS = { "En cours": "pf-en", "Signé": "pf-si", "Propal envoyée": "pf-pr", "AVV Pipe": "pf-av", "Terminé": "pf-te" };
const frMonth = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); };

function Ring({ pct, color }) {
  const r = 17, c = 2 * Math.PI * r, off = c * (1 - (pct || 0));
  return (
    <svg className="pf-ring" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 22 22)" />
      <text x="22" y="23" textAnchor="middle" dominantBaseline="central" className="pf-ring-t">{Math.round((pct || 0) * 100)}%</text>
    </svg>
  );
}

function Card({ p }) {
  const color = METEO[p.meteo] || METEO.neutre;
  const period = (p.debut || p.fin) ? `${frMonth(p.debut) || "?"} → ${frMonth(p.fin) || "?"}` : "";
  return (
    <div className="pf-card">
      <div className="pf-card-top">
        <span className={`pf-etat ${ETAT_CLS[p.etat] || ""}`}>{p.etat}</span>
        <span className={`pf-type ${p.type === "TMA" ? "tma" : ""}`}>{p.type}</span>
        <span className="pf-meteo" style={{ background: color }} title={`Météo : ${p.meteo}`} />
      </div>
      <div className="pf-card-body">
        <Ring pct={p.avancement} color={p.meteo === "neutre" ? "var(--purple)" : color} />
        <div className="pf-card-h">
          <div className="pf-nom">{p.nom}</div>
          {p.perimetre ? <div className="pf-perim">{p.perimetre}</div> : null}
          <div className="pf-num">{p.num}{period ? ` · ${period}` : ""}</div>
        </div>
      </div>
      <div className="pf-fin">
        <div><span>Budgété</span><b>{EUR(p.budgete)}</b></div>
        <div><span>Facturé</span><b>{EUR(p.facture)}</b></div>
        <div><span>Reste à fact.</span><b className={p.reste < 0 ? "neg" : ""}>{EUR(p.reste)}</b></div>
      </div>
      {p.attention && p.attention.length > 0 ? (
        <ul className="pf-att">{p.attention.map((a, i) => <li key={i}>{a}</li>)}</ul>
      ) : null}
      {p.raf && p.raf.length > 0 ? (
        <ul className="pf-raf">{p.raf.map((a, i) => <li key={i}>{a}</li>)}</ul>
      ) : null}
      {p.comment ? <div className="pf-com">{p.comment}</div> : null}
    </div>
  );
}

function ClientBlock({ c }) {
  const j = c.jira || {};
  return (
    <section className="pf-client">
      <header className="pf-client-hd">
        <div className="pf-client-id">
          <h3>{c.client}</h3>
          <span className={`pf-type ${c.type === "TMA" ? "tma" : ""}`}>{c.type}</span>
        </div>
        <div className="pf-client-fin">
          <div><span>Budgété</span><b>{EUR(c.finances.budgete)}</b></div>
          <div><span>Facturé</span><b>{EUR(c.finances.facture)}</b></div>
          <div><span>J/H</span><b>{c.finances.jh || "—"}</b></div>
        </div>
        {j.present ? (
          <div className="pf-pulse">
            <span className="pf-chip">{j.total} tickets</span>
            {j.actifs > 0 ? <span className="pf-chip act">{j.actifs} actifs</span> : null}
            {j.recette > 0 ? <span className="pf-chip rec">{j.recette} en recette</span> : null}
            {j.retours > 0 ? <span className="pf-chip ret">{j.retours} retours</span> : null}
            {j.retard > 0 ? <span className="pf-chip late">{j.retard} en retard</span> : null}
          </div>
        ) : null}
      </header>
      {c.recette ? (
        <div className="pf-recette" title="Avancement réel de la recette, calculé depuis le référentiel + Jira">
          <span className="pf-recette-lb">Recette · données réelles</span>
          <div className="pf-recette-bar"><div style={{ width: `${c.recette.pct}%` }} /></div>
          <span className="pf-recette-pct">{c.recette.pct}%</span>
          <span className="pf-recette-meta">{c.recette.nbProgrammes} programmes{c.recette.retours ? ` · ${c.recette.retours} en retour` : ""}</span>
        </div>
      ) : null}
      <div className="pf-grid">{c.projets.map((p, i) => <Card key={i} p={p} />)}</div>
    </section>
  );
}

export default function Projets() {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true; setLoading(true); setErr("");
    fetchProjets().then((r) => { if (alive) setD(r); }).catch((e) => { if (alive) setErr(e.message || "Erreur"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  if (loading) return <div className="empty">Chargement du portefeuille…</div>;
  if (err) return <div className="empty">Suivi de projets indisponible : {err}</div>;
  if (!d) return null;
  const k = d.kpis;
  const KPIS = [
    ["Budget total", EUR(k.budgete), "i"], ["Facturé", EUR(k.facture), "g"], ["Reste à facturer", EUR(k.reste), "o"],
    ["J/H vendus", k.jh, "i"], ["Projets actifs", k.actifs, "g"], ["Clients", k.nbClients, "o"],
  ];
  return (
    <div className="pf-wrap">
      <div className="pf-hero">
        <div>
          <h2>Suivi de projets</h2>
          <p>Portefeuille Armonie — enrichi en temps réel par Jira</p>
        </div>
      </div>
      <div className="pf-kpis">
        {KPIS.map(([l, v, t]) => (
          <div className={`pf-kpi t-${t}`} key={l}><div className="pf-kpi-v">{v}</div><div className="pf-kpi-l">{l}</div></div>
        ))}
      </div>
      <div className="pf-pipe">
        {d.pipeline.map((s) => (
          <div key={s.etat} className={`pf-pipe-seg ${ETAT_CLS[s.etat] || ""}`}>
            <b>{s.n}</b><span>{s.etat}</span><i>{s.montant ? EUR(s.montant) : "\u00a0"}</i>
          </div>
        ))}
      </div>
      {d.clients.map((c) => <ClientBlock key={c.client} c={c} />)}
      <p className="pf-foot">Couche commerciale éditable, confrontée aux tickets Jira en direct{d.majSource ? ` · ${d.majSource}` : ""}.</p>
    </div>
  );
}
