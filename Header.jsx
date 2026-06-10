import React from "react";

const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };
const ORDER = { Bloqué: 0, "À faire": 1, "En cours": 2, Terminé: 3 };

function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("fr-FR"); } catch { return s; }
}

export default function IssueTable({ rows, loading, onTicket }) {
  if (loading && !rows.length) return <div className="empty">Chargement des tickets…</div>;
  if (!rows.length) return <div className="empty">Aucun ticket pour ce filtre. Rien à traiter ici.</div>;

  const sorted = [...rows].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;          // mes tickets d'abord
    if (a.enRetard !== b.enRetard) return a.enRetard ? -1 : 1;
    if (ORDER[a.statut] !== ORDER[b.statut]) return ORDER[a.statut] - ORDER[b.statut];
    return a.dossier.localeCompare(b.dossier);
  });

  return (
    <table>
      <thead>
        <tr><th>Clé</th><th>Dossier</th><th>Résumé</th><th>Assigné</th><th>Échéance</th><th>Statut</th></tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.cle} className={r.mine ? "mine" : ""} onClick={() => onTicket && onTicket(r)} style={{ cursor: "pointer" }}>
            <td><span className="k">{r.cle}</span></td>
            <td><span className="tag">{r.dossier}</span></td>
            <td>{r.resume}{r.mine && <span className="me-badge">POUR MOI</span>}</td>
            <td>{r.assigne}</td>
            <td>{r.echeance ? <span className={r.enRetard ? "late" : ""}>{fmtDate(r.echeance)}{r.enRetard ? " ⚠" : ""}</span> : "—"}</td>
            <td><span className={`pill ${PILL[r.statut]}`}>{r.statut}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
