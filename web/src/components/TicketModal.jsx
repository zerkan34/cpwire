import React, { useState } from "react";
import { genTicketReport, pushTicket, explainTicket } from "../api.js";
import { frDate } from "../utils.js";

const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

export default function TicketModal({ ticket, onClose, onPushed }) {
  const [note, setNote] = useState("");
  const [report, setReport] = useState("");
  const [markDone, setMarkDone] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [explication, setExplication] = useState("");
  const [explLoading, setExplLoading] = useState(false);

  React.useEffect(() => {
    let alive = true;
    if (ticket?.cle && ticket.url && ticket.url !== "#") {
      setExplication(""); setExplLoading(true);
      explainTicket(ticket.cle)
        .then((r) => { if (alive) setExplication(r.explication); })
        .catch(() => { if (alive) setExplication(""); })
        .finally(() => { if (alive) setExplLoading(false); });
    }
    return () => { alive = false; };
  }, [ticket?.cle]);

  if (!ticket) return null;

  const draft = async () => {
    setBusy("draft"); setMsg(null);
    try { const { text } = await genTicketReport(ticket.cle, note, ticket.resume); setReport(text); }
    catch (e) { setMsg({ type: "warn", text: e.message }); }
    finally { setBusy(""); }
  };

  const push = async () => {
    if (!report.trim()) { setMsg({ type: "warn", text: "Rédige d'abord le rapport." }); return; }
    if (!window.confirm(`Envoyer ce rapport dans Jira sur ${ticket.cle}${markDone ? " et passer le ticket à « Terminé »" : ""} ?`)) return;
    setBusy("push"); setMsg(null);
    try {
      const r = await pushTicket(ticket.cle, report, markDone);
      setMsg({ type: "ok", text: r.simulated ? "Mode démo : envoi simulé et journalisé." : `Envoyé dans Jira${r.transition?.applied ? " · statut : " + r.transition.applied : ""}.` });
      onPushed && onPushed();
    } catch (e) { setMsg({ type: "warn", text: e.message }); }
    finally { setBusy(""); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="x" onClick={onClose}>×</button>
          <div className="k">{ticket.cle}{ticket.mine ? "  ·  pour moi" : ""}</div>
          <h3>{ticket.resume}</h3>
        </div>
        <div className="modal-bd">
          <div className="meta-grid">
            <div className="cell"><div className="l">Dossier</div><div className="v">{ticket.dossier}</div></div>
            <div className="cell"><div className="l">Statut</div><div className="v"><span className={`pill ${PILL[ticket.statut]}`}>{ticket.statut}</span>{ticket.enRetard ? <span className="late"> · en retard</span> : null}</div></div>
            <div className="cell"><div className="l">Assigné</div><div className="v">{ticket.assigne}</div></div>
            <div className="cell"><div className="l">Priorité</div><div className="v">{ticket.priorite || "—"}</div></div>
            <div className="cell"><div className="l">Échéance</div><div className="v">{ticket.echeance || "—"}</div></div>
            <div className="cell"><div className="l">Mise à jour</div><div className="v">{frDate(ticket.maj)}</div></div>
          </div>

          {ticket.url && ticket.url !== "#" && (
            <a className="jira-link" href={ticket.url} target="_blank" rel="noreferrer">Ouvrir le ticket dans Jira ↗</a>
          )}

          <div className="expl">
            <div className="expl-h">Explication simple</div>
            {explLoading ? (
              <p className="hint">Analyse du ticket en cours…</p>
            ) : explication ? (
              <p>{explication}</p>
            ) : (
              <p className="hint">Disponible une fois connecté à Jira (et avec la clé IA pour une explication détaillée).</p>
            )}
          </div>

          <div className="field">
            <label>Ce que j'ai fait (note rapide)</label>
            <textarea className="ta" style={{ minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. Développement terminé, testé en recette, livré." />
          </div>

          <div className="row-actions">
            <button className="btn-line" onClick={draft} disabled={busy === "draft"}>
              {busy === "draft" ? "Rédaction…" : "Rédiger le rapport (IA)"}
            </button>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Rapport (modifiable avant envoi)</label>
            <textarea className="ta" value={report} onChange={(e) => setReport(e.target.value)}
              placeholder="Le rapport généré apparaît ici — ajuste-le librement." />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, margin: "4px 0 10px" }}>
            <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} />
            Marquer le ticket comme « Terminé » dans Jira
          </label>

          <div className="row-actions">
            <button className="btn-solid gold" onClick={push} disabled={busy === "push"}>
              {busy === "push" ? "Envoi…" : "Envoyer dans Jira"}
            </button>
            <button className="btn-line" onClick={onClose}>Fermer</button>
          </div>

          {msg && <div className={msg.type === "ok" ? "ok-note" : "warn-note"}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}
