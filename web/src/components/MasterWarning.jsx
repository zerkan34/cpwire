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

const RED = "#C0392B", REDV = "#E5392B", AMBER = "#C2691A", GOLD = "#A8884E",
      NAVY = "#2E2A5D", INDIGO = "#4B3F8F", INK = "#2a2937", MUTED = "#6b6488",
      SOFT = "#F5F2FC", LINE = "#e7e5f1";

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

export default function MasterWarning({ points = [], onOpenTicket }) {
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
        .mwh-filt input:focus,.mwh-filt select:focus{ border-color:${INDIGO} !important; box-shadow:0 0 0 3px rgba(75,63,143,.15) }
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

      {/* ---- MODALE CENTRÉE ---- */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Points bloquants"
          onMouseDown={close}
          style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(20,16,40,.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: maxed ? 0 : 16,
            animation: "mwh-fade .15s ease-out",
            fontFamily: "ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif" }}>
          <div onMouseDown={(e) => e.stopPropagation()}
            style={{ width: maxed ? "100%" : "min(760px, 100%)", height: maxed ? "100%" : "auto",
              maxHeight: maxed ? "100%" : "88vh", display: "flex", flexDirection: "column",
              background: "#fff", borderRadius: maxed ? 0 : 16, overflow: "hidden",
              boxShadow: "0 24px 70px rgba(20,16,40,.45)", animation: "mwh-pop .18s ease-out" }}>

            {/* HEADER — toujours visible, charte app (dégradé + filet doré) */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 18px",
              background: `linear-gradient(135deg, ${NAVY}, ${INDIGO})`, color: "#fff",
              boxShadow: `inset 0 -3px 0 ${GOLD}`, flex: "none" }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: armed ? REDV : "#3a7d54",
                boxShadow: armed ? "0 0 10px rgba(229,57,43,.9)" : "none", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Poppins,Inter,sans-serif", fontWeight: 700, letterSpacing: 1.5, fontSize: 14 }}>POINTS BLOQUANTS</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.72)", marginTop: 1 }}>
                  {view.length} affiché{view.length > 1 ? "s" : ""}{!showDormant && dormantCount ? ` · ${dormantCount} dormant${dormantCount > 1 ? "s" : ""} masqué${dormantCount > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              <button onClick={() => setMaxed((m) => !m)} title={maxed ? "Réduire" : "Agrandir (plein écran)"} aria-label="Agrandir / réduire"
                style={{ border: "none", background: "rgba(255,255,255,.14)", color: "#fff", width: 32, height: 32, borderRadius: 9, cursor: "pointer", fontSize: 14, lineHeight: 1, flex: "none" }}>{maxed ? "🗗" : "⤢"}</button>
              <button className="mwh-x" onClick={close} aria-label="Fermer"
                style={{ border: "none", background: "rgba(255,255,255,.14)", color: "#fff", width: 32, height: 32, borderRadius: 9, cursor: "pointer", fontSize: 17, lineHeight: 1, flex: "none" }}>×</button>
            </div>

            {/* STATS — sous le header ; se replient quand on défile vers le bas, reviennent en remontant */}
            <div style={{ overflow: "hidden", flex: "none",
              transition: "max-height .22s ease, opacity .18s ease, padding .22s ease",
              maxHeight: statsHidden ? 0 : 130, opacity: statsHidden ? 0 : 1,
              padding: statsHidden ? "0 14px" : "12px 14px", background: "#faf9fd", borderBottom: statsHidden ? "none" : `1px solid ${LINE}` }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { lbl: "Points", val: stats.total, col: NAVY },
                  { lbl: "Critiques", val: stats.crit, col: RED },
                  { lbl: "À surveiller", val: stats.maj, col: AMBER },
                  { lbl: "Clients", val: stats.nbClients, col: INDIGO },
                  { lbl: "Développeurs", val: stats.nbDevs, col: INDIGO },
                ].map((s) => (
                  <div key={s.lbl} style={{ flex: "1 1 96px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "7px 11px", borderLeft: `3px solid ${s.col}` }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: s.col, fontFamily: "Poppins,Inter,sans-serif", lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: ".04em", marginTop: 2 }}>{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* FILTRES — toujours visibles */}
            <div className="mwh-filt" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
              padding: "10px 14px", borderBottom: `1px solid ${LINE}`, background: "#fff", flex: "none" }}>
              <span style={{ position: "relative", flex: "1 1 200px", minWidth: 150 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, opacity: .5 }}>🔎</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ticket, un texte…"
                  style={{ ...fldStyle, width: "100%", paddingLeft: 30 }} />
              </span>
              <select value={client} onChange={(e) => setClient(e.target.value)} style={selStyle} title="Filtrer par client">
                <option value="">Tous les clients</option>
                {clients.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={dev} onChange={(e) => setDev(e.target.value)} style={selStyle} title="Filtrer par développeur">
                <option value="">Tous les développeurs</option>
                {devs.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={selStyle} title="Trier">
                {SORTS.map((s) => <option key={s.v} value={s.v}>Tri : {s.l}</option>)}
              </select>
              {dormantCount > 0 && (
                <button onClick={() => setShowDormant((v) => !v)} title={`Tickets sans mouvement depuis plus de ${OBSOLETE_DAYS} jours (probablement obsolètes)`}
                  style={{ border: `1px solid ${showDormant ? INDIGO : LINE}`, background: showDormant ? INDIGO : "#fff", color: showDormant ? "#fff" : MUTED, borderRadius: 10, padding: "8px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {showDormant ? "Masquer les dormants" : `Afficher les dormants (${dormantCount})`}
                </button>
              )}
              {(client || dev || q || sort !== "move") && (
                <button onClick={() => { setQ(""); setClient(""); setDev(""); setSort("move"); }}
                  style={{ border: "none", background: "transparent", color: INDIGO, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Réinitialiser
                </button>
              )}
              <button onClick={exportPdf} disabled={!view.length || exporting} title="Exporter le relevé filtré en PDF (charte Armonie)"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 10,
                  background: view.length ? `linear-gradient(135deg, ${NAVY}, ${INDIGO})` : "#cdc9dd", color: "#fff",
                  fontSize: 12.5, fontWeight: 700, padding: "8px 14px", cursor: view.length && !exporting ? "pointer" : "default",
                  boxShadow: view.length ? `inset 0 -2px 0 rgba(168,136,78,.7)` : "none" }}>
                {exporting ? "Génération…" : "⤓ Exporter PDF"}
              </button>
            </div>

            <div onScroll={onScroll} style={{ overflowY: "auto", padding: 12, flex: 1 }}>
              {view.length === 0 ? (
                <div style={{ padding: "34px 18px", textAlign: "center", color: MUTED }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>✓</div>
                  {points.length === 0 ? "Aucun point bloquant. Tous les voyants au vert."
                    : "Aucun point ne correspond à ces filtres."}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {view.map((p) => {
                    const crit = p.severity === "critique";
                    const col = crit ? RED : AMBER;
                    return (
                      <div key={p.id} className="mwh-row" role="button" tabIndex={0}
                        onClick={() => openTicket(p)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTicket(p); } }}
                        style={{ textAlign: "left", cursor: "pointer", width: "100%", background: "#fff",
                          borderRadius: 10, border: `1px solid ${LINE}`, borderLeft: `4px solid ${col}`,
                          padding: "11px 13px", display: "flex", gap: 12, alignItems: "flex-start", color: INK,
                          transition: "background .1s" }}>
                        {engStyle(p.engagement) && (
                          <span aria-hidden="true" title={p.engagement === "Projet" ? "Mode Projet" : "Mode TMA"}
                            style={{ alignSelf: "stretch", flex: "0 0 auto", width: 5, borderRadius: 4, background: engStyle(p.engagement).fg }} />
                        )}
                        <span style={{ background: col, color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 1,
                          padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap", marginTop: 1 }}>{crit ? "CRITIQUE" : "MAJEUR"}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700, color: GOLD, fontSize: 12.5 }}>{p.id}</span>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: NAVY }}>{p.title}</span>
                          </span>
                          <span style={{ display: "block", color: col, fontSize: 12, marginTop: 3, fontWeight: 600 }}>{p.reason}</span>
                          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
                            {p.engagement && engStyle(p.engagement) && (
                              <span style={{ background: engStyle(p.engagement).bg, border: `1px solid ${engStyle(p.engagement).ln}`, color: engStyle(p.engagement).fg, fontSize: 10, fontWeight: 800, letterSpacing: ".04em", padding: "2px 8px", borderRadius: 999 }}>
                                {p.engagement === "Projet" ? "PROJET" : "TMA"}
                              </span>
                            )}
                            {p._obsolete && (
                              <span style={{ background: "#eceaf1", border: `1px solid ${LINE}`, color: MUTED, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }} title={`Sans mouvement depuis ${p._moveDays} j`}>DORMANT</span>
                            )}
                            <span style={{ background: SOFT, border: `1px solid ${LINE}`, color: INDIGO, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{p.project || "—"}</span>
                            <span style={{ background: SOFT, border: `1px solid ${LINE}`, color: INK, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }}>👤 {p.assignee || "Non assigné"}</span>
                            {p._since && (
                              <span style={{ background: crit ? "rgba(192,57,43,.08)" : "rgba(194,105,26,.10)", border: `1px solid ${col}`, color: col, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>
                                {sinceLabel(p.kind)} {fmtD(p._since)}{p._days ? ` · ${p._days} j` : ""}
                              </span>
                            )}
                          </span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, alignSelf: "center" }}>
                          <button onClick={(e) => { e.stopPropagation(); askPilot(p); }}
                            title="Analyser ce point bloquant avec le copilote" aria-label="Analyser ce point bloquant avec le copilote"
                            style={{ border: `1px solid ${GOLD}`, background: `linear-gradient(135deg, ${NAVY}, ${INDIGO})`,
                              padding: 0, width: 30, height: 30, borderRadius: "50%", cursor: "pointer", overflow: "hidden", flexShrink: 0 }}>
                            <img src={PILOT_DATA_URI} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </button>
                          <span style={{ color: MUTED, fontSize: 14 }}>›</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
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
