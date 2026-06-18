import React, { useState } from "react";

const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };
const STATUT_ORDER = { Bloqué: 0, "À faire": 1, "En cours": 2, Terminé: 3 };

function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("fr-FR"); } catch { return s; }
}

function prioClass(p) {
  const x = (p || "").toLowerCase();
  if (/haut|high|criti|urgen|bloqu/.test(x)) return "p-haute";
  if (/moy|medium|normal/.test(x)) return "p-moyenne";
  if (/bas|low|mineur|minor|trivial/.test(x)) return "p-basse";
  return "";
}

// Colonnes triables (clé d'accès + façon de comparer).
const COLS = [
  { key: "cle", label: "Clé", get: (r) => r.cle, type: "text" },
  { key: "dossier", label: "Dossier", get: (r) => r.dossier, type: "text" },
  { key: "resume", label: "Résumé", get: (r) => r.resume, type: "text" },
  { key: "assigne", label: "Sur le ticket", get: (r) => (r.contributors && r.contributors.length ? r.contributors[0] : r.assigne || ""), type: "text" },
  { key: "echeance", label: "Échéance", get: (r) => r.echeance || "", type: "date" },
  { key: "statut", label: "Statut", get: (r) => STATUT_ORDER[r.statut] ?? 99, type: "num" },
];

export default function IssueTable({ rows, loading, onTicket, onDev, changedKeys }) {
  const [sortKey, setSortKey] = useState(null);   // null = tri "intelligent" par défaut
  const [sortDir, setSortDir] = useState("asc");

  if (loading && !rows.length) return <div className="empty">Chargement des tickets…</div>;
  if (!rows.length) return <div className="empty">Aucun ticket pour ce filtre. Rien à traiter ici.</div>;

  const clickHeader = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  let sorted;
  if (!sortKey) {
    // Tri par défaut : mes tickets, puis en retard, puis statut, puis dossier.
    sorted = [...rows].sort((a, b) => {
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      if (a.enRetard !== b.enRetard) return a.enRetard ? -1 : 1;
      if ((STATUT_ORDER[a.statut] ?? 9) !== (STATUT_ORDER[b.statut] ?? 9)) return (STATUT_ORDER[a.statut] ?? 9) - (STATUT_ORDER[b.statut] ?? 9);
      return a.dossier.localeCompare(b.dossier);
    });
  } else {
    const col = COLS.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    sorted = [...rows].sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      let r;
      if (col.type === "num") r = (va || 0) - (vb || 0);
      else if (col.type === "date") r = String(va).localeCompare(String(vb)); // ISO -> ordre chrono
      else r = String(va).localeCompare(String(vb), "fr", { numeric: true });
      return r * dir;
    });
  }

  const arrow = (key) => {
    if (sortKey !== key) return <span className="sort-ar dim">⇅</span>;
    return <span className="sort-ar">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  return (
    <table>
      <thead>
        <tr>
          {COLS.map((c) => (
            <th key={c.key} className="th-sort" onClick={() => clickHeader(c.key)} title="Trier">
              {c.label} {arrow(c.key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const cls = [r.mine ? "mine" : "", r.flagged ? "has-flag" : "", changedKeys && changedKeys.has(r.cle) ? "row-changed" : ""].filter(Boolean).join(" ");
          return (
            <tr key={r.cle} className={cls} onClick={() => onTicket && onTicket(r)} style={{ cursor: "pointer" }}>
              <td data-label="Clé"><span className="k">{r.cle}</span></td>
              <td data-label="Dossier"><span className="tag">{r.dossier}</span></td>
              <td data-label="Résumé"><span className={`prio-dot ${prioClass(r.priorite)}`} title={r.priorite ? `Priorité : ${r.priorite}` : "Priorité —"} />{r.flagged ? <span className="flag" title="Flaggé">🚩 </span> : null}{r.resume}{r.mine && <span className="me-badge">POUR MOI</span>}{changedKeys && changedKeys.has(r.cle) && <span className="chg-badge">MAJ</span>}{r.prog && r.prog.found && <span className="prog-chip" title={`Programme ${r.prog.name}${r.prog.lib ? " · biblio " + r.prog.lib : ""}${r.prog.srcMember ? " · source " + r.prog.srcMember : ""}`}>📦 {r.prog.lib || r.prog.name}{r.prog.srcMember ? ` / ${r.prog.srcMember}` : ""}</span>}</td>
              <td data-label="Sur le ticket">{(r.contributors && r.contributors.length) ? (
                r.contributors.map((c, idx) => (
                  <span key={c}>
                    {idx > 0 && <span className="who-sep">, </span>}
                    {onDev
                      ? <span className="assignee-link" title="Voir la fiche du développeur" onClick={(e) => { e.stopPropagation(); onDev(c); }}>{c}</span>
                      : c}
                  </span>
                ))
              ) : <span className="who-none">Non assigné</span>}</td>
              <td data-label="Échéance">{r.echeance ? <span className={r.enRetard ? "late" : ""}>{fmtDate(r.echeance)}{r.enRetard ? " ⚠" : ""}</span> : "—"}</td>
              <td data-label="Statut"><span className={`pill ${PILL[r.statut]}`}>{r.statut}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
