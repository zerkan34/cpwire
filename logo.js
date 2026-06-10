import React, { useMemo, useState } from "react";

const ACTIVE = ["encours", "retourTest", "retourProd"];
const DONE = ["termine", "miseEnProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", "Terminé": "done" };

// Onglet "Développeurs" : qui a combien de tickets, par dossier, + l'historique cliquable.
export default function Developers({ issues = [], onTicket }) {
  const [dossier, setDossier] = useState("Tous");
  const [open, setOpen] = useState(null);

  const dossiers = useMemo(
    () => ["Tous", ...Array.from(new Set(issues.map((i) => i.dossier))).sort()],
    [issues]
  );

  const rows = useMemo(() => {
    const scope = issues.filter((i) => dossier === "Tous" || i.dossier === dossier);
    const m = {};
    scope.forEach((i) => {
      const d = i.dev || i.assigne || "Non assigné";
      (m[d] ||= { dev: d, total: 0, termine: 0, encours: 0, recette: 0, retard: 0, items: [] });
      const r = m[d];
      r.total += 1;
      if (DONE.includes(i.categorie)) r.termine += 1;
      else if (ACTIVE.includes(i.categorie)) r.encours += 1;
      else if (WAIT.includes(i.categorie)) r.recette += 1;
      if (i.enRetard) r.retard += 1;
      r.items.push(i);
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [issues, dossier]);

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const totalTickets = rows.reduce((s, r) => s + r.total, 0);
  const realDevs = rows.filter((r) => r.dev !== "Non assigné").length;

  return (
    <>
      <div className="section-title">Développeurs
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {realDevs} développeur(s) · {totalTickets} ticket(s){dossier !== "Tous" ? ` · ${dossier}` : ""}
        </span>
      </div>

      <div className="panel">
        <div className="filters">
          <span className="fg-lbl">Dossier</span>
          {dossiers.map((d) => (
            <button key={d} className={`fbtn ${dossier === d ? "active" : ""}`}
              onClick={() => { setDossier(d); setOpen(null); }}>{d}</button>
          ))}
        </div>
        <div className="sep" />

        {rows.length === 0 ? (
          <div className="empty">Aucun ticket pour ce périmètre.</div>
        ) : (
          <div className="dev-list">
            {rows.map((r) => (
              <div className="dev-block" key={r.dev}>
                <button className="dev-row" onClick={() => setOpen(open === r.dev ? null : r.dev)}>
                  <span className="dev-name">{r.dev}{r.dev === "Non assigné" ? " ⚠" : ""}</span>
                  <span className="dev-bar">
                    <span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} />
                  </span>
                  <span className="dev-counts">
                    <span className="dev-tot">{r.total}</span>
                    <span className="pill done">{r.termine}</span>
                    <span className="pill prog">{r.encours}</span>
                    {r.recette ? <span className="pill todo">{r.recette}</span> : null}
                    {r.retard ? <span className="pill block">{r.retard} retard</span> : null}
                    <span className="dev-caret">{open === r.dev ? "▾" : "▸"}</span>
                  </span>
                </button>
                {open === r.dev && (
                  <ul className="dev-items">
                    {r.items
                      .slice()
                      .sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")))
                      .map((i) => (
                        <li key={i.cle} onClick={() => onTicket(i)} style={{ cursor: "pointer" }}>
                          <span className="k">{i.cle}</span>
                          <span style={{ flex: 1 }}>{i.resume}</span>
                          <span className={`pill ${PILL[i.statut] || "todo"}`}>{i.statutJira || i.statut}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="hint">
        Légende : <span className="pill done">terminés</span> <span className="pill prog">en cours</span>
        <span className="pill todo">en recette</span>. Le volume (nombre de tickets) reflète l'activité, pas une
        note de performance — un ticket peut être trivial ou très lourd. Les tickets sans personne assignée dans
        Jira apparaissent sous « Non assigné ⚠ ».
      </p>
    </>
  );
}
