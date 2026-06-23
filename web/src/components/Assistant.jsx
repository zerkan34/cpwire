import React, { useState, useRef, useEffect } from "react";
import { askAssistant, analyzeForAssistant, importToCorpus } from "../api.js";
import { PILOT_DATA_URI } from "../pilot.js";

// Rendu lisible et structuré des réponses (markdown-léger, sans dépendance) :
// titres, puces, citations/recommandations, gras et code en ligne.
function inlineBold(text, kb) {
  return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={kb + "-" + i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={kb + "-" + i} className="cwa-code">{p.slice(1, -1)}</code>;
    return p;
  });
}
function renderRich(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(<ul key={"ul" + out.length} className="cwa-ul">{list}</ul>); list = null; } };
  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (!t) { flush(); return; }
    let m;
    if ((m = t.match(/^#{1,6}\s+(.*)$/))) { flush(); out.push(<div key={"h" + idx} className="cwa-h">{inlineBold(m[1], "h" + idx)}</div>); }
    else if ((m = t.match(/^>\s?(.*)$/))) { flush(); out.push(<div key={"q" + idx} className="cwa-quote">{inlineBold(m[1], "q" + idx)}</div>); }
    else if ((m = t.match(/^[-*•]\s+(.*)$/))) { (list || (list = [])).push(<li key={"li" + idx}>{inlineBold(m[1], "li" + idx)}</li>); }
    else { flush(); out.push(<div key={"p" + idx} className="cwa-p">{inlineBold(t, "p" + idx)}</div>); }
  });
  flush();
  return out;
}

// Variantes HTML (pour l'export imprimable à la charte Armonie).
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inlineHtml(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}
function richToHtml(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let html = "", list = null;
  const flush = () => { if (list !== null) { html += "<ul>" + list + "</ul>"; list = null; } };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { flush(); continue; }
    let m;
    if ((m = t.match(/^#{1,6}\s+(.*)$/))) { flush(); html += `<h4>${inlineHtml(m[1])}</h4>`; }
    else if ((m = t.match(/^>\s?(.*)$/))) { flush(); html += `<blockquote>${inlineHtml(m[1])}</blockquote>`; }
    else if ((m = t.match(/^[-*•]\s+(.*)$/))) { if (list === null) list = ""; list += `<li>${inlineHtml(m[1])}</li>`; }
    else { flush(); html += `<p>${inlineHtml(t)}</p>`; }
  }
  flush();
  return html;
}

// Copilote ancré : réponses depuis les vraies données (chiffres point du soir, tickets,
// référentiel, corpus, méthodologie). Glisser-déposer un fichier => analyse + import au corpus.
export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const taRef = useRef(null);

  const copyText = async (text, idx) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* no-op */ }
      ta.remove();
    }
    setCopied(idx);
    setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1600);
  };

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);
  useEffect(() => {
    const onPilot = () => setOpen((o) => !o);
    const onTicket = (e) => {
      const t = e.detail && e.detail.ticket;
      setOpen(true);
      if (t) {
        const sujet = `Le ticket ${t.cle} — « ${t.resume} » est signalé bloquant (${t.dossier}${t.assigne ? " · " + t.assigne : ""}). Donne-moi un plan d'action concret pour le débloquer : ce qui coince, qui solliciter, quoi vérifier, prochaine étape.`;
        setQ(sujet);
        setTimeout(() => { if (taRef.current) { taRef.current.focus(); const L = sujet.length; taRef.current.setSelectionRange(L, L); } }, 80);
      }
    };
    window.addEventListener("cpwire-pilot", onPilot);
    window.addEventListener("cpwire-pilot-ticket", onTicket);
    return () => { window.removeEventListener("cpwire-pilot", onPilot); window.removeEventListener("cpwire-pilot-ticket", onTicket); };
  }, []);

  const push = (m) => setMsgs((prev) => [...prev, m]);
  const patch = (idx, fn) => setMsgs((prev) => prev.map((m, i) => (i === idx ? fn(m) : m)));

  const send = async () => {
    const text = q.trim();
    if (!text || busy) return;
    setQ("");
    const history = msgs
      .filter((m) => !m.error && m.text)
      .slice(-8)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    push({ role: "user", text });
    setBusy(true);
    try {
      const { answer, sources } = await askAssistant(text, history);
      push({ role: "ai", text: answer || "—", sources });
    } catch (e) {
      push({ role: "ai", text: "Indisponible : " + (e.message || e), error: true });
    } finally { setBusy(false); }
  };

  const handleFile = async (file) => {
    if (!file || busy) return;
    push({ role: "user", text: "📎 " + file.name });
    setBusy(true);
    try {
      const data = await analyzeForAssistant(file, q.trim());
      setQ("");
      if (data.error) { push({ role: "ai", text: data.error, error: true }); return; }
      const dossiers = data.dossiers || [];
      push({
        role: "ai",
        text: data.answer || "—",
        importable: { note: data.note || "", filename: data.filename || file.name, dossiers, dossier: data.guess || dossiers[0] || "", imported: false },
      });
    } catch (e) {
      push({ role: "ai", text: "Analyse impossible : " + (e.message || e), error: true });
    } finally { setBusy(false); }
  };

  const doImport = async (idx) => {
    const m = msgs[idx];
    if (!m || !m.importable || !m.importable.dossier) return;
    try {
      await importToCorpus(m.importable.dossier, m.importable.note);
      patch(idx, (x) => ({ ...x, importable: { ...x.importable, imported: true } }));
    } catch (e) {
      push({ role: "ai", text: "Import impossible : " + (e.message || e), error: true });
    }
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); };

  const exportConv = () => {
    if (!msgs.length) return;
    const now = new Date();
    const dt = now.toLocaleString("fr-FR");
    const body = msgs.filter((m) => m.text).map((m) =>
      m.role === "user"
        ? `<div class="q"><span class="who">Vous</span><div class="qt">${inlineHtml(m.text).replace(/\n/g, "<br>")}</div></div>`
        : `<div class="a"><span class="who cop">Copilote</span><div class="at">${richToHtml(m.text)}</div></div>`
    ).join("");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>cp|WIRE — Copilote</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--navy:#2E2A5D;--indigo:#4B3F8F;--gold:#A8884E;--soft:#F5F2FC;--ink:#1F1B33;--muted:#6E6A86;--line:#e7e5f1}
*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:var(--ink);margin:0;font-size:13px;line-height:1.55}
.hd{background:linear-gradient(135deg,var(--navy),var(--indigo));color:#fff;padding:22px 30px;display:flex;align-items:center;justify-content:space-between}
.hd .br{font-family:Poppins,sans-serif;font-weight:800;font-size:20px;letter-spacing:.5px}.hd .br b{color:#ff7a45}
.hd .sub{font-size:10px;color:rgba(255,255,255,.7);margin-top:3px;letter-spacing:2px;text-transform:uppercase}
.hd .meta{text-align:right;font-size:11px;color:rgba(255,255,255,.85)}
.wrap{padding:26px 30px;max-width:760px}
.q{margin:0 0 6px}.a{margin:0 0 18px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.who{display:inline-block;font-family:Poppins,sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold);margin-bottom:5px}
.who.cop{color:var(--indigo)}
.qt{background:var(--soft);border-radius:8px;padding:9px 12px;font-weight:600}
.at h4{font-family:Poppins,sans-serif;color:var(--navy);font-size:13px;margin:12px 0 4px}
.at p{margin:5px 0}.at ul{margin:5px 0;padding-left:20px}.at li{margin:2px 0}
.at blockquote{border-left:3px solid var(--gold);background:var(--soft);margin:8px 0;padding:8px 12px;border-radius:0 6px 6px 0}
.at code{background:#f0eef7;border:1px solid #e1ddf0;border-radius:4px;padding:0 4px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--indigo)}
.ft{padding:14px 30px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}
@media print{.hd,.qt,.at blockquote{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="hd"><div><div class="br">cp<b>|</b>WIRE</div><div class="sub">Copilote de pilotage</div></div><div class="meta">Conversation<br>${dt}</div></div>
<div class="wrap">${body}</div>
<div class="ft">Document généré par cp|WIRE — usage interne Armonie Group · Confidentiel</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.open(); w.document.write(html); w.document.close(); w.focus();
      setTimeout(() => { try { w.print(); } catch (e) { /* l'utilisateur imprimera manuellement */ } }, 450);
    } else {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `Copilote_${now.toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
  };

  const examples = ["Où en est Tafanel ?", "Qu'est-ce qui est en retard ?", "PTAF-69 est bloqué, t'en penses quoi ?"];

  return (
    <>
      {open && (
        <div className="cwa-panel" role="dialog" aria-label="Copilote cp|WIRE"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
          onDrop={onDrop}>
          <div className="cwa-hd">
            <img className="cwa-hd-av" src={PILOT_DATA_URI} alt="" />
            <div className="cwa-hd-tx">
              <div className="cwa-hd-t">Votre copilote</div>
              <div className="cwa-hd-s">Bent to Fly.</div>
            </div>
            <button className="cwa-hd-ic" onClick={exportConv} disabled={!msgs.length} title="Exporter en PDF (charte Armonie)" aria-label="Exporter">⤓</button>
            <button className="cwa-hd-x" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
          </div>

          <div className="cwa-body">
            {msgs.length === 0 && (
              <div className="cwa-hint">
                Pose une question sur ton périmètre, ou <b>glisse un fichier</b> ici (CSV, TXT, JSON, MD, XLSX, Word, PDF) pour que je l'analyse et l'ajoute à la base.
                <div className="cwa-ex">
                  {examples.map((ex) => <button key={ex} className="cwa-ex-b" onClick={() => setQ(ex)}>{ex}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`cwa-msg ${m.role}`}>
                <div className={`cwa-bub ${m.error ? "err" : ""}`}>{m.role === "ai" && !m.error ? renderRich(m.text) : m.text}</div>
                {m.role === "ai" && !m.error && (
                  <button className="cwa-copy" onClick={() => copyText(m.text, i)} title="Copier la réponse" aria-label="Copier la réponse dans le presse-papier">
                    {copied === i ? "✓ Copié" : "⧉ Copier"}
                  </button>
                )}
                {m.role === "ai" && m.sources && m.sources.tickets && m.sources.tickets.length > 0 && (
                  <div className="cwa-src">
                    <span className="cwa-src-l">Sources :</span>
                    {m.sources.tickets.slice(0, 12).map((k) => <span key={k} className="cwa-chip">{k}</span>)}
                    {m.sources.tickets.length > 12 ? <span className="cwa-more">+{m.sources.tickets.length - 12}</span> : null}
                  </div>
                )}
                {m.importable && (
                  m.importable.imported ? (
                    <div className="cwa-imp ok">✓ Ajouté à la base — {m.importable.dossier}</div>
                  ) : (
                    <div className="cwa-imp">
                      <span>Ajouter au corpus :</span>
                      <select value={m.importable.dossier} onChange={(e) => patch(i, (x) => ({ ...x, importable: { ...x.importable, dossier: e.target.value } }))}>
                        {(m.importable.dossiers.length ? m.importable.dossiers : [m.importable.dossier].filter(Boolean)).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <button onClick={() => doImport(i)} disabled={!m.importable.dossier}>📥 Ajouter</button>
                    </div>
                  )
                )}
              </div>
            ))}
            {busy && <div className="cwa-msg ai"><div className="cwa-bub cwa-typing">●●●</div></div>}
            <div ref={endRef} />
          </div>

          {drag && <div className="cwa-drop">Dépose ton fichier — je l'analyse</div>}

          <div className="cwa-input">
            <button className="cwa-clip" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} title="Joindre un fichier" aria-label="Joindre">📎</button>
            <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <textarea ref={taRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} rows={1} placeholder="Pose ta question…" />
            <button className="cwa-send" onClick={send} disabled={busy || !q.trim()} aria-label="Envoyer">➤</button>
          </div>
        </div>
      )}
    </>
  );
}
