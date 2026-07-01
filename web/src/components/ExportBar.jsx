import React, { useState } from "react";
import { printHtml, downloadHtml, htmlToText, copyText, mailDraft } from "../utils.js";

// Barre d'actions « Exporter / partager » : PDF, téléchargement, copie, e-mail.
// buildHtml : fonction () => string renvoyant le document HTML complet (calculé au clic).
export default function ExportBar({ buildHtml, filename = "document.html", subject = "Document cp|WIRE" }) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  const safe = (fn) => () => {
    setErr("");
    try { fn(); } catch (e) {
      console.error("[ExportBar]", e && e.message ? e.message : e); setErr("Action impossible sur ce navigateur."); }
  };
  const onPdf = safe(() => printHtml(buildHtml()));
  const onDl = safe(() => downloadHtml(buildHtml(), filename));
  const onMail = safe(() => mailDraft(subject, htmlToText(buildHtml())));
  const onCopy = async () => {
    setErr("");
    try { const ok = await copyText(htmlToText(buildHtml())); setCopied(ok); if (!ok) setErr("Copie impossible — utilise « Télécharger »."); setTimeout(() => setCopied(false), 1800); }
    catch { setErr("Copie impossible — utilise « Télécharger »."); }
  };

  return (
    <div className="export-bar">
      <span className="eb-lbl">Exporter / partager</span>
      <button className="btn-line sm" onClick={onPdf} title="Génère le PDF (charte Armonie) puis choix de l'emplacement">PDF</button>
      <button className="btn-line sm" onClick={onDl} title="Télécharger le document">Télécharger</button>
      <button className="btn-line sm" onClick={onCopy} title="Copier le texte">{copied ? "✓ Copié" : "Copier"}</button>
      <button className="btn-line sm" onClick={onMail} title="Préparer un e-mail">E-mail</button>
      {err && <span className="eb-err">{err}</span>}
    </div>
  );
}
