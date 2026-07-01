import React, { useEffect, useMemo, useState } from "react";
import { fetchHygiene, fetchSla, fetchCadence, fetchRisk, fetchDigest, fetchDeadlines } from "../api.js";
import { computeAttention, computeSouffrance, SEV } from "../attention.js";
import Donut3D from "./Donut3D.jsx";
import PortfolioList from "./PortfolioList.jsx";

// ============================================================================
//  Accueil — refonte éditoriale (charte Armonie).
//   • Hero : salutation + statistiques clés + camembert 3D d'avancement global.
//   • Colonne gauche : portefeuille en LISTE, trié par risque.
//   • Colonne droite : Point du soir (digest) + Échéances (frise).
//  Tout lit la MÊME donnée réelle (computeFacts / endpoints). Zéro invention.
// ============================================================================
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export default function Home({ facts, issues = [], role, engagement = {}, onOpen, onOpen360, can360, onTicket, onDev, deletedDevs, changedKeys }) {
  const [hygiene, setHygiene] = useState(null);
  const [sla, setSla] = useState(null);
  const [cadence, setCadence] = useState(null);
  const [risk, setRisk] = useState(null);
  const [digest, setDigest] = useState(null);
  const [radar, setRadar] = useState(null);
  useEffect(() => {
    let on = true;
    fetchHygiene().then((r) => { if (on) setHygiene(r); }).catch(() => { if (on) setHygiene(null); });
    fetchSla().then((r) => { if (on) setSla(r); }).catch(() => { if (on) setSla(null); });
    fetchCadence().then((r) => { if (on) setCadence(r); }).catch(() => { if (on) setCadence(null); });
    fetchRisk().then((r) => { if (on) setRisk(r); }).catch(() => { if (on) setRisk(null); });
    fetchDigest().then((r) => { if (on) setDigest(r && r.digest ? r.digest : null); }).catch(() => { if (on) setDigest(null); });
    fetchDeadlines().then((r) => { if (on) setRadar(r && r.radar ? r.radar : []); }).catch(() => { if (on) setRadar([]); });
    return () => { on = false; };
  }, []);

  const riskMap = useMemo(() => {
    const m = {};
    for (const d of (risk?.dossiers || [])) if (d.score > 0) m[norm(d.dossier)] = d;
    return m;
  }, [risk]);

  const seuilSouff = cadence?.seuilSouffranceJours ?? 21;
  const souffrance = useMemo(() => computeSouffrance(issues, seuilSouff), [issues, seuilSouff]);
  const attention = useMemo(() => computeAttention(facts, { hygiene, sla, souffrance }), [facts, hygiene, sla, souffrance]);

  const g = facts?.global || {};
  const byDossier = facts?.byDossier || {};
  const nbClients = Object.keys(byDossier).length;
  const flagged = attention.filter((r) => r.severity !== SEV.CONTROLE).length;
  const name = role === "owner" ? " Nikko" : "";

  // Tri du portefeuille : risque décroissant, puis reste à traiter.
  const entries = useMemo(() => Object.entries(byDossier).sort((a, b) => {
    const ra = riskMap[norm(a[0])]?.score || 0, rb = riskMap[norm(b[0])]?.score || 0;
    if (rb !== ra) return rb - ra;
    return (b[1].reste || 0) - (a[1].reste || 0);
  }), [byDossier, riskMap]);

  // Camembert d'avancement global (données réelles).
  const donutSegs = [
    { label: "Terminé / mis en prod", value: g.valides || 0, top: "#BFA168", side: "#8A6E37", lc: "#2E2A5D" },
    { label: "En cours / recette", value: (g.actifsDev || 0) + (g.enRecette || 0) + (g.retours || 0), top: "#4B3F8F", side: "#322A63", lc: "#fff" },
    { label: "À faire", value: (g.cats && g.cats.afaire) || 0, top: "#2E2A5D", side: "#231F4A", lc: "#fff" },
  ];
  const slaWatch = (sla?.alerts?.length || 0);

  // Échéances pour la frise : les plus proches d'abord (retard → mois).
  const frise = useMemo(() => {
    const ok = new Set(["retard", "semaine", "mois"]);
    return (radar || []).filter((r) => ok.has(r.statut))
      .sort((a, b) => (a.joursRestants ?? 9999) - (b.joursRestants ?? 9999)).slice(0, 4);
  }, [radar]);
  const friseWhen = (r) => r.joursRestants == null ? "" : r.joursRestants < 0 ? `en retard ${-r.joursRestants} j` : r.joursRestants === 0 ? "aujourd'hui" : `dans ${r.joursRestants} j`;

  return (
    <div className="eh">
      {/* ---- HERO ---- */}
      <div className="eh-hero">
        <div className="eh-hero-l">
          <div className="eh-kick">COCKPIT · PORTEFEUILLE</div>
          <h1 className="eh-title">{greeting()}{name}.</h1>
          <div className="eh-rule" />
          <div className="eh-sub">{cap(DATE_FMT.format(new Date()))} · {nbClients} dossier{nbClients > 1 ? "s" : ""} actif{nbClients > 1 ? "s" : ""} · {flagged ? `${flagged} à voir` : "tout est sous contrôle"}.</div>
          <div className="eh-stats">
            <div className="eh-stat"><b>{g.total || 0}</b><span>tickets suivis</span></div>
            <div className="eh-stat"><b>{g.pct || 0} %</b><span>terminés</span></div>
            <div className="eh-stat"><b>{slaWatch}</b><span>SLA à surveiller</span></div>
          </div>
        </div>
        <div className="eh-hero-r">
          <Donut3D segs={donutSegs} scale={1.7} caption={`Avancement global — ${g.total || 0} tickets`} />
        </div>
      </div>

      {/* ---- CORPS 2 COLONNES ---- */}
      <div className="eh-cols">
        <div className="eh-main">
          <div className="section-title"><span className="eh-sq" />Par dossier <span className="eh-hint">trié par risque</span></div>
          <PortfolioList entries={entries} risk={riskMap} engagement={engagement} attention={Object.fromEntries(attention.map((r) => [r.dossier, r]))} onOpen={onOpen} onOpen360={onOpen360} can360={can360} />
        </div>

        <aside className="eh-side">
          {/* Point du soir */}
          <div className="section-title"><span className="eh-sq" />Point du soir</div>
          <div className="panel eh-card">
            {digest ? (
              <ul className="eh-digest">
                <li><i className="d-navy" /><b>{digest.mouvements?.total ?? 0}</b> mouvements aujourd'hui</li>
                <li><i className="d-orange" /><b>{digest.regressions?.length ?? 0}</b> retour{(digest.regressions?.length ?? 0) > 1 ? "s" : ""} en arrière</li>
                <li><i className="d-orange" /><b>{digest.sla?.depasses ?? 0}</b> SLA dépassé{(digest.sla?.depasses ?? 0) > 1 ? "s" : ""}</li>
                <li><i className="d-gold" /><b>{digest.gti?.depasses ?? 0}</b> prise en charge (GTI) dépassée</li>
              </ul>
            ) : <div className="eh-muted">Digest indisponible.</div>}
          </div>

          {/* Échéances — frise */}
          <div className="section-title"><span className="eh-sq" />Échéances</div>
          <div className="eh-frise">
            {frise.length ? frise.map((r, i) => (
              <div className="eh-fr" key={i}>
                {i > 0 ? <div className="eh-fr-cn" /> : null}
                <div className={`eh-fr-pill ${r.statut === "retard" ? "key" : ""}`}>
                  <div className="eh-fr-l">{r.label || "échéance"}</div>
                  <div className="eh-fr-w">{r.dossier ? `${r.dossier} · ` : ""}{friseWhen(r)}</div>
                </div>
              </div>
            )) : <div className="panel eh-card"><div className="eh-muted">Aucune échéance datée à venir.</div></div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
