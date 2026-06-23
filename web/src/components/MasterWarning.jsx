import React, { useState } from "react";

/* cp|WIRE — MASTER WARNING : voyant cockpit des points bloquants.
   Bouton rond rouge qui pulse dès qu'il y a du GRAVE (severity critique).
   Au clic : panneau listant les points, le grave d'abord. Clic sur une ligne
   = ouverture du ticket (TicketModal : description + activité Jira = diagnostic).
   Les points viennent de computeBlockers(issues) — mêmes tickets que le point du soir. */

const RED = "#E5392B", AMBER = "#E8912A", GOLD = "#A88B4B", NAVY = "#2E2A5D",
      INDIGO = "#4B3F8F", PANEL = "#15132A", TILE = "#1E1B38",
      TEXT = "#EDEAF6", MUTED = "#8E89AB";

export default function MasterWarning({ points = [], onOpenTicket }) {
  const [open, setOpen] = useState(false);
  const grave = points.filter((p) => p.severity === "critique");
  const watch = points.filter((p) => p.severity === "majeur");
  const n = grave.length;
  const armed = n > 0;

  const openTicket = (p) => { if (onOpenTicket && p.ref) onOpenTicket(p.ref); setOpen(false); };

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <style>{`
        @keyframes mwh-pulse{
          0%,100%{ box-shadow:0 0 0 2px #0E0C1E,0 0 0 3px rgba(229,57,43,.4),
            0 0 12px 2px rgba(229,57,43,.55),inset 0 3px 7px rgba(255,150,140,.5),
            inset 0 -5px 9px rgba(120,15,8,.7) }
          50%{ box-shadow:0 0 0 2px #0E0C1E,0 0 0 3px rgba(229,57,43,.5),
            0 0 26px 7px rgba(229,57,43,.8),inset 0 3px 8px rgba(255,180,170,.85),
            inset 0 -5px 9px rgba(120,15,8,.7) }
        }
        @keyframes mwh-in{ from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        .mwh-btn:focus-visible{ outline:3px solid ${GOLD}; outline-offset:3px }
        .mwh-row:focus-visible,.mwh-a:focus-visible{ outline:2px solid ${GOLD}; outline-offset:2px }
        @media (prefers-reduced-motion:reduce){ .mwh-btn{ animation:none !important } }
      `}</style>

      <button className="mwh-btn" onClick={() => setOpen((o) => !o)}
        aria-label={armed ? `${n} point(s) bloquant(s) grave(s). Ouvrir la liste.` : "Aucun point bloquant grave."}
        title={armed ? `${n} point(s) bloquant(s) grave(s)` : "Aucun point bloquant grave"}
        style={{ position: "relative", width: 38, height: 38, borderRadius: "50%",
          border: "none", cursor: "pointer", flexShrink: 0,
          background: armed
            ? "radial-gradient(circle at 36% 30%, #ff6f5e 0%, #e5392b 44%, #8c1c12 100%)"
            : "radial-gradient(circle at 36% 30%, #3a3658 0%, #262342 60%, #181530 100%)",
          boxShadow: armed ? undefined
            : "0 0 0 2px #0E0C1E, inset 0 3px 7px rgba(255,255,255,.05), inset 0 -5px 9px rgba(0,0,0,.5)",
          animation: armed ? "mwh-pulse 1.05s ease-in-out infinite" : "none" }}>
        <span style={{ position: "absolute", top: 6, left: 9, width: 15, height: 9,
          borderRadius: "50%", background: armed ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.1)",
          filter: "blur(1.5px)" }} />
        {armed && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 20, height: 20,
            padding: "0 5px", borderRadius: 10, background: NAVY, color: "#fff",
            border: `2px solid ${GOLD}`, fontSize: 11, fontWeight: 800,
            display: "grid", placeItems: "center", lineHeight: 1 }}>{n}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1900, background: "transparent" }} />
          <div role="dialog" aria-label="Points bloquants"
            style={{ position: "fixed", top: 66, right: 14, width: "min(440px, calc(100vw - 28px))",
              maxHeight: "calc(100vh - 90px)", overflowY: "auto", zIndex: 1901,
              background: PANEL, borderRadius: 12, border: "1px solid rgba(168,139,75,.22)",
              boxShadow: "0 18px 50px rgba(0,0,0,.45)", animation: "mwh-in .18s ease-out",
              fontFamily: "ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif", color: TEXT }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,.07)",
              fontWeight: 800, letterSpacing: 2, fontSize: 13 }}>
              POINTS BLOQUANTS
              <span style={{ color: MUTED, fontWeight: 500, letterSpacing: 0, marginLeft: 9, fontSize: 12 }}>
                {n} grave{n > 1 ? "s" : ""}{watch.length ? ` · ${watch.length} à surveiller` : ""}
              </span>
            </div>

            {grave.length === 0 && watch.length === 0 ? (
              <div style={{ padding: "30px 18px", textAlign: "center", color: MUTED }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
                Aucun point bloquant. Tous les voyants au vert.
              </div>
            ) : (
              <div style={{ padding: 12, display: "grid", gap: 10 }}>
                {grave.map((p) => (
                  <button key={p.id} className="mwh-row" onClick={() => openTicket(p)}
                    style={{ textAlign: "left", cursor: "pointer", width: "100%",
                      background: TILE, borderRadius: 10, border: "none",
                      borderLeft: `4px solid ${RED}`, padding: "11px 13px",
                      display: "flex", gap: 12, alignItems: "flex-start", color: TEXT }}>
                    <span style={{ background: RED, color: "#fff", fontSize: 9, fontWeight: 800,
                      letterSpacing: 1, padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>CRITIQUE</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700,
                          color: GOLD, fontSize: 12.5 }}>{p.id}</span>
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.title}</span>
                      </span>
                      <span style={{ display: "block", color: RED, fontSize: 12, marginTop: 3, fontWeight: 600 }}>{p.reason}</span>
                      <span style={{ display: "block", color: MUTED, fontSize: 11, marginTop: 3 }}>
                        {p.project} · {p.assignee} · {p.ageDays} j</span>
                    </span>
                  </button>
                ))}
                {watch.length > 0 && (
                  <div style={{ marginTop: 2, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}>
                    <div style={{ color: MUTED, fontSize: 10, letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>À SURVEILLER</div>
                    {watch.map((p) => (
                      <button key={p.id} className="mwh-row" onClick={() => openTicket(p)}
                        style={{ display: "flex", gap: 9, alignItems: "baseline", width: "100%",
                          textAlign: "left", border: "none", background: "transparent", cursor: "pointer",
                          padding: "5px 3px", fontSize: 12, color: TEXT }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: AMBER, flexShrink: 0 }} />
                        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", color: GOLD, fontWeight: 700 }}>{p.id}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                        <span style={{ color: AMBER, fontSize: 10.5, flexShrink: 0 }}>{p.reason}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}
