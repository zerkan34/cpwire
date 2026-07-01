import React, { useState, useMemo, useEffect } from "react";
import { PILOT_DATA_URI } from "../pilot.js";
import { blockerSince, exportServerPdf } from "../api.js";
import { buildBlockersDocFromPoints, buildBlockersPayload } from "../blockersDoc.js";
import { printHtml } from "../utils.js";
import BlockerAnalysis from "./BlockerAnalysis.jsx";

/* cp|WIRE — MASTER WARNING : voyant cockpit des points bloquants.
   Bouton = un RADAR vert qui balaie (sweep rotatif) ; des blips ROUGES pulsent
   dedans quand il y a du GRAVE (severity critique). Au clic : MODALE CENTRÉE
   avec filtres (client, dev, recherche) et tri (gravité, date, ticket, client,
   dev). Clic sur une ligne = ouverture du ticket (TicketModal = diagnostic).
   Points issus de computeBlockers(issues) — mêmes tickets que le point du soir. */

const RED = "var(--red)", REDV = "#E5392B", AMBER = "var(--amber)", GOLD = "var(--gold)",
      NAVY = "var(--indigo)", INDIGO = "var(--indigo)", INK = "var(--ink)", MUTED = "var(--muted)",
      SOFT = "var(--purple-soft)", LINE = "var(--line)";

// Code couleur engagement, unifié avec theme.css (.eng-badge) : TMA = vert, Projet = orange clair.
const ENG = {
  TMA:    { bg: "#e2f3ea", fg: "#1f8a5f", ln: "#bfe3d0" },
  Projet: { bg: "#fff2e7", fg: "#e0600f", ln: "#f0d2b0" },
};
const engStyle = (e) => ENG[e] || null;

const SORTS = [
  { v: "move", l: "Mouvement récent" },
  { v: "created", l: "Mise en place récente" },
  { v: "gravite", l: "Gravité" },
  { v: "date", l: "Ancienneté dans l'état" },
  { v: "ticket", l: "Ticket" },
  { v: "client", l: "Client" },
  { v: "dev", l: "Développeur" },
];

// Positions des blips dans le radar (en %, dans le rayon utile).
const BLIPS = [
  { t: "30%", l: "60%" }, { t: "40%", l: "32%" }, { t: "58%", l: "66%" },
  { t: "66%", l: "44%" }, { t: "36%", l: "48%" }, { t: "54%", l: "26%" },
];

// Date courte FR pour « depuis le … » (date d'entrée dans l'état).
function fmtD(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Jours ouvrés écoulés depuis une date ISO (week-ends exclus) — pour le « (N j) ».
function joursOuvres(iso, now = new Date()) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d)) return 0;
  let n = 0; const cur = new Date(d);
  while (cur < now) { cur.setDate(cur.getDate() + 1); const wd = cur.getDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}

// Au-delà de ce nombre de jours SANS MOUVEMENT (dernière MAJ), un ticket est considéré « dormant »
// (probablement obsolète) : on le masque par défaut du voyant et de l'export.
const OBSOLETE_DAYS = 180;
const daysCal = (iso) => { if (!iso) return 0; const d = new Date(iso); return isNaN(d) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000); };
const timeOf = (iso) => { const d = new Date(iso || 0); return isNaN(d) ? 0 : d.getTime(); };

// Date EXACTE d'entrée dans l'état bloquant, selon le type de point :
//   • retard  -> l'échéance (déjà dans p.since) ;
//   • bloque  -> pose du drapeau (flaggedAt), sinon entrée dans le statut courant ;
//   • autres  -> entrée dans le statut courant (enteredStatusAt).
// Repli systématique sur p.since (date approximative) si le changelog n'a rien donné.
function preciseSince(p, sinceMap) {
  if (p.kind === "retard") return p.since;
  const s = sinceMap[p.id];
  if (!s) return p.since;
  if (p.kind === "bloque") return s.flaggedAt || s.enteredStatusAt || p.since;
  return s.enteredStatusAt || p.since;
}

// Verbe limpide : « depuis quand l'a-t-on mis dans cet état ? »
function sinceLabel(kind) {
  switch (kind) {
    case "retard": return "échéance dépassée le";
    case "bloque": return "signalé bloquant le";
    case "retourProd": return "passé en retour prod le";
    case "retourTest": return "passé en retour test le";
    case "afaire": return "en « À faire » depuis le";
    default: return "dans cet état depuis le";
  }
}

export default function MasterWarning({ points = [], onOpenTicket, onOpen360, onDev }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [dev, setDev] = useState("");
  const [sort, setSort] = useState("move");
  const [sinceMap, setSinceMap] = useState({});
  const [analysis, setAnalysis] = useState(null); // { ticket, point } -> modal d'analyse
  const [showDormant, setShowDormant] = useState(false); // afficher les tickets dormants (>180 j sans mouvement)
  const [maxed, setMaxed] = useState(false);             // plein écran
  const [statsHidden, setStatsHidden] = useState(false); // masquage des stats au défilement
  const lastScrollY = React.useRef(0);

  const n = points.filter((p) => p.severity === "critique").length; // graves
  const armed = n > 0;
  const dots = Math.min(n, BLIPS.length);

  const clients = useMemo(() => [...new Set(points.map((p) => p.project).filter(Boolean))].sort(), [points]);
  const devs = useMemo(() => [...new Set(points.map((p) => p.assignee).filter(Boolean))].sort(), [points]);

  // À l'ouverture du voyant : lecture dans le changelog de la date EXACTE d'entrée dans l'état
  // (transition de statut / pose du drapeau), bornée aux points affichés. Les « en retard » n'ont
  // pas besoin du serveur (la date = l'échéance). Cache serveur -> rouvrir est instantané.
  useEffect(() => {
    if (!open) return;
    const tickets = points
      .filter((p) => p.kind && p.kind !== "retard")
      .map((p) => ({ cle: p.id, maj: p.maj || null }));
    if (!tickets.length) return;
    let alive = true;
    blockerSince(tickets)
      .then((r) => { if (alive && r && r.since) setSinceMap((m) => ({ ...m, ...r.since })); })
      .catch(() => { /* repli sur la date approximative */ });
    return () => { alive = false; };
  }, [open, points]);

  // Points enrichis : date précise d'entrée dans l'état, ancienneté, et dormance (sans mouvement).
  const enriched = useMemo(
    () => points.map((p) => {
      const _since = preciseSince(p, sinceMap);
      const _moveDays = daysCal(p.maj);
      return { ...p, _since, _days: joursOuvres(_since), _moveDays, _obsolete: _moveDays > OBSOLETE_DAYS };
    }),
    [points, sinceMap]
  );

  const dormantCount = useMemo(() => enriched.filter((p) => p._obsolete).length, [enriched]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = enriched.filter((p) => {
      if (!showDormant && p._obsolete) return false;       // dormants masqués par défaut
      if (client && p.project !== client) return false;
      if (dev && p.assignee !== dev) return false;
      if (needle && !`${p.id} ${p.title} ${p.assignee} ${p.project} ${p.reason}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const grav = (p) => (p.severity === "critique" ? 1 : 0);
    arr = arr.slice().sort((a, b) => {
      switch (sort) {
        case "move": return timeOf(b.maj) - timeOf(a.maj);          // mouvement le plus récent d'abord
        case "created": return timeOf(b.cree) - timeOf(a.cree);     // mise en place la plus récente d'abord
        case "date": return b._days - a._days;
        case "ticket": return String(a.id).localeCompare(String(b.id), "fr", { numeric: true });
        case "client": return String(a.project).localeCompare(String(b.project), "fr") || grav(b) - grav(a);
        case "dev": return String(a.assignee).localeCompare(String(b.assignee), "fr") || grav(b) - grav(a);
        default: return grav(b) - grav(a) || b._days - a._days;
      }
    });
    return arr;
  }, [enriched, q, client, dev, sort, showDormant]);

  // Export PDF charté du voyant — rend EXACTEMENT la vue filtrée (client, dév, recherche, dormants, tri).
  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    const needle = q.trim().toLowerCase();
    const labelSort = (SORTS.find((s) => s.v === sort) || {}).l || "";
    const parts = [client ? `client ${client}` : "tous clients"];
    if (dev) parts.push(`développeur ${dev}`);
    if (needle) parts.push(`recherche « ${q.trim()} »`);
    parts.push(showDormant ? "dormants inclus" : "dormants masqués");
    parts.push(`tri : ${labelSort}`);
    const dormantExcl = showDormant ? 0 : enriched.filter((p) =>
      p._obsolete && (!client || p.project === client) && (!dev || p.assignee === dev) &&
      (!needle || `${p.id} ${p.title} ${p.assignee} ${p.project} ${p.reason}`.toLowerCase().includes(needle))
    ).length;
    const caption = parts.join(" · ");
    setExporting(true);
    try {
      // 1) PDF serveur (charte exacte, pied numéroté) — le rendu de référence.
      const payload = buildBlockersPayload(view, { caption, dormant: dormantExcl });
      await exportServerPdf(payload, "Points-bloquants.pdf");
    } catch (e) {
      // 2) Repli : impression navigateur (si le moteur serveur n'est pas déployé).
      const doc = buildBlockersDocFromPoints(view, { caption, dormant: dormantExcl });
      printHtml(doc.html);
    } finally { setExporting(false); }
  };

  // Stats du voyant — recalculées sur la vue FILTRÉE (changent avec recherche / client / dev / tri).
  const stats = useMemo(() => {
    const crit = view.filter((p) => p.severity === "critique").length;
    const nbClients = new Set(view.map((p) => p.project).filter(Boolean)).size;
    const nbDevs = new Set(view.map((p) => p.assignee).filter(Boolean)).size;
    const k = {};
    view.forEach((p) => { k[p.kind] = (k[p.kind] || 0) + 1; });
    return { total: view.length, crit, maj: view.length - crit, nbClients, nbDevs, k };
  }, [view]);

  const openTicket = (p) => { if (onOpenTicket && p.ref) onOpenTicket(p.ref); setOpen(false); };
  // Exceptionnellement sur cette page : la tête du pilote ouvre le MODAL D'ANALYSE du point bloquant.
  const askPilot = (p) => setAnalysis({ ticket: p.ref, point: p });
  const close = () => { setOpen(false); setMaxed(false); setStatsHidden(false); };
  // Masque les stats en descendant, les réaffiche en remontant (header + filtres restent visibles).
  const onScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    const prev = lastScrollY.current;
    if (y > prev + 6 && y > 24) setStatsHidden(true);
    else if (y < prev - 6) setStatsHidden(false);
    lastScrollY.current = y;
  };
  const fldStyle = { border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 11px", fontSize: 13, color: INK, background: "#fff", outline: "none" };
  const selStyle = { ...fldStyle, cursor: "pointer", appearance: "none", paddingRight: 26, backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%234B3F8F'/></svg>")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 9px center" };
  const GREEN = "#39ff8c";

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <style>{`
        @keyframes mwh-spin{ to{ transform:rotate(360deg) } }
        @keyframes mwh-blip{ 0%,100%{ opacity:.25; transform:scale(.7) } 50%{ opacity:1; transform:scale(1.25) } }
        @keyframes mwh-fade{ from{opacity:0} to{opacity:1} }
        @keyframes mwh-pop{ from{opacity:0;transform:translateY(10px) scale(.98)} to{opacity:1;transform:none} }
        .mwh-btn:focus-visible{ outline:3px solid ${GOLD}; outline-offset:3px }
        .mwh-row:focus-visible,.mwh-x:focus-visible{ outline:2px solid ${GOLD}; outline-offset:2px }
        .mwh-row:hover{ background:${SOFT} !important }
        .mwh-filt input:focus,.mwh-filt select:focus{ border-color:${INDIGO} !important; box-shadow:0 0 0 3px rgba(58,54,88,.15) }
        .mwh-filt select:hover{ border-color:${INDIGO} !important }
        .mwh-btn:hover{ transform:translateY(-1px) scale(1.05) }
        @media (prefers-reduced-motion:reduce){ .mwh-sweep,.mwh-blip-d{ animation:none !important } }
      `}</style>

      {/* ---- LE RADAR ---- */}
      <button className="mwh-btn" onClick={() => setOpen(true)}
        aria-label={armed ? `Radar : ${n} point(s) bloquant(s) grave(s). Ouvrir la liste.` : "Radar : aucun point bloquant grave."}
        title={armed ? `${n} point(s) bloquant(s) grave(s)` : "Aucun point bloquant grave"}
        style={{ position: "relative", width: 42, height: 42, borderRadius: "50%", border: "none",
          cursor: "pointer", flexShrink: 0, padding: 0, transition: "transform .15s",
          background: "radial-gradient(circle at 50% 50%, #06381f 0%, #042414 55%, #010a06 100%)",
          boxShadow: armed
            ? `0 0 0 1px #0a3a22, 0 0 14px 2px rgba(57,255,140,.45), 0 0 18px 3px rgba(229,57,43,.35)`
            : `0 0 0 1px #0a3a22, 0 0 12px 1px rgba(57,255,140,.4)` }}>
        {/* grille radar : anneaux + croix */}
        <svg viewBox="0 0 42 42" width="42" height="42" style={{ position: "absolute", inset: 0 }}>
          <circle cx="21" cy="21" r="19" fill="none" stroke={GREEN} strokeOpacity=".5" strokeWidth="1" />
          <circle cx="21" cy="21" r="13" fill="none" stroke={GREEN} strokeOpacity=".3" strokeWidth=".7" />
          <circle cx="21" cy="21" r="7" fill="none" stroke={GREEN} strokeOpacity=".3" strokeWidth=".7" />
          <line x1="21" y1="2" x2="21" y2="40" stroke={GREEN} strokeOpacity=".28" strokeWidth=".7" />
          <line x1="2" y1="21" x2="40" y2="21" stroke={GREEN} strokeOpacity=".28" strokeWidth=".7" />
          <circle cx="21" cy="21" r="1.3" fill={GREEN} />
        </svg>
        {/* faisceau qui balaie */}
        <span className="mwh-sweep" style={{ position: "absolute", inset: 0, borderRadius: "50%",
          background: `conic-gradient(from 0deg, rgba(57,255,140,.55) 0deg, rgba(57,255,140,.12) 38deg, rgba(57,255,140,0) 70deg, transparent 360deg)`,
          transformOrigin: "50% 50%", animation: "mwh-spin 2.8s linear infinite" }} />
        {/* blips rouges qui pulsent (= points graves) */}
        {Array.from({ length: dots }).map((_, i) => (
          <span key={i} className="mwh-blip-d" style={{ position: "absolute", top: BLIPS[i].t, left: BLIPS[i].l,
            width: 5, height: 5, marginTop: -2.5, marginLeft: -2.5, borderRadius: "50%", background: REDV,
            boxShadow: "0 0 6px 1px rgba(229,57,43,.95)", animation: `mwh-blip 1.3s ease-in-out ${i * 0.18}s infinite` }} />
        ))}
        {/* compteur */}
        {armed && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 19, height: 19, padding: "0 5px",
            borderRadius: 10, background: NAVY, color: "#fff", border: `2px solid ${GOLD}`, zIndex: 3,
            fontSize: 10.5, fontWeight: 800, display: "grid", placeItems: "center", lineHeight: 1 }}>{n}</span>
        )}
      </button>

      {/* ---- MODALE POINTS BLOQUANTS (charte app, aérée) ---- */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Points bloquants"
          className={`mw-ov ${maxed ? "maxed" : ""}`} onMouseDown={close}>
          <div className={`mw-modal ${maxed ? "maxed" : ""}`} onMouseDown={(e) => e.stopPropagation()}>

            {/* HEADER */}
            <div className="mw-hd">
              <span className={`mw-hd-dot ${armed ? "on" : ""}`} />
              <div className="mw-hd-t">
                <div className="mw-hd-k">Points bloquants</div>
                <div className="mw-hd-s">
                  {view.length} affiché{view.length > 1 ? "s" : ""}
                  {!showDormant && dormantCount ? ` · ${dormantCount} dormant${dormantCount > 1 ? "s" : ""} masqué${dormantCount > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              <button className="mw-hd-btn" onClick={() => setMaxed((m) => !m)} title={maxed ? "Réduire" : "Agrandir (plein écran)"} aria-label="Agrandir / réduire">{maxed ? "🗗" : "⤢"}</button>
              <button className="mw-hd-btn mwh-x" onClick={close} aria-label="Fermer">×</button>
            </div>

            {/* STATS (se replient au défilement) */}
            <div className={`mw-stats ${statsHidden ? "hidden" : ""}`}>
              {[
                { lbl: "Points", val: stats.total, cls: "navy" },
                { lbl: "Critiques", val: stats.crit, cls: "red" },
                { lbl: "À surveiller", val: stats.maj, cls: "amber" },
                { lbl: "Clients", val: stats.nbClients, cls: "idg" },
                { lbl: "Développeurs", val: stats.nbDevs, cls: "idg" },
              ].map((s) => (
                <div className={`mw-stat ${s.cls}`} key={s.lbl}>
                  <b>{s.val}</b><span>{s.lbl}</span>
                </div>
              ))}
            </div>

            {/* FILTRES — recherche pleine largeur, puis contrôles */}
            <div className="mw-filt">
              <div className="mw-search">
                <span className="mw-search-i" aria-hidden="true">🔎</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ticket, un texte…" />
              </div>
              <div className="mw-controls">
                <select value={client} onChange={(e) => setClient(e.target.value)} title="Filtrer par client">
                  <option value="">Tous les clients</option>
                  {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={dev} onChange={(e) => setDev(e.target.value)} title="Filtrer par développeur">
                  <option value="">Tous les développeurs</option>
                  {devs.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} title="Trier">
                  {SORTS.map((s) => <option key={s.v} value={s.v}>Tri : {s.l}</option>)}
                </select>
                {dormantCount > 0 && (
                  <button className={`mw-toggle ${showDormant ? "on" : ""}`} onClick={() => setShowDormant((v) => !v)}
                    title={`Tickets sans mouvement depuis plus de ${OBSOLETE_DAYS} jours (probablement obsolètes)`}>
                    {showDormant ? "Masquer dormants" : `Dormants (${dormantCount})`}
                  </button>
                )}
                {(client || dev || q || sort !== "move") && (
                  <button className="mw-reset" onClick={() => { setQ(""); setClient(""); setDev(""); setSort("move"); }}>Réinitialiser</button>
                )}
                <button className="mw-export" onClick={exportPdf} disabled={!view.length || exporting} title="Exporter le relevé filtré en PDF (charte Armonie)">
                  {exporting ? "Génération…" : "⤓ Exporter PDF"}
                </button>
              </div>
            </div>

            {/* LISTE */}
            <div className="mw-list" onScroll={onScroll}>
              {view.length === 0 ? (
                <div className="mw-empty">
                  <div className="mw-empty-i">✓</div>
                  {points.length === 0 ? "Aucun point bloquant. Tous les voyants au vert." : "Aucun point ne correspond à ces filtres."}
                </div>
              ) : view.map((p) => {
                const crit = p.severity === "critique";
                return (
                  <div key={p.id} className={`mw-pt ${crit ? "crit" : "maj"} mwh-row`} role="button" tabIndex={0}
                    onClick={() => openTicket(p)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTicket(p); } }}>
                    <span className={`mw-pt-spine ${p.engagement === "Projet" ? "projet" : p.engagement === "TMA" ? "tma" : ""}`}
                      title={p.engagement === "Projet" ? "Mode Projet" : p.engagement === "TMA" ? "Mode TMA" : ""} aria-hidden="true" />
                    <span className="mw-pt-sev">{crit ? "CRITIQUE" : "MAJEUR"}</span>
                    <div className="mw-pt-main">
                      <div className="mw-pt-top">
                        <span className="mw-pt-id">{p.id}</span>
                        <span className="mw-pt-title">{p.title}</span>
                      </div>
                      <div className="mw-pt-reason">{p.reason}</div>
                      <div className="mw-pt-meta">
                        {p.engagement && engStyle(p.engagement) && (
                          <span className={`mw-eng ${p.engagement === "Projet" ? "projet" : "tma"}`}>{p.engagement === "Projet" ? "PROJET" : "TMA"}</span>
                        )}
                        {p._obsolete && <span className="mw-chip dormant" title={`Sans mouvement depuis ${p._moveDays} j`}>DORMANT</span>}
                        {p.project ? (
                          <button type="button" className="mw-chip mw-chip-btn" onClick={(e) => { e.stopPropagation(); onOpen360 && onOpen360(p.project); }} title={`Ouvrir la fiche ${p.project}`}>{p.project}</button>
                        ) : <span className="mw-chip">—</span>}
                        {p.assignee ? (
                          <button type="button" className="mw-chip mw-chip-btn" onClick={(e) => { e.stopPropagation(); onDev && onDev(p.assignee); }} title={`Voir la fiche de ${p.assignee}`}>👤 {p.assignee}</button>
                        ) : <span className="mw-chip">👤 Non assigné</span>}
                        {p._since && (
                          <span className="mw-since">{sinceLabel(p.kind)} {fmtD(p._since)}{p._days ? ` · ${p._days} j` : ""}</span>
                        )}
                      </div>
                    </div>
                    <div className="mw-pt-act">
                      <button className="mw-pilot" onClick={(e) => { e.stopPropagation(); askPilot(p); }}
                        title="Analyser ce point bloquant avec le copilote" aria-label="Analyser ce point bloquant avec le copilote">
                        <img src={PILOT_DATA_URI} alt="" />
                      </button>
                      <span className="mw-chev" aria-hidden="true">›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <BlockerAnalysis
          ticket={analysis.ticket}
          point={analysis.point}
          onClose={() => setAnalysis(null)}
          onOpenTicket={onOpenTicket}
        />
      )}
    </span>
  );
}
