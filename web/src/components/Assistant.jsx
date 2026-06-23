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
    push({ role: "user", text });
    setBusy(true);
    try {
      const { answer, sources } = await askAssistant(text);
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
    const lines = msgs.map((m) => (m.role === "user" ? "VOUS : " : "COPILOTE : ") + m.text + (m.importable ? `\n(fiche : ${m.importable.note})` : "")).join("\n\n");
    const blob = new Blob([`Copilote cp|WIRE — conversation du ${new Date().toLocaleString("fr-FR")}\n\n${lines}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Copilote_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
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
            <button className="cwa-hd-ic" onClick={exportConv} disabled={!msgs.length} title="Exporter la conversation" aria-label="Exporter">⤓</button>
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
