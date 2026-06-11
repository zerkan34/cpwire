import React, { useState, useRef, useMemo } from "react";
import { genMeetingReport, genMeetingPrep } from "../api.js";
import DocPreview from "./DocPreview.jsx";

const SUJETS = [
  "Point d'avancement",
  "Comité de pilotage (COPIL)",
  "Point technique",
  "Recette / validation",
  "Cadrage / lancement",
  "Rétrospective",
  "Suivi des actions",
  "Autre",
];

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
  const [doc, setDoc] = useState(null);
  const fileRef = useRef();

  const onFile = (f) => {
    if (!f) return;
    setFileName(f.name); setFileMsg("");
    const textLike = /^(text\/|application\/json)/.test(f.type || "") || /\.(txt|md|markdown|csv|json|log|rtf)$/i.test(f.name);
    if (textLike) {
      const r = new FileReader();
      r.onload = () => setImportedText(String(r.result || ""));
      r.onerror = () => setFileMsg("Lecture du fichier impossible.");
      r.readAsText(f);
    } else {
      setImportedText("");
      setFileMsg("Format non texte (PDF/Word) : colle le contenu dans les notes ci-dessous. La lecture directe fonctionne pour .txt, .md, .csv, .json.");
    }
  };

  const generate = async () => {
    if (!dossier) { setErr("Choisis d'abord un client."); return; }
    setBusy(true); setErr("");
    try {
      const sujet = precision.trim() ? `${type} — ${precision.trim()}` : type;
      const { html } = await genMeetingPrep({ dossier, sujet, type, notes, importedText });
      setDoc({ title: `Préparation — ${dossier}`, html, dossier, filename: `Prep_reunion_${dossier.replace(/\s+/g, "_")}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel">
      <p className="hint" style={{ marginTop: 0 }}>
        Choisis le client et le sujet : cp|WIRE prépare d'abord le <b>contexte</b> (point, qui travaille dessus, où on en est, points de friction) à partir de Jira, puis structure ton ordre du jour. Importe tes notes (.txt/.md) pour que l'IA les mette en forme. Exportable en PDF à la charte.
      </p>

      <div className="filter-grp" style={{ borderBottom: 0, paddingBottom: 0 }}>
        <span className="fg-lbl">Client</span>
        <select className="fselect" value={dossier} onChange={(e) => setDossier(e.target.value)}>
          <option value="">— choisir —</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="fg-lbl" style={{ marginLeft: 10 }}>Sujet</span>
        <select className="fselect" value={type} onChange={(e) => setType(e.target.value)}>
          {SUJETS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Précisions sur le sujet (optionnel)</label>
        <input type="text" value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Ex. validation du module facturation, planning de bascule…" />
      </div>

      <div className="field">
        <label>Importer un fichier de notes — lu et structuré par l'IA (.txt, .md, .csv, .json)</label>
        <div className="drop" onClick={() => fileRef.current.click()}>
          {fileName ? `📄 ${fileName}` : "Cliquer pour importer un fichier de notes"}
        </div>
        <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.log,.rtf,text/*" style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files[0])} />
        {fileMsg && <div className="warn-note" style={{ marginTop: 8 }}>{fileMsg}</div>}
        {importedText && <div className="hint">✓ {importedText.length} caractères importés — seront structurés dans l'ordre du jour.</div>}
      </div>

      <div className="field">
        <label>Notes complémentaires (optionnel)</label>
        <textarea className="ta" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Points que tu veux aborder, questions, décisions attendues…" />
      </div>

      <div className="row-actions">
        <button className="btn-solid" onClick={generate} disabled={busy}>
          {busy ? "Préparation en cours…" : "Préparer la réunion"}
        </button>
      </div>
      {err && <div className="warn-note">{err}</div>}
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </div>
  );
}

function CompteRendu() {
  const [titre, setTitre] = useState("");
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
      fd.append("titre", titre);
      fd.append("participants", participants);
      fd.append("notes", notes);
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
    <div className="panel">
      <div className="field">
        <label>Objet de la réunion</label>
        <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. COPIL DIAPAR — mars 2026" />
      </div>
      <div className="field">
        <label>Participants</label>
        <input type="text" value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Ex. M. Barteldt (DIAPAR), M. Senebier (Armonie)…" />
      </div>
      <div className="field">
        <label>Notes prises en séance</label>
        <textarea className="ta" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tes notes brutes : points évoqués, décisions, actions…" />
      </div>
      <div className="field">
        <label>Enregistrement (dictaphone) — transcrit automatiquement si la transcription est configurée</label>
        <div className="drop" onClick={() => audioRef.current.click()}>
          {audio ? `🎙️ ${audio.name}` : "Cliquer pour ajouter un fichier audio (m4a, mp3, webm…)"}
        </div>
        <input ref={audioRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => setAudio(e.target.files[0] || null)} />
      </div>
      <div className="field">
        <label>Transcription (collée manuellement si pas de service audio)</label>
        <textarea className="ta" value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Optionnel : colle ici une transcription si tu n'as pas branché de service de transcription." />
      </div>
      <div className="field">
        <label>Images (tableau blanc, slides…) — lues par l'IA</label>
        <div className="drop" onClick={() => imgRef.current.click()}>Cliquer pour ajouter des images</div>
        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }}
          onChange={(e) => setImages(Array.from(e.target.files || []))} />
        {images.length > 0 && (
          <div className="chips-files">{images.map((im, i) => <span className="chip-file" key={i}>🖼️ {im.name}</span>)}</div>
        )}
      </div>
      <div className="row-actions">
        <button className="btn-solid" onClick={() => generate(false)} disabled={busy}>
          {busy ? "Rédaction du compte rendu…" : "Générer le compte rendu"}
        </button>
        <button className="btn-line" onClick={() => generate(true)} disabled={busy || !notes.trim()}
          title="Refait une passe IA à partir de tes notes pour un rendu plus clair et structuré">
          ↻ Regénérer avec l'IA
        </button>
      </div>
      {err && <div className="warn-note">{err}</div>}
      <div className="hint">Le compte rendu est généré à ta charte, puis modifiable et téléchargeable.</div>
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </div>
  );
}

export default function Meetings({ issues = [] }) {
  const [mode, setMode] = useState("prep");
  return (
    <>
      <div className="section-title">Réunions</div>
      <div className="ctabs">
        <button className={`ctab ${mode === "prep" ? "active" : ""}`} onClick={() => setMode("prep")}>Préparation réunion</button>
        <button className={`ctab ${mode === "cr" ? "active" : ""}`} onClick={() => setMode("cr")}>Compte rendu de réunion</button>
      </div>
      {mode === "prep" ? <PrepReunion issues={issues} /> : <CompteRendu />}
    </>
  );
}
