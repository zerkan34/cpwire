import React, { useState, useMemo } from "react";
import { PILOT_DATA_URI } from "../pilot.js";

/* cp|WIRE — MASTER WARNING : voyant cockpit des points bloquants.
   Bouton = un RADAR vert qui balaie (sweep rotatif) ; des blips ROUGES pulsent
   dedans quand il y a du GRAVE (severity critique). Au clic : MODALE CENTRÉE
   avec filtres (client, dev, recherche) et tri (gravité, date, ticket, client,
   dev). Clic sur une ligne = ouverture du ticket (TicketModal = diagnostic).
   Points issus de computeBlockers(issues) — mêmes tickets que le point du soir. */

const RED = "#C0392B", REDV = "#E5392B", AMBER = "#C2691A", GOLD = "#A8884E",
      NAVY = "#2E2A5D", INDIGO = "#4B3F8F", INK = "#2a2937", MUTED = "#6b6488",
      SOFT = "#F5F2FC", LINE = "#e7e5f1";

const SORTS = [
  { v: "gravite", l: "Gravité" },
  { v: "date", l: "Ancienneté" },
  { v: "ticket", l: "Ticket" },
  { v: "client", l: "Client" },
  { v: "dev", l: "Développeur" },
];

// Positions des blips dans le radar (en %, dans le rayon utile).
const BLIPS = [
  { t: "30%", l: "60%" }, { t: "40%", l: "32%" }, { t: "58%", l: "66%" },
  { t: "66%", l: "44%" }, { t: "36%", l: "48%" }, { t: "54%", l: "26%" },
];

export default function MasterWarning({ points = [], onOpenTicket }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [dev, setDev] = useState("");
  const [sort, setSort] = useState("gravite");

  const n = points.filter((p) => p.severity === "critique").length; // graves
  const armed = n > 0;
  const dots = Math.min(n, BLIPS.length);

  const clients = useMemo(() => [...new Set(points.map((p) => p.project).filter(Boolean))].sort(), [points]);
  const devs = useMemo(() => [...new Set(points.map((p) => p.assignee).filter(Boolean))].sort(), [points]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = points.filter((p) => {
      if (client && p.project !== client) return false;
      if (dev && p.assignee !== dev) return false;
      if (needle && !`${p.id} ${p.title} ${p.assignee} ${p.project} ${p.reason}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const grav = (p) => (p.severity === "critique" ? 1 : 0);
    arr = arr.slice().sort((a, b) => {
      switch (sort) {
        case "date": return b.ageDays - a.ageDays;
        case "ticket": return String(a.id).localeCompare(String(b.id), "fr", { numeric: true });
        case "client": return String(a.project).localeCompare(String(b.project), "fr") || grav(b) - grav(a);
        case "dev": return String(a.assignee).localeCompare(String(b.assignee), "fr") || grav(b) - grav(a);
        default: return grav(b) - grav(a) || b.ageDays - a.ageDays;
      }
    });
    return arr;
  }, [points, q, client, dev, sort]);

  const openTicket = (p) => { if (onOpenTicket && p.ref) onOpenTicket(p.ref); setOpen(false); };
  const askPilot = (p) => { window.dispatchEvent(new CustomEvent("cpwire-pilot-ticket", { detail: { ticket: p.ref } })); setOpen(false); };
  const selStyle = { border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 9px", fontSize: 12.5, color: INK, background: "#fff", cursor: "pointer", outline: "none" };
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
          onMouseDown={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(20,16,40,.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            animation: "mwh-fade .15s ease-out",
            fontFamily: "ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif" }}>
          <div onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "min(720px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column",
              background: "#fff", borderRadius: 16, overflow: "hidden",
              boxShadow: "0 24px 70px rgba(20,16,40,.45)", animation: "mwh-pop .18s ease-out" }}>

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px",
              background: `linear-gradient(135deg, ${NAVY}, ${INDIGO})`, color: "#fff" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: armed ? REDV : "#3a7d54",
                boxShadow: armed ? "0 0 10px rgba(229,57,43,.9)" : "none", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, letterSpacing: 2, fontSize: 14 }}>POINTS BLOQUANTS</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 2 }}>
                  {n} grave{n > 1 ? "s" : ""} · {points.length} au total
                  {(client || dev || q) ? ` · ${view.length} affiché${view.length > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              <button className="mwh-x" onClick={() => setOpen(false)} aria-label="Fermer"
                style={{ border: "none", background: "rgba(255,255,255,.14)", color: "#fff", width: 32, height: 32,
                  borderRadius: 9, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
              padding: "12px 16px", borderBottom: `1px solid ${LINE}`, background: "#faf9fd" }}>
              <span style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
                <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, opacity: .5 }}>🔎</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket, texte…"
                  style={{ width: "100%", border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 9px 7px 28px",
                    fontSize: 12.5, color: INK, outline: "none" }} />
              </span>
              <select value={client} onChange={(e) => setClient(e.target.value)} style={selStyle} title="Filtrer par client">
                <option value="">Tous clients</option>
                {clients.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={dev} onChange={(e) => setDev(e.target.value)} style={selStyle} title="Filtrer par développeur">
                <option value="">Tous développeurs</option>
                {devs.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={selStyle} title="Trier">
                {SORTS.map((s) => <option key={s.v} value={s.v}>Tri : {s.l}</option>)}
              </select>
              {(client || dev || q || sort !== "gravite") && (
                <button onClick={() => { setQ(""); setClient(""); setDev(""); setSort("gravite"); }}
                  style={{ border: "none", background: "transparent", color: INDIGO, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Réinitialiser
                </button>
              )}
            </div>

            <div style={{ overflowY: "auto", padding: 12 }}>
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
                        <span style={{ background: col, color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 1,
                          padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap", marginTop: 1 }}>{crit ? "CRITIQUE" : "MAJEUR"}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700, color: GOLD, fontSize: 12.5 }}>{p.id}</span>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: NAVY }}>{p.title}</span>
                          </span>
                          <span style={{ display: "block", color: col, fontSize: 12, marginTop: 3, fontWeight: 600 }}>{p.reason}</span>
                          <span style={{ display: "block", color: MUTED, fontSize: 11.5, marginTop: 3 }}>
                            {p.project} · {p.assignee} · {p.ageDays} j</span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, alignSelf: "center" }}>
                          <button onClick={(e) => { e.stopPropagation(); askPilot(p); }}
                            title="Demander au copilote de traiter ce ticket" aria-label="Demander au copilote de traiter ce ticket"
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
    </span>
  );
}
