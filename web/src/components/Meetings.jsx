import React, { useState, useRef, useMemo, useEffect } from "react";
import { genMeetingReport, genMeetingPrep } from "../api.js";
import { buildSimpleDoc, esc } from "../utils.js";
import { TEAM } from "../team.js";
import ExportBar from "./ExportBar.jsx";
import { useReadOnly } from "../readonly.js";

const SUJETS = [
  "Point d'avancement", "Comité de pilotage (COPIL)", "Point technique",
  "Recette / validation", "Cadrage / lancement", "Rétrospective", "Suivi des actions", "Autre",
];

function pillCls(s) { return s === "Bloqué" ? "block" : s === "En cours" ? "prog" : s === "Terminé" ? "done" : "todo"; }
function agendaToHtml(text) {
  const lines = String(text || "").split(/\n/);
  let html = "", inUl = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (inUl) { html += "</ul>"; inUl = false; } continue; }
    if (line.startsWith("•") || line.startsWith("-")) {
      if (!inUl) { html += "<ul>"; inUl = true; }
      html += `<li>${esc(line.replace(/^[•\-]\s*/, ""))}</li>`;
    } else {
      if (inUl) { html += "</ul>"; inUl = false; }
      if (/[:：]\s*$/.test(line) && line.length < 60) html += `<h3>${esc(line.replace(/[:：]\s*$/, ""))}</h3>`;
      else html += `<p>${esc(line)}</p>`;
    }
  }
  if (inUl) html += "</ul>";
  return html;
}

function PrepReunion({ issues }) {
  const clients = useMemo(() => Array.from(new Set(issues.map((i) => i.dossier).filter(Boolean))).sort(), [issues]);
  const [dossier, setDossier] = useState("");
  const [type, setType] = useState(SUJETS[0]);
  const [precision, setPrecision] = useState("");
  const [notes, setNotes] = useState("");
  const [importedText, setImportedText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileMsg, setFileMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  // Données + champs éditables du composer
  const [data, setData] = useState(null);
  const [comment, setComment] = useState("");
  const [agendaText, setAgendaText] = useState("");
  const [whoChecked, setWhoChecked] = useState({});
  const [delivChecked, setDelivChecked] = useState({});
  const [fricChecked, setFricChecked] = useState({});
  const [participants, setParticipants] = useState([]);

  const onFile = (f) => {
    if (!f) return;
    setFileName(f.name); setFileMsg("");
    const textLike = /^(text\/|application\/json)/.test(f.type || "") || /\.(txt|md|markdown|csv|json|log|rtf)$/i.test(f.name);
    if (textLike) { const r = new FileReader(); r.onload = () => setImportedText(String(r.result || "")); r.onerror = () => setFileMsg("Lecture du fichier impossible."); r.readAsText(f); }
    else { setImportedText(""); setFileMsg("Format non texte (PDF/Word) : colle le contenu dans les notes. Lecture directe : .txt, .md, .csv, .json."); }
  };

  const generate = async () => {
    if (!dossier) { setErr("Choisis d'abord un client."); return; }
    setBusy(true); setErr("");
    try {
      const sujet = precision.trim() ? `${type} — ${precision.trim()}` : type;
      const res = await genMeetingPrep({ dossier, sujet, type, notes, importedText });
      const d = res.data || {};
      setData(d);
      setComment(d.contextText || "");
      setAgendaText(d.agendaText || "");
      const all = (arr, key) => { const o = {}; (arr || []).forEach((x) => { o[x[key]] = true; }); return o; };
      setWhoChecked(all(d.who, "name"));
      setDelivChecked(all(d.deliverables, "cle"));
      setFricChecked(all(d.frictions, "cle"));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const kpiRow = useMemo(() => {
    if (!data) return "";
    const kpi = (l, v) => `<div style="flex:1;min-width:82px;border:1px solid #e7e5f1;border-radius:10px;padding:9px 8px;text-align:center"><div style="font-family:'Poppins',sans-serif;font-weight:800;font-size:18px;color:#2c2945">${v}</div><div style="font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;color:#74718a">${l}</div></div>`;
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px">${kpi("Avancement", data.avancement + "%")}${kpi("En cours", data.active)}${kpi("En recette", data.recette)}${kpi("Bloquants", data.bloquants)}${kpi("En retard", data.retard)}</div>`;
  }, [data]);

  const buildDocHtml = () => {
    if (!data) return "";
    let body = `<h2>Point &amp; contexte</h2>${kpiRow}`;
    if (comment.trim()) body += `<p>${esc(comment).replace(/\n/g, "<br>")}</p>`;
    const parts = participants.filter((p) => p.person || p.topic);
    if (parts.length) {
      body += `<h3>Participants &amp; répartition</h3><table><tr><th>Personne</th><th>Rôle</th><th>Sujet / responsabilité</th></tr>` +
        parts.map((p) => { const m = TEAM.find((t) => t.name === p.person); return `<tr><td><b>${esc(p.person || "—")}</b></td><td>${esc(m ? m.role : "")}</td><td>${esc(p.topic || "")}</td></tr>`; }).join("") + `</table>`;
    }
    const who = (data.who || []).filter((w) => whoChecked[w.name] !== false);
    if (who.length) body += `<h3>Qui travaille dessus</h3><table><tr><th>Personne</th><th>Tickets actifs</th></tr>${who.map((w) => `<tr><td>${esc(w.name)}</td><td><b>${w.count}</b></td></tr>`).join("")}</table>`;
    const dl = (data.deliverables || []).filter((d) => delivChecked[d.cle] !== false);
    body += `<h3>Où on en est — derniers livrables</h3>`;
    body += dl.length ? `<table><tr><th>Clé</th><th>Projet</th><th>Livrable</th></tr>${dl.map((d) => `<tr><td>${esc(d.cle)}</td><td>${esc(d.dossier)}</td><td>${esc(d.resume)}</td></tr>`).join("")}</table>` : `<p>—</p>`;
    const fr = (data.frictions || []).filter((f) => fricChecked[f.cle] !== false);
    if (fr.length) body += `<h3>⚠ Points de friction</h3><table><tr><th>Clé</th><th>Sujet</th><th>Statut</th></tr>${fr.map((f) => `<tr><td>${esc(f.cle)}</td><td>${esc(f.resume)}</td><td><span class="pill ${pillCls(f.statut)}">${esc(f.statut)}</span></td></tr>`).join("")}</table>`;
    body += `<h2>Réunion — ${esc(data.sujet)}</h2>${agendaToHtml(agendaText)}`;
    return buildSimpleDoc({
      kicker: "Préparation de réunion", title: `Préparation — ${data.dossier}`, subtitle: `${data.sujet} · équipe Armonie`,
      cartouche: [["Client / dossier", `${data.dossier} — équipe Armonie`], ["Chef de projet", "Nicolas Durand"], ["Sujet", data.sujet], ["Date", new Date().toLocaleDateString("fr-FR")]],
      bodyHtml: body, etabliPar: "Nicolas Durand",
    });
  };

  const tog = (setter) => (key) => setter((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }));
  const togWho = tog(setWhoChecked), togDeliv = tog(setDelivChecked), togFric = tog(setFricChecked);
  const addPart = () => setParticipants((p) => [...p, { person: "", topic: "" }]);
  const setPart = (idx, field, val) => setParticipants((p) => p.map((x, i) => (i === idx ? { ...x, [field]: val } : x)));
  const delPart = (idx) => setParticipants((p) => p.filter((_, i) => i !== idx));

  return (
    <div className="meet-card">
      <div className="meet-hd"><span>Préparation de réunion</span></div>
      <div className="meet-bd">
        <p className="hint" style={{ marginTop: 0 }}>
          cp|WIRE prépare le <b>contexte</b> depuis Jira (point, qui travaille dessus, livrables, frictions). Ensuite <b>tout est modifiable</b> : ton commentaire, les participants, ce que tu coches, l'ordre du jour — prêt à exporter ou coller dans un e-mail.
        </p>

        <div className="meet-grid2">
          <div className="field">
            <label>Client</label>
            <select className="fselect block" value={dossier} onChange={(e) => setDossier(e.target.value)}>
              <option value="">— choisir un client —</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sujet de la réunion</label>
            <select className="fselect block" value={type} onChange={(e) => setType(e.target.value)}>
              {SUJETS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Précisions sur le sujet (optionnel)</label>
          <input type="text" value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Ex. validation du module facturation…" />
        </div>
        <div className="field">
          <label>Importer un fichier de notes (.txt, .md, .csv, .json)</label>
          <div className="drop" onClick={() => fileRef.current.click()}>{fileName ? `📄 ${fileName}` : "Cliquer pour importer un fichier de notes"}</div>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.log,.rtf,text/*" style={{ display: "none" }} onChange={(e) => onFile(e.target.files[0])} />
          {fileMsg && <div className="warn-note" style={{ marginTop: 8 }}>{fileMsg}</div>}
          {importedText && <div className="hint">✓ {importedText.length} caractères importés.</div>}
        </div>
        <div className="field">
          <label>Notes (l'IA structure l'ordre du jour à partir de ça)</label>
          <textarea className="ta" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Points à aborder, questions, décisions attendues…" />
        </div>
        <div className="row-actions">
          <button className="btn-solid" onClick={generate} disabled={busy}>
            {busy ? "Génération…" : (data ? "↻ Régénérer le contexte (IA)" : "✨ Préparer avec l'IA")}
          </button>
        </div>
        {err && <div className="warn-note">{err}</div>}

        {data && (
          <div className="prep-edit">
            <div className="prep-edit-h">Composer — tout est modifiable</div>

            <div className="field">
              <label>Commentaire / contexte (après les statistiques)</label>
              <textarea className="ta" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ton mot de contexte pour la réunion…" />
            </div>

            <div className="field">
              <label>Participants &amp; répartition (qui s'occupe de quoi)</label>
              {participants.map((p, idx) => (
                <div className="part-row" key={idx}>
                  <select className="fselect" value={p.person} onChange={(e) => setPart(idx, "person", e.target.value)}>
                    <option value="">— personne —</option>
                    {TEAM.map((t) => <option key={t.name} value={t.name}>{t.name} — {t.role}</option>)}
                  </select>
                  <input type="text" value={p.topic} onChange={(e) => setPart(idx, "topic", e.target.value)} placeholder="Sujet / responsabilité" />
                  <button className="part-del" title="Retirer" onClick={() => delPart(idx)}>×</button>
                </div>
              ))}
              <button className="btn-line sm" onClick={addPart}>+ Ajouter une personne</button>
            </div>

            {data.deliverables && data.deliverables.length > 0 && (
              <div className="field">
                <label>Derniers livrables — coche ceux à inclure</label>
                <div className="chk-list">
                  {data.deliverables.map((d) => (
                    <label className="chk" key={d.cle}>
                      <input type="checkbox" checked={delivChecked[d.cle] !== false} onChange={() => togDeliv(d.cle)} />
                      <span><b>{d.cle}</b> — {d.resume}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {data.frictions && data.frictions.length > 0 && (
              <div className="field">
                <label>Points de friction — coche ceux à inclure</label>
                <div className="chk-list">
                  {data.frictions.map((f) => (
                    <label className="chk" key={f.cle}>
                      <input type="checkbox" checked={fricChecked[f.cle] !== false} onChange={() => togFric(f.cle)} />
                      <span><b>{f.cle}</b> — {f.resume} <span className={`pill ${pillCls(f.statut)}`}>{f.statut}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {data.who && data.who.length > 0 && (
              <div className="field">
                <label>Qui travaille dessus — coche ceux à inclure</label>
                <div className="chk-list">
                  {data.who.map((w) => (
                    <label className="chk" key={w.name}>
                      <input type="checkbox" checked={whoChecked[w.name] !== false} onChange={() => togWho(w.name)} />
                      <span>{w.name} <span className="muted">· {w.count} ticket(s)</span></span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label>Ordre du jour (modifiable — une ligne par point, « • » pour une puce)</label>
              <textarea className="ta" style={{ minHeight: 120 }} value={agendaText} onChange={(e) => setAgendaText(e.target.value)} />
            </div>

            <div className="prep-result-hd">
              <span className="prep-result-t">Aperçu (mis à jour en direct)</span>
            </div>
            <iframe className="doc-frame" srcDoc={buildDocHtml()} title="aperçu du document" />
            <ExportBar buildHtml={buildDocHtml} filename={`Prep_reunion_${(data.dossier || "client").replace(/\s+/g, "_")}.html`} subject={`Préparation réunion — ${data.dossier}`} />
            <p className="hint" style={{ marginTop: 6 }}>Export PDF / e-mail à la charte Armonie. « Régénérer le contexte » relance l'IA sur les données Jira (tes modifications de commentaire/agenda seront réécrites).</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultPanel({ doc, busy, onRegen }) {
  if (!doc) return null;
  return (
    <div className="prep-result">
      <div className="prep-result-hd">
        <span className="prep-result-t">Aperçu</span>
        <button className="btn-line sm" onClick={onRegen} disabled={busy}>{busy ? "Régénération…" : "↻ Régénérer avec l'IA"}</button>
      </div>
      <iframe className="doc-frame" srcDoc={doc.html} title="aperçu du document" />
      <ExportBar buildHtml={() => doc.html} filename={doc.filename} subject={doc.title} />
    </div>
  );
}

function CompteRendu() {
  const [titre, setTitre] = useState("");
  const [equipe, setEquipe] = useState("TMA Armonie");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState(null);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doc, setDoc] = useState(null);
  const audioRef = useRef();
  const imgRef = useRef();

  const generate = async (regen = false) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("titre", titre); fd.append("participants", participants); fd.append("notes", notes);
      fd.append("equipe", equipe);
      if (regen) fd.append("regenerate", "1");
      if (transcript) fd.append("transcript", transcript);
      if (audio) fd.append("audio", audio);
      images.forEach((im) => fd.append("images", im));
      const { html, transcript: tr } = await genMeetingReport(fd);
      if (tr && !transcript) setTranscript(tr);
      setDoc({ title: titre || "Compte rendu de réunion", html, filename: `CR_reunion_${(titre || "reunion").replace(/\s+/g, "_")}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="meet-card">
      <div className="meet-hd"><span>Compte rendu de réunion</span></div>
      <div className="meet-bd">
        <div className="meet-grid2">
          <div className="field"><label>Objet de la réunion</label>
            <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. COPIL DIAPAR — mars 2026" /></div>
          <div className="field"><label>Participants</label>
            <input type="text" value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Ex. M. Barteldt (DIAPAR), M. Senebier (Armonie)…" /></div>
        </div>
        <div className="field"><label>Équipe / périmètre — modifiable (ex. « Projet Armonie » pour Tafanel, qui n'est pas de la TMA)</label>
          <input type="text" value={equipe} onChange={(e) => setEquipe(e.target.value)} placeholder="Ex. TMA Armonie" /></div>
        <div className="field"><label>Notes prises en séance</label>
          <textarea className="ta" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tes notes brutes : points évoqués, décisions, actions…" /></div>
        <div className="field"><label>Enregistrement (dictaphone) — transcrit si configuré</label>
          <div className="drop" onClick={() => audioRef.current.click()}>{audio ? `🎙️ ${audio.name}` : "Cliquer pour ajouter un fichier audio"}</div>
          <input ref={audioRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => setAudio(e.target.files[0] || null)} /></div>
        <div className="field"><label>Transcription (collée manuellement si pas de service audio)</label>
          <textarea className="ta" value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Optionnel." /></div>
        <div className="field"><label>Images (tableau blanc, slides…) — lues par l'IA</label>
          <div className="drop" onClick={() => imgRef.current.click()}>Cliquer pour ajouter des images</div>
          <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => setImages(Array.from(e.target.files || []))} />
          {images.length > 0 && <div className="chips-files">{images.map((im, i) => <span className="chip-file" key={i}>🖼️ {im.name}</span>)}</div>}</div>
        <div className="row-actions">
          <button className="btn-solid" onClick={() => generate(false)} disabled={busy}>{busy ? "Rédaction…" : (doc ? "↻ Régénérer avec l'IA" : "✨ Générer le compte rendu")}</button>
        </div>
        {err && <div className="warn-note">{err}</div>}
        <ResultPanel doc={doc} busy={busy} onRegen={() => generate(true)} />
      </div>
    </div>
  );
}

export default function Meetings({ issues = [] }) {
  const ro = useReadOnly();
  const [mode, setMode] = useState("prep");
  return (
    <>
      <div className="meet-hero">
        <span className="meet-hero-k">Espace réunions</span>
        <h2>{mode === "cr" ? "Compte rendu de réunion" : "Préparation de réunion"}</h2>
        <p>{mode === "cr"
          ? "Transforme des notes brutes — texte, audio, photos de tableau — en compte rendu à la charte Armonie."
          : "cp|WIRE assemble le contexte depuis Jira : point, intervenants, livrables, frictions. Tu ajustes tout, puis tu exportes ou colles dans un e-mail."}</p>
        {!ro && (
          <div className="meet-seg" role="tablist">
            <button className={mode === "prep" ? "on" : ""} onClick={() => setMode("prep")}>Préparation</button>
            <button className={mode === "cr" ? "on" : ""} onClick={() => setMode("cr")}>Compte rendu</button>
          </div>
        )}
      </div>
      {(ro || mode === "prep") ? <PrepReunion issues={issues} /> : <CompteRendu />}
    </>
  );
}
