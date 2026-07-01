import React, { useState, useEffect, useRef } from "react";
import { askAssistant } from "../api.js";
import { PILOT_DATA_URI } from "../pilot.js";

/* cp|WIRE — Analyse d'un point bloquant.
   S'ouvre au clic sur la tête du pilote dans le voyant. Le copilote analyse le ticket SANS
   qu'on lui demande quoi que ce soit : problème, enjeu, actions, prochaine étape. Champ de
   discussion pour approfondir. Export PDF charté. Rendu PROPRE : aucun symbole brut (pas de
   **, #, ---), uniquement des intertitres et des phrases claires. */

const NAVY = "var(--indigo)", INDIGO = "var(--indigo)", GOLD = "var(--gold)", INK = "var(--ink)";
const MUTED = "var(--muted)", SOFT = "var(--purple-soft)", LINE = "var(--line)", RED = "var(--red)", AMBER = "var(--amber)";

// ---------- Rendu propre (on retire tout symbole de mise en forme résiduel) ----------
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inlineClean(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")  // **gras** -> gras (jamais d'astérisques visibles)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/[*_#]+/g, "")                                // symboles résiduels supprimés
    .trim();
}
const isHr = (t) => /^\s*[-*_=]{3,}\s*$/.test(t);                     // ligne de séparation --- => ignorée
const isSubtitle = (t) => /:\s*$/.test(t) && t.replace(/:\s*$/, "").length <= 70;
const isBullet = (t) => /^\s*([-*•]|\d+[).])\s+/.test(t);
const bulletText = (t) => t.replace(/^\s*([-*•]|\d+[).])\s+/, "");

// -> blocs structurés (titres / listes / paragraphes), pour l'affichage ET l'export.
function toBlocks(text) {
  const blocks = [];
  let li = null;
  const flush = () => { if (li) { blocks.push({ t: "ul", items: li }); li = null; } };
  String(text || "").split(/\n/).forEach((raw) => {
    const t = raw.trim();
    if (!t || isHr(t)) { flush(); return; }
    if (isBullet(t)) { (li || (li = [])).push(bulletText(t)); return; }
    flush();
    if (isSubtitle(t)) blocks.push({ t: "h", text: t.replace(/:\s*$/, "") });
    else blocks.push({ t: "p", text: t });
  });
  flush();
  return blocks;
}
function renderJSX(text, k) {
  return toBlocks(text).map((b, i) => {
    if (b.t === "h") return <div key={`${k}h${i}`} className="cwa-h">{b.text}</div>;
    if (b.t === "ul") return <ul key={`${k}u${i}`} className="cwa-ul">{b.items.map((x, j) => <li key={j} dangerouslySetInnerHTML={{ __html: inlineClean(x) }} />)}</ul>;
    return <div key={`${k}p${i}`} className="cwa-p" dangerouslySetInnerHTML={{ __html: inlineClean(b.text) }} />;
  });
}
function renderHTML(text) {
  return toBlocks(text).map((b) => {
    if (b.t === "h") return `<h3>${inlineClean(b.text)}</h3>`;
    if (b.t === "ul") return `<ul>${b.items.map((x) => `<li>${inlineClean(x)}</li>`).join("")}</ul>`;
    return `<p>${inlineClean(b.text)}</p>`;
  }).join("");
}

function fmtD(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }

function buildQuestion(t, p) {
  const grav = p?.severity === "critique" ? "CRITIQUE" : "MAJEUR";
  return [
    "Analyse ce point bloquant en tant que chef de projet MOE, pour décision et action immédiate.",
    `Ticket : ${t.cle} — ${t.resume || ""}.`,
    `Client / dossier : ${t.dossier || "—"}. Assigné : ${t.assigne || "—"}. Gravité cockpit : ${grav}. Raison : ${p?.reason || "—"}. Dans cet état depuis le ${fmtD(p?._since || p?.since)}.`,
    "",
    "Donne une analyse claire et actionnable, en prose, avec de COURTS intertitres terminés par deux-points :",
    "Le problème : ce qui bloque réellement (statut, drapeau, historique, description du ticket).",
    `L'enjeu : pourquoi c'est ${grav.toLowerCase()} et l'impact concret si ça reste bloqué.`,
    "Ce que je dois faire : les actions concrètes dans l'ordre, et qui solliciter (noms si connus).",
    "Prochaine étape : la toute première chose à faire maintenant.",
    "",
    "N'invente AUCUN fait : appuie-toi uniquement sur les données Jira et le contexte fourni ; si une donnée manque, dis-le clairement. N'emploie AUCUN symbole de mise en forme (ni **, ni #, ni tirets de séparation ---). Des phrases claires et précises.",
  ].join("\n");
}

export default function BlockerAnalysis({ ticket, point, onClose, onOpenTicket }) {
  const [msgs, setMsgs] = useState([]);     // { role:'ai'|'user', text, error }
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const hist = useRef([]);                  // historique API (paires user/assistant)
  const bodyRef = useRef(null);
  const started = useRef(false);

  const grav = point?.severity === "critique" ? "critique" : "majeur";
  const gcol = grav === "critique" ? RED : AMBER;

  const scrollDown = () => { requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }); };

  // Analyse automatique à l'ouverture (une seule fois).
  useEffect(() => {
    if (started.current || !ticket) return;
    started.current = true;
    const q = buildQuestion(ticket, point);
    runAsk(q, `Analyse du point bloquant ${ticket.cle}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  async function runAsk(question, userLabelForHistory) {
    setBusy(true);
    setMsgs((m) => [...m, { role: "ai", text: "", thinking: true }]);
    scrollDown();
    try {
      const r = await askAssistant(question, hist.current);
      const answer = (r && r.answer) ? r.answer : "Je n'ai pas pu produire d'analyse pour ce ticket.";
      hist.current = [...hist.current, { role: "user", content: userLabelForHistory || question }, { role: "assistant", content: answer }].slice(-8);
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "ai", text: answer }; return c; });
    } catch (e) {
      console.error("[BlockerAnalysis]", e && e.message ? e.message : e);
      setMsgs((m) => { const c = m.slice(); c[c.length - 1] = { role: "ai", text: String(e.message || e), error: true }; return c; });
    } finally { setBusy(false); scrollDown(); }
  }

  const sendFollow = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    runAsk(text, text);
  };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFollow(); } };

  const exportPdf = () => {
    const rows = msgs.filter((m) => !m.thinking).map((m) =>
      m.role === "user"
        ? `<div class="q"><span class="who">Vous</span><div class="qt">${escapeHtml(m.text).replace(/\n/g, "<br>")}</div></div>`
        : `<div class="a"><span class="who cop">Analyse cp|WIRE</span><div class="at">${renderHTML(m.text)}</div></div>`
    ).join("");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Analyse — ${escapeHtml(ticket.cle)}</title>
      <style>
        @page { margin: 18mm 16mm; }
        *{box-sizing:border-box} body{font-family:Inter,Segoe UI,Arial,sans-serif;color:${INK};margin:0;line-height:1.5}
        .hd{background:var(--hd-logo);color:#fff;padding:22px 26px;border-bottom:3px solid ${GOLD}}
        .hd h1{margin:0;font-family:Poppins,Inter,sans-serif;font-size:19px}
        .hd .sub{opacity:.85;font-size:12.5px;margin-top:4px}
        .meta{display:flex;flex-wrap:wrap;gap:8px;padding:14px 26px;background:${SOFT};font-size:12.5px;color:${INK};border-bottom:1px solid ${LINE}}
        .meta b{color:${INDIGO}}
        .wrap{padding:18px 26px}
        .q,.a{margin:0 0 14px} .who{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${MUTED};margin-bottom:4px}
        .who.cop{color:${GOLD}}
        .qt{background:${INDIGO};color:#fff;padding:9px 13px;border-radius:11px;font-size:13.5px;display:inline-block}
        .at h3{font-family:Poppins,Inter,sans-serif;color:${NAVY};font-size:13.5px;margin:13px 0 4px}
        .at p{margin:5px 0;font-size:13.5px} .at ul{margin:5px 0;padding-left:20px} .at li{margin:3px 0;font-size:13.5px}
        .at code{background:${SOFT};border:1px solid ${LINE};border-radius:4px;padding:0 4px;font-size:12px}
        .ft{padding:10px 26px;color:${MUTED};font-size:11px;border-top:1px solid ${LINE}}
      </style></head><body>
      <div class="hd"><h1>Point bloquant — ${escapeHtml(ticket.cle)}</h1><div class="sub">${escapeHtml(ticket.resume || "")}</div></div>
      <div class="meta"><span>Client : <b>${escapeHtml(ticket.dossier || "—")}</b></span><span>Développeur : <b>${escapeHtml(ticket.assigne || "—")}</b></span><span>Gravité : <b>${grav === "critique" ? "Critique" : "Majeur"}</b></span><span>Depuis le : <b>${fmtD(point?._since || point?.since)}</b></span></div>
      <div class="wrap">${rows}</div>
      <div class="ft">cp|WIRE — analyse générée à partir des données Jira et du contexte projet. Document de travail.</div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 350); }
    else {
      const blob = new Blob([html], { type: "text/html" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `analyse-${ticket.cle}.html`; a.click();
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(31,27,51,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(720px,100%)", maxHeight: "calc(100vh - 32px)", background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 70px rgba(46,42,93,.4)" }}>

        {/* En-tête charté */}
        <div style={{ background: `var(--hd-logo)`, color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: `inset 0 -3px 0 ${GOLD}` }}>
          <img src={PILOT_DATA_URI} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(168,136,78,.92)", flex: "none" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Poppins,Inter,sans-serif", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: gcol, color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: "2px 7px", borderRadius: 5 }}>{grav === "critique" ? "CRITIQUE" : "MAJEUR"}</span>
              Analyse — {ticket.cle}
            </div>
            <div style={{ fontSize: 11.5, opacity: .85, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ticket.resume}</div>
          </div>
          <button onClick={exportPdf} title="Exporter en PDF (charte Armonie)" aria-label="Exporter"
            style={{ background: "rgba(255,255,255,.16)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 15, flex: "none" }}>⤓</button>
          <button onClick={onClose} aria-label="Fermer"
            style={{ background: "rgba(255,255,255,.16)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 14, flex: "none" }}>×</button>
        </div>

        {/* Bandeau identité : client · dev · depuis quand */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 18px", background: SOFT, borderBottom: `1px solid ${LINE}`, fontSize: 12.5 }}>
          <span style={{ color: INK }}>Client&nbsp;: <b style={{ color: INDIGO }}>{ticket.dossier || "—"}</b></span>
          <span style={{ color: MUTED }}>·</span>
          <span style={{ color: INK }}>Développeur&nbsp;: <b style={{ color: INDIGO }}>{ticket.assigne || "—"}</b></span>
          <span style={{ color: MUTED }}>·</span>
          <span style={{ color: INK }}>Dans cet état depuis le <b style={{ color: gcol }}>{fmtD(point?._since || point?.since)}</b></span>
          {onOpenTicket && (<button onClick={() => { onOpenTicket(ticket); onClose(); }} style={{ marginLeft: "auto", border: `1px solid ${LINE}`, background: "#fff", color: INDIGO, borderRadius: 8, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", cursor: "pointer" }}>Ouvrir le ticket</button>)}
        </div>

        {/* Conversation */}
        <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f7f6fb", display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "ai" && !m.thinking && <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: GOLD, marginBottom: 3 }}>Analyse cp|WIRE</span>}
              <div className={m.role === "ai" ? "cwa-bub ai" : ""}
                style={m.role === "user"
                  ? { background: INDIGO, color: "#fff", padding: "10px 13px", borderRadius: 14, borderBottomRightRadius: 4, fontSize: 13.5, maxWidth: "86%", whiteSpace: "pre-wrap" }
                  : { background: "#fff", color: "#3f3d57", border: `1px solid ${LINE}`, borderRadius: 14, borderBottomLeftRadius: 4, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.5, maxWidth: "94%", ...(m.error ? { background: "#fbe6e3", color: RED, borderColor: "#f3c6c0" } : {}) }}>
                {m.role === "ai"
                  ? (m.thinking ? <span style={{ color: GOLD, letterSpacing: 2 }}>● ● ●</span> : (m.error ? m.text : renderJSX(m.text, `m${i}`)))
                  : m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Champ de discussion */}
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${LINE}`, background: "#fff" }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} rows={1}
            placeholder="Demander une précision, un plan d'action, un mail à envoyer…"
            style={{ flex: 1, resize: "none", border: "1px solid #d8d3ea", borderRadius: 10, padding: "9px 11px", font: "inherit", fontSize: 13.5, maxHeight: 90, outline: "none" }} />
          <button onClick={sendFollow} disabled={busy || !input.trim()}
            style={{ border: "none", background: INDIGO, color: "#fff", borderRadius: 10, width: 42, cursor: busy || !input.trim() ? "default" : "pointer", fontSize: 15, opacity: busy || !input.trim() ? .45 : 1 }}>➤</button>
        </div>
      </div>
    </div>
  );
}
