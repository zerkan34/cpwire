import React, { useMemo, useState } from "react";
import JSZip from "jszip";
import { buildRecapFiles } from "../recapDoc.js";
import { copyText, htmlToText, mailDraft } from "../utils.js";

// Fenêtre « CR du jour » : le ZIP contient UN FICHIER PAR CLIENT (un CR détaillé chacun).
// Aperçu fidèle (iframe), sélection du client à prévisualiser, et ouverture d'un mail Outlook vide.
export default function DailyCRModal({ issues = [], meName = "Nicolas Durand", onClose }) {
  const { files, human, fileBase } = useMemo(() => buildRecapFiles(issues, { meName }), [issues, meName]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const current = files[sel] || files[0];

  const downloadZip = async () => {
    setBusy(true); setMsg("");
    try {
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f.html));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${fileBase}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setMsg(`ZIP « ${fileBase}.zip » téléchargé — ${files.length} fichier(s), un par client.`);
    } catch (e) { setMsg("Échec de la création du ZIP : " + (e.message || e)); }
    finally { setBusy(false); }
  };

  const openOutlook = () => {
    mailDraft(fileBase, `Bonjour,\n\nVeuillez trouver ci-joint les comptes rendus du ${human} (fichier « ${fileBase}.zip », un CR par client).\n\nCordialement,\n${meName}`);
  };

  const copy = async () => {
    const ok = await copyText(htmlToText(current?.html || ""));
    setCopied(ok); setTimeout(() => setCopied(false), 1800);
    if (!ok) setMsg("Copie impossible — utilise « Télécharger le ZIP ».");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal cr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="x" onClick={onClose}>×</button>
          <div className="k">{fileBase}</div>
          <div className="cr-sub">Compte rendu du jour — un fichier par client, à transférer à la direction</div>
        </div>
        <div className="cr-body">
          <div className="cr-actions">
            <button className="btn-primary" onClick={downloadZip} disabled={busy || !files.length}>{busy ? "Création…" : `📦 Télécharger le ZIP (${files.length} CR)`}</button>
            <button className="btn-line" onClick={openOutlook}>✉️ Ouvrir dans Outlook</button>
            <button className="btn-line" onClick={copy} disabled={!files.length}>{copied ? "✓ Copié" : "Copier ce client"}</button>
          </div>
          <p className="cr-hint">Le ZIP <b>« {fileBase}.zip »</b> contient <b>{files.length} compte{files.length > 1 ? "s" : ""} rendu{files.length > 1 ? "s" : ""}</b> (un par client). Clique <b>Télécharger le ZIP</b>, puis <b>Ouvrir dans Outlook</b> : il ne reste qu'à <b>joindre le ZIP</b>, saisir les destinataires et envoyer. Le mail s'ouvre vide, objet déjà rempli — sur PC comme sur le web.</p>
          {msg && <div className="cr-msg">{msg}</div>}
          {files.length > 1 && (
            <div className="cr-pick">
              <label>Aperçu du client :</label>
              <select value={sel} onChange={(e) => setSel(Number(e.target.value))}>
                {files.map((f, idx) => <option key={f.name} value={idx}>{f.dossier} ({f.count})</option>)}
              </select>
            </div>
          )}
          <div className="cr-preview-wrap">
            <iframe className="cr-preview" srcDoc={current?.html || "<p style='font-family:sans-serif;padding:20px;color:#666'>Aucun ticket à afficher.</p>"} title="Aperçu du compte rendu" />
          </div>
        </div>
      </div>
    </div>
  );
}
