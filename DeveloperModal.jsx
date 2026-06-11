import React, { useState } from "react";
import { saveDossier } from "../api.js";
import { buildSimpleDoc, esc } from "../utils.js";
import { useModalBack, backOut } from "../modalNav.js";
import ExportBar from "./ExportBar.jsx";

const blank = () => ({ nom: "", poste: "", email: "", statut: "Actif", cote: "Armonie" });

export default function DossierModal({ nom, fiche, onClose, onSaved }) {
  useModalBack(onClose);
  const [desc, setDesc] = useState(fiche?.description || "");
  const [tech, setTech] = useState((fiche?.tech || []).join(", "));
  const [team, setTeam] = useState((fiche?.team || []).map((m) => ({ ...m })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const upd = (i, k, v) => setTeam((t) => t.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const add = () => setTeam((t) => [...t, blank()]);
  const remove = (i) => setTeam((t) => t.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const payload = { description: desc, tech: tech.split(",").map((s) => s.trim()).filter(Boolean), team };
      const { fiche: saved } = await saveDossier(nom, payload);
      setMsg({ type: "ok", text: "Fiche enregistrée." });
      onSaved && onSaved(nom, saved);
    } catch (e) { setMsg({ type: "warn", text: e.message }); }
    finally { setBusy(false); }
  };

  const client = team.filter((m) => m.cote === "Client");
  const armonie = team.filter((m) => m.cote === "Armonie");

  const buildDossierHtml = () => {
    const techList = tech.split(",").map((s) => s.trim()).filter(Boolean);
    const rows = team.map((m) => `<tr><td>${esc(m.nom)}</td><td>${esc(m.poste)}</td><td>${esc(m.email)}</td><td>${esc(m.statut)}</td><td>${esc(m.cote)}</td></tr>`).join("");
    let body = `<h2>Présentation</h2><p>${esc(desc) || "<span class='muted'>—</span>"}</p>`;
    body += `<h2>Technologies</h2><p>${techList.length ? esc(techList.join(", ")) : "<span class='muted'>—</span>"}</p>`;
    body += `<h2>Équipe &amp; contacts</h2>` +
      `<table><tr><th>Nom</th><th>Poste</th><th>E-mail</th><th>Statut</th><th>Côté</th></tr>${rows || "<tr><td colspan='5'>—</td></tr>"}</table>`;
    const cartouche = [
      ["Dossier", `${nom} — équipe Armonie`],
      ["Chef de projet", "Nicolas Durand"],
      ["Équipe", `${team.length} personne(s) · Armonie ${armonie.length} · Client ${client.length}`],
    ];
    return buildSimpleDoc({ kicker: "Fiche dossier", title: `Fiche dossier — ${nom}`, cartouche, bodyHtml: body });
  };

  return (
    <div className="overlay" onClick={backOut}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="modal-back" onClick={backOut} title="Retour">←</button>
          <button className="x" onClick={backOut}>×</button>
          <div className="k">Fiche dossier</div>
          <h3>{nom}</h3>
        </div>
        <div className="modal-bd">
          <ExportBar buildHtml={buildDossierHtml} filename={`fiche-${nom}.html`} subject={`Fiche dossier — ${nom}`} />
          <div className="field">
            <label>Historique court / ce que fait le dossier</label>
            <textarea className="ta" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field">
            <label>Technologies utilisées (séparées par des virgules)</label>
            <input type="text" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="IBM i, RPG, eMage…" />
          </div>

          <div className="field">
            <label>Équipe & contacts <span style={{ color: "var(--muted)", fontWeight: 400 }}>({team.length})</span></label>
            <table className="edit-tbl">
              <thead><tr><th>Nom</th><th>Poste</th><th>E-mail</th><th>Statut</th><th>Côté</th><th></th></tr></thead>
              <tbody>
                {team.map((m, i) => (
                  <tr key={i}>
                    <td><input value={m.nom} onChange={(e) => upd(i, "nom", e.target.value)} placeholder="Nom" /></td>
                    <td><input value={m.poste} onChange={(e) => upd(i, "poste", e.target.value)} placeholder="Poste" /></td>
                    <td><input value={m.email} onChange={(e) => upd(i, "email", e.target.value)} placeholder="email@…" /></td>
                    <td>
                      <select value={m.statut} onChange={(e) => upd(i, "statut", e.target.value)}>
                        <option>Actif</option><option>Inactif</option><option>À confirmer</option>
                      </select>
                    </td>
                    <td>
                      <select value={m.cote} onChange={(e) => upd(i, "cote", e.target.value)}>
                        <option>Armonie</option><option>Client</option>
                      </select>
                    </td>
                    <td><button className="x-row" onClick={() => remove(i)} title="Retirer">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-line" style={{ marginTop: 10 }} onClick={add}>+ Ajouter une personne</button>
            <div className="hint">Côté Armonie : {armonie.length} · Côté client : {client.length}</div>
          </div>

          <div className="row-actions">
            <button className="btn-solid gold" onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer la fiche"}</button>
            <button className="btn-line" onClick={backOut}>Fermer</button>
          </div>
          {msg && <div className={msg.type === "ok" ? "ok-note" : "warn-note"}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}
