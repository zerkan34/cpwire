import React, { useEffect, useMemo, useState } from "react";
import { fetchHygiene, fetchSla, fetchCadence } from "../api.js";
import { computeAttention, computeSouffrance, SEV } from "../attention.js";
import Portfolio from "./Portfolio.jsx";

// ============================================================================
//  Accueil = PILOTAGE. 4 sections, dans l'ordre, sans doublon :
//   1) Contexte (1 ligne : salutation, date, nb clients, verdict)
//   2) Attention requise (quels clients ont besoin de moi — le moteur)
//   3) Avancement global (où en est-on — 1 bande compacte)
//   4) Portefeuille (clients triés par santé)
//  Tout lit la MÊME donnée (computeFacts). L'attention est calculée UNE fois
//  ici puis distribuée à la section Attention et aux cartes (même verdict).
// ============================================================================
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Home({ facts, issues = [], role, engagement = {}, onOpen, onOpen360, can360, onTicket, onDev, deletedDevs, changedKeys }) {
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

  const seuilSouff = cadence?.seuilSouffranceJours ?? 21;
  const souffrance = useMemo(() => computeSouffrance(issues, seuilSouff), [issues, seuilSouff]);
  const attention = useMemo(() => computeAttention(facts, { hygiene, sla, souffrance }), [facts, hygiene, sla, souffrance]);
  const attnMap = useMemo(() => Object.fromEntries(attention.map((r) => [r.dossier, r])), [attention]);

  const g = facts?.global || {};
  const byDossier = facts?.byDossier || {};
  const nbClients = Object.keys(byDossier).length;
  const flagged = attention.filter((r) => r.severity !== SEV.CONTROLE).length;
  const changed = changedKeys && changedKeys.size ? changedKeys.size : 0;
  const name = role === "owner" ? " Nikko" : "";

  // Avancement par famille d'engagement (TMA / Projet), agrégé depuis byDossier.
  const fams = useMemo(() => {
    const acc = { TMA: { t: 0, v: 0 }, Projet: { t: 0, v: 0 }, Mixte: { t: 0, v: 0 } };
    for (const [d, f] of Object.entries(byDossier)) {
      const e = acc[engagement[d]] ? engagement[d] : "Mixte";
      acc[e].t += f.total || 0; acc[e].v += f.valides || 0;
    }
    return acc;
  }, [byDossier, engagement]);
  const famPct = (x) => (x.t > 0 ? Math.round((x.v / x.t) * 100) : null);

  return (
    <div className="home-wrap">
      {/* 1 — Contexte */}
      <div className="ctx-bar">
        <div className="ctx-left">
          <span className="ctx-greet">{greeting()}{name}.</span>
          <span className="ctx-date">{cap(DATE_FMT.format(new Date()))}</span>
        </div>
        <div className="ctx-right">
          <span className="ctx-meta">{nbClients} client{nbClients > 1 ? "s" : ""}</span>
          {changed > 0 ? <span className="ctx-meta">↻ {changed} ont bougé</span> : null}
          <span className={`ctx-verdict ${flagged ? "warn" : "ok"}`}>
            {flagged ? `${flagged} client${flagged > 1 ? "s" : ""} à voir` : "Tout est sous contrôle"}
          </span>
        </div>
      </div>

      {/* 2 — Avancement global */}
      <div className="section-title"><span>Avancement global</span></div>
      <div className="panel avc">
        <div className="avc-top">
          <div className="avc-pct">{g.pct || 0}<small>%</small></div>
          <div className="avc-stats">
            <div className="avc-stat done"><b>{g.valides || 0}</b><span>fait</span></div>
            <div className="avc-stat"><b>{g.reste || 0}</b><span>reste</span></div>
            <div className="avc-stat"><b>{g.total || 0}</b><span>total</span></div>
          </div>
        </div>
        <div className="avc-bar"><span style={{ width: `${g.pct || 0}%` }} /></div>
        <div className="avc-split">
          {famPct(fams.TMA) != null ? <span className="avc-fam"><i className="tma" />TMA — {famPct(fams.TMA)}% · {fams.TMA.t} tickets</span> : null}
          {famPct(fams.Projet) != null ? <span className="avc-fam"><i className="prj" />Projet — {famPct(fams.Projet)}% · {fams.Projet.t} tickets</span> : null}
          {famPct(fams.Mixte) != null ? <span className="avc-fam"><i className="mix" />Mixte — {famPct(fams.Mixte)}% · {fams.Mixte.t} tickets</span> : null}
        </div>
      </div>

      {/* 3 — Portefeuille */}
      <div className="section-title"><span>Par dossier</span></div>
      <Portfolio facts={facts} engagement={engagement} attention={attnMap} onOpen={onOpen} onOpen360={onOpen360} can360={can360} onTicket={onTicket} />
    </div>
  );
}
