import React, { useState, useRef, useEffect } from "react";
import { askAssistant, analyzeForAssistant, importToCorpus } from "../api.js";
import { PILOT_DATA_URI } from "../pilot.js";
import { charterDoc, cover } from "../charter.js";
import { printHtml } from "../utils.js";

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
  const [maxed, setMaxed] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(null);
  const [pendingAsk, setPendingAsk] = useState(null);
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
    // Ouvre le copilote ET lance directement l'analyse (déclenché par un logo copilote sur un conteneur).
    const onAsk = (e) => { const p = e.detail && e.detail.prompt; setOpen(true); if (p) setPendingAsk(p); };
    window.addEventListener("cpwire-pilot", onPilot);
    window.addEventListener("cpwire-pilot-ticket", onTicket);
    window.addEventListener("cpwire-pilot-ask", onAsk);
    return () => { window.removeEventListener("cpwire-pilot", onPilot); window.removeEventListener("cpwire-pilot-ticket", onTicket); window.removeEventListener("cpwire-pilot-ask", onAsk); };
  }, []);

  // Consomme une demande d'analyse forcée (envoi automatique).
  useEffect(() => { if (pendingAsk != null) { const p = pendingAsk; setPendingAsk(null); send(p); } /* eslint-disable-next-line */ }, [pendingAsk]);

  const push = (m) => setMsgs((prev) => [...prev, m]);
  const patch = (idx, fn) => setMsgs((prev) => prev.map((m, i) => (i === idx ? fn(m) : m)));

  const send = async (forced) => {
    const text = (typeof forced === "string" ? forced : q).trim();
    if (!text || busy) return;
    if (typeof forced !== "string") setQ("");
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
    const body = msgs.filter((m) => m.text).map((m) =>
      m.role === "user"
        ? `<div class="cv-q"><div class="cv-who">Vous</div><div class="cv-qt">${inlineHtml(m.text).replace(/\n/g, "<br>")}</div></div>`
        : `<div class="cv-a"><div class="cv-who cop">Natacha</div><div class="cv-at">${richToHtml(m.text)}</div></div>`
    ).join("");
    const extraCss = `
      .cv-q { margin: 0 0 6px; } .cv-a { margin: 0 0 16px; padding-bottom: 14px; border-bottom: 1px solid #E7E5F1; }
      .cv-who { font-family: Poppins, Inter, sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #A8884E; margin-bottom: 5px; }
      .cv-who.cop { color: #4B3F8F; }
      .cv-qt { background: #F5F2FC; border-radius: 8px; padding: 9px 12px; font-weight: 600; color: #1F1B33; }
      .cv-at h4 { font-family: Poppins, Inter, sans-serif; color: #2E2A5D; font-size: 13px; margin: 12px 0 4px; }
      .cv-at p { margin: 5px 0; } .cv-at ul { margin: 5px 0; padding-left: 20px; } .cv-at li { margin: 2px 0; }
      .cv-at blockquote { border-left: 3px solid #A8884E; background: #F5F2FC; margin: 8px 0; padding: 8px 12px; border-radius: 0 6px 6px 0; }
      .cv-at code { background: #f0eef7; border: 1px solid #e1ddf0; border-radius: 4px; padding: 0 4px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #4B3F8F; }
    `;
    const html = charterDoc({
      docTitle: "Natacha — cp|WIRE",
      extraCss,
      coverHtml: cover({
        kicker: "Hôtesse de pilotage",
        title: "Échange avec Natacha",
        subtitle: "Restitution de conversation",
        meta: new Date().toLocaleString("fr-FR"),
        enBref: "Restitution de l'échange avec Natacha (cp|WIRE), ancré sur les données réelles du portefeuille (zéro invention).",
        etabliPar: "Nicolas Durand",
      }),
      bodyHtml: body,
      footerText: "cp|WIRE · Natacha",
    });
    // PDF à la charte, format PORTRAIT (A4), via le moteur d'impression standard (serveur → navigateur → repli).
    printHtml(html, "Natacha.pdf");
  };

  const examples = ["Où en est Tafanel ?", "Qu'est-ce qui est en retard ?", "PTAF-69 est bloqué, t'en penses quoi ?"];

  return (
    <>
      {open && (
        <div className={`cwa-panel ${maxed ? "maxed" : ""}`} role="dialog" aria-label="Hôtesse Natacha — cp|WIRE"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
          onDrop={onDrop}>
          <div className="cwa-hd">
            <img className="cwa-hd-av" src={PILOT_DATA_URI} alt="" />
            <div className="cwa-hd-tx">
              <div className="cwa-hd-t">Votre hôtesse Natacha</div>
              <div className="cwa-hd-s">Bent to Fly. Standin' by.</div>
            </div>
            <button className="cwa-hd-ic" onClick={() => setMaxed((m) => !m)} title={maxed ? "Réduire" : "Agrandir (plein écran)"} aria-label="Agrandir / réduire">{maxed ? "🗗" : "⤢"}</button>
            <button className="cwa-hd-ic" onClick={exportConv} disabled={!msgs.length} title="Exporter en PDF (charte Armonie, portrait)" aria-label="Exporter">⤓</button>
            <button className="cwa-hd-x" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
          </div>

          <div className="cwa-body">
            {msgs.length === 0 && (
              <div className="cwa-hint">
                Alors pilote ? on s'envole où cette fois… Pose ta question, ou <b>glisse un fichier</b> ici (CSV, TXT, JSON, MD, XLSX, Word, PowerPoint, PDF) et je l'analyse.
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
