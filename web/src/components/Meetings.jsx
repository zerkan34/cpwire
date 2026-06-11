import React, { useState, useRef } from "react";
import { genMeetingReport } from "../api.js";
import DocPreview from "./DocPreview.jsx";

export default function Meetings() {
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
    <>
      <div className="section-title">Compte rendu de réunion</div>
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
        <div className="hint">Le compte rendu est généré à ta charte, puis modifiable et téléchargeable. Tu pourras l'ajuster avant diffusion.</div>
      </div>
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </>
  );
}
