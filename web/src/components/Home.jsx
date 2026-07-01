import React, { useEffect, useMemo, useState } from "react";
import { fetchHygiene, fetchSla, fetchCadence, fetchDeadlines } from "../api.js";
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
function relatif(j) {
  if (j < 0) return `en retard de ${-j} j`;
  if (j === 0) return "aujourd'hui";
  if (j === 1) return "demain";
  return `dans ${j} j`;
}

export default function Home({ facts, issues = [], role, engagement = {}, onOpen, onOpen360, can360, onTicket, onDev, deletedDevs, changedKeys }) {
  const [hygiene, setHygiene] = useState(null);
  const [sla, setSla] = useState(null);
  const [cadence, setCadence] = useState(null);
  const [radar, setRadar] = useState(null);
  const [radarOpen, setRadarOpen] = useState(false);
  const [deduiteInfo, setDeduiteInfo] = useState(null); // clé "dossier|date" dont l'explication est ouverte
  useEffect(() => {
    let on = true;
    fetchHygiene().then((r) => { if (on) setHygiene(r); }).catch(() => { if (on) setHygiene(null); });
    fetchSla().then((r) => { if (on) setSla(r); }).catch(() => { if (on) setSla(null); });
    fetchCadence().then((r) => { if (on) setCadence(r); }).catch(() => { if (on) setCadence(null); });
    fetchDeadlines().then((r) => { if (on) setRadar(r.radar || []); }).catch(() => { if (on) setRadar([]); });
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

      {/* 1bis — Radar des échéances : ce qui a été écrit (fiches + mémoire), jamais rassemblé
          nulle part ailleurs. Zéro invention — extraction déterministe (voir deadlines.js).
          Silencieux si rien à montrer (chargement ou aucune échéance détectée). */}
      {radar && radar.length > 0 && (() => {
        const urgent = radar.filter((r) => r.statut === "retard" || r.statut === "semaine");
        const lointain = radar.filter((r) => r.statut === "mois" || r.statut === "plus_tard");
        // Une divergence reste visible même repliée : un désaccord entre sources est une
        // alerte de fiabilité des données, pas une question d'urgence de date.
        const list = radarOpen ? radar : [...urgent, ...lointain.filter((r) => r.divergence)];
        if (!list.length) return null;
        const fmtD = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return iso; } };
        const cleDe = (r) => `${r.dossier}|${r.date}`; // ancre stable pour sauter d'une ligne à l'autre
        const ouvrir = (d) => { if (onOpen) onOpen(d); else if (onOpen360) onOpen360(d); }; // jamais de clic mort
        const sauterVers = (dossier, date) => {
          const el = document.querySelector(`[data-radar-cle="${dossier}|${date}"]`);
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("radar-flash");
          setTimeout(() => el.classList.remove("radar-flash"), 1600);
        };
        return (
          <div className="panel radar-panel">
            <div className="radar-hd">
              <span className="radar-title">🧭 Ce qui a une date, quelque part</span>
              <span className="radar-sub">Extrait de vos fiches dossiers et de la mémoire d'équipe — une seule ligne par échéance, même redite à plusieurs endroits.</span>
            </div>
            <ul className="radar-list">
              {list.map((r, i) => (
                <li key={i} data-radar-cle={cleDe(r)} className={`radar-item radar-${r.statut} ${r.divergence ? "radar-divergent" : ""}`}>
                  <div className="radar-row">
                    <button type="button" className="radar-dossier" onClick={() => ouvrir(r.dossier)} title={`Ouvrir la fiche ${r.dossier}`}>{r.dossier}</button>
                    <button type="button" className="radar-label" onClick={() => ouvrir(r.dossier)} title="Voir le détail chez ce client">{r.label}</button>
                    <span className="radar-when">
                      {relatif(r.joursRestants)}
                      {r.yearInferred && (
                        <button type="button" className="radar-inf" onClick={() => setDeduiteInfo((v) => (v === cleDe(r) ? null : cleDe(r)))} title="Pourquoi cette année ?">
                          {" "}· année déduite ⓘ
                        </button>
                      )}
                    </span>
                  </div>
                  {deduiteInfo === cleDe(r) && (
                    <div className="radar-info">
                      Aucune année n'était écrite à côté de cette date. cp|WIRE l'a déduite du contexte (une autre date proche portant une année explicite, ou l'année en cours si la date était trop ancienne) — <button type="button" className="radar-linklike" onClick={() => ouvrir(r.dossier)}>vérifier dans la fiche</button>.
                    </div>
                  )}
                  <div className="radar-meta">
                    {r.sources.length > 1 ? (
                      <span className="radar-confirm">✓ confirmé par {r.sources.length} sources :{" "}
                        {r.sources.map((s, j) => (
                          <button type="button" key={s} className="radar-srcbtn" onClick={() => ouvrir(r.dossier)} title={`Voir la source « ${s} » chez ${r.dossier}`}>{s}{j < r.sources.length - 1 ? "," : ""}</button>
                        ))}
                      </span>
                    ) : (
                      <button type="button" className="radar-srcbtn radar-src" onClick={() => ouvrir(r.dossier)} title={`Voir la source « ${r.sources[0]} » chez ${r.dossier}`}>source : {r.sources[0]}</button>
                    )}
                  </div>
                  {r.divergence && (
                    <div className="radar-warn">
                      ⚠️ Des sources se contredisent : {r.sources.join("/")} dit {fmtD(r.date)}
                      {r.divergence.map((d, j) => (
                        <span key={j}> · une autre mention dit{" "}
                          <button type="button" className="radar-linklike" onClick={() => sauterVers(r.dossier, d.date)} title="Voir cette autre mention dans la liste">
                            <b>{fmtD(d.date)}</b> ({d.label})
                          </button>
                        </span>
                      ))}
                      {" "}— à vérifier, aucun choix automatique n'a été fait.
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {lointain.filter((r) => !r.divergence).length > 0 && (
              <button type="button" className="radar-more" onClick={() => setRadarOpen((v) => !v)}>
                {radarOpen ? "▾ Masquer les échéances plus lointaines" : `▸ ${lointain.filter((r) => !r.divergence).length} échéance${lointain.length > 1 ? "s" : ""} plus lointaine${lointain.length > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        );
      })()}

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
        <div className="avc-srcline">source : Jira — en temps réel (à l'import)</div>
      </div>

      {/* 3 — Portefeuille */}
      <div className="section-title"><span>Par dossier</span></div>
      <Portfolio facts={facts} engagement={engagement} attention={attnMap} onOpen={onOpen} onOpen360={onOpen360} can360={can360} onTicket={onTicket} />
    </div>
  );
}
