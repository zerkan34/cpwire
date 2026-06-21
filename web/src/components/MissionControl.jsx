import React, { useEffect, useMemo, useState } from "react";
import { fetchHygiene, fetchSla, fetchCadence } from "../api.js";
import AircraftGauge from "./AircraftGauge.jsx";
import AttentionRequise from "./AttentionRequise.jsx";
import Portfolio from "./Portfolio.jsx";
import { computeAttention, computeSouffrance, detectDevsSurcharges } from "../attention.js";

// ============================================================================
// Mission Control — l'Accueil mobile « cockpit ». Affiché UNIQUEMENT sur mobile
// (App choisit ce composant en deçà de 768px ; le desktop garde l'ancien Home).
// Tous les nombres viennent de données réelles : facts (Jira) + hygiène. Aucun
// chiffre n'est inventé.
// ============================================================================

const nf = (n) => (n ?? 0).toLocaleString("fr-FR");
const STATUT_TONE = { "Terminé": "green", "En cours": "blue", "À faire": "slate", "Bloqué": "red" };

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d)) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// ---- petites icônes (cohérentes, nettes) ----
const IC = {
  encours: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" /></svg>,
  recette: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>,
  retard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M5 3L2.5 5.5M19 3l2.5 2.5" /></svg>,
  anomalies: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></svg>,
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>,
};

function Ring({ done, total, pct }) {
  const R = 74, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="mc-ring">
      <svg viewBox="0 0 170 170" className="mc-ring-svg" aria-hidden="true">
        <defs>
          <linearGradient id="mcRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff7a00" />
            <stop offset="1" stopColor="#ffb347" />
          </linearGradient>
        </defs>
        <circle cx="85" cy="85" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" />
        <circle cx="85" cy="85" r={R} fill="none" stroke="url(#mcRingGrad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 85 85)" className="mc-ring-prog" />
      </svg>
      <div className="mc-ring-ctr">
        <div className="mc-ring-n">{nf(done)}</div>
        <div className="mc-ring-sub">terminés sur {nf(total)}</div>
        <div className="mc-ring-pct">{pct}%</div>
      </div>
    </div>
  );
}

export default function MissionControl({ facts, issues = [], role, engagement = {}, onOpen, onOpen360, can360, onTicket, importedTotal, build }) {
  const g = facts?.global || {};
  const [hygiene, setHygiene] = useState(null);
  const [sla, setSla] = useState(null);
  const [cadence, setCadence] = useState(null);

  useEffect(() => {
    let on = true;
    fetchHygiene().then((r) => { if (on) setHygiene(r); }).catch(() => { if (on) setHygiene(null); });
    fetchSla().then((r) => { if (on) setSla(r); }).catch(() => { if (on) setSla(null); });
    fetchCadence().then((r) => { if (on) setCadence(r); }).catch(() => { if (on) setCadence(null); });
    return () => { on = false; };
  }, []);

  const anomalies = hygiene?.global?.aCorriger ?? null;
  const seuilSouff = cadence?.seuilSouffranceJours ?? 21;
  const souffrance = useMemo(() => computeSouffrance(issues, seuilSouff), [issues, seuilSouff]);
  const team = useMemo(() => detectDevsSurcharges(cadence), [cadence]);
  const attention = useMemo(() => computeAttention(facts, { hygiene, sla, souffrance }), [facts, hygiene, sla, souffrance]);
  const attnMap = useMemo(() => Object.fromEntries(attention.map((r) => [r.dossier, r])), [attention]);

  const kpis = [
    { key: "encours", n: g.cats?.encours || 0, label: "En cours", tone: "blue" },
    { key: "recette", n: g.enRecette || 0, label: "En recette", tone: "purple" },
    { key: "retard", n: g.enRetard || 0, label: "En retard", tone: "red" },
    { key: "anomalies", n: anomalies, label: "Anomalies", tone: "orange" },
  ];

  const prios = useMemo(() => {
    const arr = [];
    for (const [d, f] of Object.entries(facts?.byDossier || {})) {
      if (f.enRetard > 0) arr.push({ d, kind: "retard", n: f.enRetard, txt: `${f.enRetard} ticket${f.enRetard > 1 ? "s" : ""} en retard`, sev: 3 });
      else if (f.retours > 0) arr.push({ d, kind: "retours", n: f.retours, txt: `${f.retours} retour${f.retours > 1 ? "s" : ""} à retravailler`, sev: 2 });
    }
    arr.sort((a, b) => b.sev - a.sev || b.n - a.n);
    return arr.slice(0, 4);
  }, [facts]);

  const activite = useMemo(() => {
    return [...(issues || [])].filter((i) => i.maj).sort((a, b) => new Date(b.maj) - new Date(a.maj)).slice(0, 5);
  }, [issues]);

  const dateLabel = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const imported = importedTotal || g.total || 0;

  return (
    <div className="mc">
      <AttentionRequise facts={facts} rows={attention} team={team} onOpen360={onOpen360} can360={can360} />

      {/* ---- Hero ---- */}
      <div className="mc-hero">
        <div className="mc-radar" aria-hidden="true" />
        <h1 className="mc-h1">Welcome to the jungle,</h1>
        <p className="mc-h2"><span>We take it</span> <em>day-by-day !</em></p>
        <p className="mc-date">Ton cockpit du {dateLabel}</p>
      </div>

      {/* ---- Mission Control ---- */}
      <section className="mc-card">
        <div className="mc-card-main">
          <AircraftGauge pct={g.pct || 0} value={g.valides || 0} total={g.total || 0} />
          <div className="mc-kpis">
            {kpis.map((k) => (
              <div key={k.key} className={`mc-kpi t-${k.tone}`}>
                <span className="mc-kpi-ic">{IC[k.key]}</span>
                <span className="mc-kpi-n">{k.n == null ? "…" : nf(k.n)}</span>
                <span className="mc-kpi-lb">{k.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mc-sysbar">
          <span>↧ {nf(imported)} tickets importés</span>
          <span className="mc-sysbar-sep" />
          <span>⛨ Build {build || "stable"}</span>
        </div>
      </section>

      {/* ---- Portefeuille (par client — mêmes cartes que le desktop) ---- */}
      <section className="mc-sec">
        <div className="mc-sec-hd"><h2>Par dossier</h2></div>
        <Portfolio facts={facts} engagement={engagement} attention={attnMap}
          onOpen={onOpen || onOpen360} onOpen360={onOpen360} can360={can360} />
      </section>
    </div>
  );
}
