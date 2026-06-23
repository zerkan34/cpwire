import React, { useState, useRef, useEffect } from "react";
import { askAssistant, analyzeForAssistant, importToCorpus } from "../api.js";
import { PILOT_DATA_URI } from "../pilot.js";

// Copilote ancré : réponses depuis les vraies données (chiffres point du soir, tickets,
// référentiel, corpus, méthodologie). Glisser-déposer un fichier => analyse + import au corpus.
export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);
  useEffect(() => {
    const onPilot = () => setOpen((o) => !o);
    window.addEventListener("cpwire-pilot", onPilot);
    return () => window.removeEventListener("cpwire-pilot", onPilot);
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
              <div className="cwa-hd-s">Ancré sur Jira — jamais inventé</div>
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
                <div className={`cwa-bub ${m.error ? "err" : ""}`}>{m.text}</div>
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
            <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} rows={1} placeholder="Pose ta question…" />
            <button className="cwa-send" onClick={send} disabled={busy || !q.trim()} aria-label="Envoyer">➤</button>
          </div>
        </div>
      )}
    </>
  );
}
