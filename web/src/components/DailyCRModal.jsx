import React, { useMemo, useState, useEffect } from "react";
import JSZip from "jszip";
import { buildRecapFiles } from "../recapDoc.js";
import { buildBlockersDoc } from "../blockersDoc.js";
import { computeBlockers } from "../blockers.js";
import { blockerSince } from "../api.js";
import { copyText, htmlToText, mailDraft, saveBlobAs } from "../utils.js";

// Fenêtre « CR du jour » : le ZIP contient UN FICHIER PAR CLIENT (un CR détaillé chacun).
// Aperçu fidèle (iframe), sélection du client à prévisualiser, et ouverture d'un mail Outlook vide.
export default function DailyCRModal({ issues = [], meName = "Nicolas Durand", onClose }) {
  const { files, human, fileBase } = useMemo(() => buildRecapFiles(issues, { meName }), [issues, meName]);
  const [sinceMap, setSinceMap] = useState({});

  // Dates exactes d'entrée dans l'état (changelog) pour le document Points bloquants.
  useEffect(() => {
    const tickets = computeBlockers(issues)
      .filter((p) => p.kind && p.kind !== "retard")
      .map((p) => ({ cle: p.id, maj: p.maj || null }));
    if (!tickets.length) return;
    let alive = true;
    blockerSince(tickets).then((r) => { if (alive && r && r.since) setSinceMap(r.since); }).catch(() => {});
    return () => { alive = false; };
  }, [issues]);

  const blockersFile = useMemo(() => buildBlockersDoc(issues, { meName, sinceMap }), [issues, meName, sinceMap]);
  // Le doc Points bloquants est ajouté au ZIP et à l'aperçu, en tête.
  const allFiles = useMemo(() => [blockersFile, ...files], [blockersFile, files]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const current = allFiles[sel] || allFiles[0];

  const downloadZip = async () => {
    setBusy(true); setMsg("");
    try {
      const zip = new JSZip();
      allFiles.forEach((f) => zip.file(f.name, f.html));
      const blob = await zip.generateAsync({ type: "blob" });
      await saveBlobAs(blob, `${fileBase}.zip`, { description: "Archive ZIP", mime: "application/zip", ext: ".zip" });
      setMsg(`ZIP « ${fileBase}.zip » enregistré — ${allFiles.length} fichier(s), dont « Points bloquants ».`);
    } catch (e) {
      if (e && e.name === "AbortError") { setBusy(false); return; }  // annulation volontaire du sélecteur
      setMsg("Échec de la création du ZIP : " + (e.message || e));
    }
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
            <button className="btn-primary" onClick={downloadZip} disabled={busy || !allFiles.length}>{busy ? "Création…" : `📦 Télécharger le ZIP (${allFiles.length} fichiers)`}</button>
            <button className="btn-line" onClick={openOutlook}>✉️ Ouvrir dans Outlook</button>
            <button className="btn-line" onClick={copy} disabled={!allFiles.length}>{copied ? "✓ Copié" : "Copier ce client"}</button>
          </div>
          <p className="cr-hint">Le ZIP <b>« {fileBase}.zip »</b> contient le document <b>« Points bloquants »</b> et <b>{files.length} compte{files.length > 1 ? "s" : ""} rendu{files.length > 1 ? "s" : ""}</b> (un par client). Clique <b>Télécharger le ZIP</b>, puis <b>Ouvrir dans Outlook</b> : il ne reste qu'à <b>joindre le ZIP</b>, saisir les destinataires et envoyer. Le mail s'ouvre vide, objet déjà rempli — sur PC comme sur le web.</p>
          {msg && <div className="cr-msg">{msg}</div>}
          {allFiles.length > 1 && (
            <div className="cr-pick">
              <label>Aperçu du client :</label>
              <select value={sel} onChange={(e) => setSel(Number(e.target.value))}>
                {allFiles.map((f, idx) => <option key={f.name} value={idx}>{f.dossier} ({f.count})</option>)}
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
