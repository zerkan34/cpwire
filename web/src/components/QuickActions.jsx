import { useState } from "react";
import { pushTicket, fetchTicketTransitions, applyTicketTransition } from "../api.js";

// Actions rapides sur un ticket, depuis une alerte — sans quitter le cockpit.
// Commenter et/ou changer de statut. 100 % honnête : si Jira est en démo, le
// serveur le signale et on l'affiche tel quel (rien n'est prétendu envoyé).

export default function QuickActions({ cle }) {
  const [open, setOpen] = useState(false);
  const [trans, setTrans] = useState(null);
  const [to, setTo] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggle = async () => {
    const nx = !open; setOpen(nx); setMsg("");
    if (nx && trans === null) {
      try { const r = await fetchTicketTransitions(cle); setTrans(r.transitions || []); }
      catch (e) { setTrans([]); setMsg(e && e.message ? e.message : "Transitions indisponibles."); }
    }
  };

  const submit = async () => {
    if (!comment.trim() && !to) { setMsg("Ajoute un commentaire ou choisis un statut."); return; }
    setBusy(true); setMsg("");
    const out = [];
    try {
      if (comment.trim()) {
        const r = await pushTicket(cle, comment.trim(), false);
        out.push(r && r.comment && r.comment.simulated ? "commentaire (démo, non envoyé)" : "commentaire ajouté");
      }
      if (to) {
        const r = await applyTicketTransition(cle, to);
        out.push(r && r.simulated ? `statut « ${to} » (démo, non envoyé)` : `statut → « ${to} »`);
      }
      setMsg(out.join(" · ")); setComment(""); setTo("");
    } catch (e) { setMsg(e && e.message ? e.message : "Action refusée."); }
    finally { setBusy(false); }
  };

  return (
    <span className="qa">
      <button type="button" className="qa-btn" onClick={toggle} title="Agir sur ce ticket">{open ? "× Fermer" : "⚡ Agir"}</button>
      {open ? (
        <div className="qa-panel" onClick={(e) => e.stopPropagation()}>
          <label className="qa-lbl">Commentaire</label>
          <textarea className="qa-ta" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={`Note ajoutée au ticket ${cle}…`} />
          <label className="qa-lbl">Changer le statut</label>
          <select className="qa-sel" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">— ne pas changer —</option>
            {(trans || []).map((t) => <option key={t.id} value={t.to || t.name}>{t.name}{t.to && t.to !== t.name ? ` → ${t.to}` : ""}</option>)}
          </select>
          <div className="qa-row">
            <button type="button" className="qa-go" onClick={submit} disabled={busy}>{busy ? "Envoi…" : "Appliquer"}</button>
            {msg ? <span className="qa-msg">{msg}</span> : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}
