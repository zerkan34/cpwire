import React, { useMemo, useState } from "react";
import JSZip from "jszip";
import { buildDailyCrHtml } from "../dailyCr.js";
import { copyText, htmlToText, mailDraft } from "../utils.js";

// Fenêtre « CR du jour » : aperçu fidèle (iframe = exactement ce que verra le destinataire),
// téléchargement en ZIP nommé « CR du {date}.zip », et ouverture d'un mail Outlook vide.
export default function DailyCRModal({ issues = [], meName = "Nicolas Durand", onClose }) {
  const { html, human, fileBase } = useMemo(() => buildDailyCrHtml(issues, { meName }), [issues, meName]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const downloadZip = async () => {
    setBusy(true); setMsg("");
    try {
      const zip = new JSZip();
      zip.file(`${fileBase}.html`, html);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${fileBase}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setMsg(`ZIP « ${fileBase}.zip » téléchargé — il se trouve dans tes téléchargements.`);
    } catch (e) { setMsg("Échec de la création du ZIP : " + (e.message || e)); }
    finally { setBusy(false); }
  };

  const openOutlook = () => {
    mailDraft(fileBase, `Bonjour,\n\nVeuillez trouver ci-joint le compte rendu du ${human} (fichier « ${fileBase}.zip »).\n\nCordialement,\n${meName}`);
  };

  const copy = async () => {
    const ok = await copyText(htmlToText(html));
    setCopied(ok); setTimeout(() => setCopied(false), 1800);
    if (!ok) setMsg("Copie impossible — utilise « Télécharger le ZIP ».");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal cr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="x" onClick={onClose}>×</button>
          <div className="k">{fileBase}</div>
          <div className="cr-sub">Compte rendu du jour — à transférer à la direction</div>
        </div>
        <div className="cr-body">
          <div className="cr-actions">
            <button className="btn-primary" onClick={downloadZip} disabled={busy}>{busy ? "Création…" : "📦 Télécharger le ZIP"}</button>
            <button className="btn-line" onClick={openOutlook}>✉️ Ouvrir dans Outlook</button>
            <button className="btn-line" onClick={copy}>{copied ? "✓ Copié" : "Copier le texte"}</button>
          </div>
          <p className="cr-hint">Clique <b>Télécharger le ZIP</b>, puis <b>Ouvrir dans Outlook</b> : il ne reste qu'à <b>joindre le ZIP</b>, saisir les destinataires et envoyer. Le mail s'ouvre vide, objet déjà rempli — sur PC comme sur le web.</p>
          {msg && <div className="cr-msg">{msg}</div>}
          <div className="cr-preview-wrap">
            <iframe className="cr-preview" srcDoc={html} title="Aperçu du compte rendu" />
          </div>
        </div>
      </div>
    </div>
  );
}
