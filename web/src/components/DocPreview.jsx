import React, { useState } from "react";
import { downloadHtml, printHtml } from "../utils.js";
import { shareMail, shareSharePoint } from "../api.js";
import { useModalBack, backOut } from "../modalNav.js";
import { useReadOnly } from "../readonly.js";

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
}

export default function DocPreview({ title, html, filename, dossier, onClose }) {
  useModalBack(onClose);
  const ro = useReadOnly();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState("");

  const mailtoShare = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(
      `Bonjour,\n\nVeuillez trouver ci-dessous le rapport « ${title} ».\n(Le document mis en forme est téléchargé pour pouvoir l'y joindre.)\n\n` +
      htmlToText(html) + `\n\n— Envoyé depuis CPwire`
    );
    downloadHtml(html, filename);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // Fallback sans application mail : ouvre Outlook sur le web avec le brouillon pré-rempli.
  const outlookWebShare = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(
      `Bonjour,\n\nRapport « ${title} ».\n\n` + htmlToText(html) + `\n\n— Envoyé depuis CPwire`
    );
    downloadHtml(html, filename);
    window.open(`https://outlook.office.com/mail/deeplink/compose?subject=${subject}&body=${body}`, "_blank", "noopener");
  };

  const copyText = async () => {
    const txt = `${title}\n\n` + htmlToText(html);
    try {
      await navigator.clipboard.writeText(txt);
      setMsg({ t: "ok", m: "Texte du rapport copié — colle-le dans ton e-mail." });
    } catch {
      setMsg({ t: "warn", m: "Copie impossible sur ce navigateur — utilise « Télécharger »." });
    }
  };

  const apiMail = async () => {
    const to = window.prompt("Destinataire(s), séparés par des virgules :", "");
    if (!to) return;
    setBusy("mail"); setMsg(null);
    try { await shareMail(to.split(",").map((s) => s.trim()), title, html); setMsg({ t: "ok", m: "E-mail envoyé via Outlook." }); }
    catch (e) { setMsg({ t: "warn", m: e.message }); }
    finally { setBusy(""); }
  };

  const toSharePoint = async () => {
    const folder = window.prompt("Dossier SharePoint :", `Clients/${dossier || ""}/Rapports`);
    if (!folder) return;
    setBusy("sp"); setMsg(null);
    try {
      const r = await shareSharePoint(folder, filename, html);
      setMsg({ t: "ok", m: "Déposé sur SharePoint." + (r.webUrl ? " " + r.webUrl : "") });
    } catch (e) { setMsg({ t: "warn", m: e.message }); }
    finally { setBusy(""); }
  };

  if (!html) return null;
  return (
    <div className="overlay" onClick={backOut}>
      <div className="modal" style={{ maxWidth: 880 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="modal-back" onClick={backOut} title="Retour">←</button>
          <button className="x" onClick={backOut}>×</button>
          <div className="k">Document généré</div>
          <h3>{title}</h3>
        </div>
        <div className="modal-bd">
          <iframe className="doc-frame" srcDoc={html} title="aperçu" />
          <div className="row-actions">
            <button className="btn-solid gold" onClick={() => downloadHtml(html, filename)}>Télécharger</button>
            <button className="btn-line" onClick={() => printHtml(html, filename)}>Imprimer / PDF</button>
            <button className="btn-line" onClick={copyText}>Copier le texte</button>
            <button className="btn-line" onClick={outlookWebShare}>Outlook (web)</button>
            <button className="btn-line" onClick={mailtoShare}>Outlook (appli)</button>
            {!ro && dossier && <button className="btn-line" onClick={toSharePoint} disabled={busy === "sp"}>{busy === "sp" ? "Dépôt…" : "Déposer sur SharePoint"}</button>}
            {!ro && <button className="btn-line" onClick={apiMail} disabled={busy === "mail"}>{busy === "mail" ? "Envoi…" : "Envoyer via Outlook (auto)"}</button>}
          </div>
          {msg && <div className={msg.t === "ok" ? "ok-note" : "warn-note"}>{msg.m}</div>}
          <div className="hint">Sans appli mail installée, utilise « Outlook (web) » ou « Copier le texte ». « Envoyer via Outlook (auto) » et « SharePoint » nécessitent Microsoft 365 (voir README).</div>
        </div>
      </div>
    </div>
  );
}
