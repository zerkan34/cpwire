import React, { useState } from "react";
import { downloadHtml, printHtml } from "../utils.js";
import { shareMail, shareSharePoint } from "../api.js";

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
}

export default function DocPreview({ title, html, filename, dossier, onClose }) {
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
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 880 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="x" onClick={onClose}>×</button>
          <div className="k">Document généré</div>
          <h3>{title}</h3>
        </div>
        <div className="modal-bd">
          <iframe className="doc-frame" srcDoc={html} title="aperçu" />
          <div className="row-actions">
            <button className="btn-solid gold" onClick={() => downloadHtml(html, filename)}>Télécharger</button>
            <button className="btn-line" onClick={() => printHtml(html)}>Imprimer / PDF</button>
            <button className="btn-line" onClick={mailtoShare}>Partager par Outlook</button>
            {dossier && <button className="btn-line" onClick={toSharePoint} disabled={busy === "sp"}>{busy === "sp" ? "Dépôt…" : "Déposer sur SharePoint"}</button>}
            <button className="btn-line" onClick={apiMail} disabled={busy === "mail"}>{busy === "mail" ? "Envoi…" : "Envoyer via Outlook (auto)"}</button>
          </div>
          {msg && <div className={msg.t === "ok" ? "ok-note" : "warn-note"}>{msg.m}</div>}
          <div className="hint">« Partager par Outlook » marche sans configuration. « Envoyer via Outlook (auto) » et « Déposer sur SharePoint » nécessitent Microsoft 365 (voir README).</div>
        </div>
      </div>
    </div>
  );
}
