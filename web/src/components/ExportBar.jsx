import React, { useState } from "react";
import { printHtml, downloadHtml, htmlToText, copyText, mailDraft } from "../utils.js";

// Barre d'actions « Exporter / partager » : PDF, téléchargement, copie, e-mail.
// buildHtml : fonction () => string renvoyant le document HTML complet (calculé au clic).
export default function ExportBar({ buildHtml, filename = "document.html", subject = "Document cp|WIRE" }) {
  const [copied, setCopied] = useState(false);
  const onPdf = () => printHtml(buildHtml());
  const onDl = () => downloadHtml(buildHtml(), filename);
  const onCopy = async () => { const ok = await copyText(htmlToText(buildHtml())); setCopied(ok); setTimeout(() => setCopied(false), 1800); };
  const onMail = () => mailDraft(subject, htmlToText(buildHtml()));
  return (
    <div className="export-bar">
      <span className="eb-lbl">Exporter / partager</span>
      <button className="btn-line sm" onClick={onPdf} title="Ouvre l'aperçu d'impression — choisis « Enregistrer en PDF »">PDF</button>
      <button className="btn-line sm" onClick={onDl} title="Télécharger le document">Télécharger</button>
      <button className="btn-line sm" onClick={onCopy} title="Copier le texte">{copied ? "✓ Copié" : "Copier"}</button>
      <button className="btn-line sm" onClick={onMail} title="Préparer un e-mail">E-mail</button>
    </div>
  );
}
