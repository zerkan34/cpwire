import React, { useMemo, useState } from "react";

const ACTIVE = ["encours", "retourTest", "retourProd"];
const DONE = ["termine", "miseEnProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];

// Onglet "Développeurs" : qui a combien de tickets ; clic sur un dev -> fiche (stats jour/mois).
export default function Developers({ issues = [], onTicket, onDev, deletedDevs = [] }) {
  const [dossier, setDossier] = useState("Tous");
  const delSet = new Set(deletedDevs);

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
  const nonAssigne = rows.find((r) => r.dev === "Non assigné")?.total || 0;

  return (
    <>
      <div className="section-title">Développeurs
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {realDevs} développeur(s) · {totalTickets} ticket(s){nonAssigne ? ` · ${nonAssigne} non assigné(s)` : ""}{dossier !== "Tous" ? ` · ${dossier}` : ""}
        </span>
      </div>

      <div className="panel">
        <div className="filters">
          <span className="fg-lbl">Dossier</span>
          {dossiers.map((d) => (
            <button key={d} className={`fbtn ${dossier === d ? "active" : ""}`}
              onClick={() => setDossier(d)}>{d}</button>
          ))}
        </div>
        <div className="sep" />

        {rows.length === 0 ? (
          <div className="empty">Aucun ticket pour ce périmètre.</div>
        ) : (
          <div className="dev-list">
            {rows.map((r) => (
              <button className={`dev-row ${delSet.has(r.dev) ? "del" : ""}`} key={r.dev} onClick={() => onDev && onDev(r.dev)} title="Voir la fiche du développeur">
                <span className="dev-name dname">{r.dev}{r.dev === "Non assigné" ? " ⚠" : ""}{delSet.has(r.dev) ? <span className="dev-del-tag">fiche supprimée</span> : null}</span>
                <span className="dev-bar">
                  <span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} />
                </span>
                <span className="dev-counts">
                  <span className="dev-tot">{r.total}</span>
                  <span className="pill done">{r.termine}</span>
                  <span className="pill prog">{r.encours}</span>
                  {r.recette ? <span className="pill todo">{r.recette}</span> : null}
                  {r.retard ? <span className="pill block">{r.retard} retard</span> : null}
                  <span className="dev-caret">›</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="hint">
        Clique un développeur pour ouvrir sa fiche (tickets pris, activité du jour, répartition par mois).
        Légende : <span className="pill done">terminés</span> <span className="pill prog">en cours</span>
        <span className="pill todo">en recette</span>. Le volume reflète l'activité, pas une note de performance.
        <br />
        <b>Comment c'est compté :</b> un ticket est rattaché à la <b>personne assignée dans Jira</b> (à défaut, à un nom « (Prénom Nom) » écrit en fin de titre). Un développeur peut donc paraître « léger » si ses tickets ne lui sont pas assignés dans Jira — ils tombent alors dans <b>« Non assigné&nbsp;⚠ »</b> ({nonAssigne} ici) ou sont au nom d'un autre. Le détail réel de qui a agi et quand reste visible dans chaque ticket (Historique &amp; temps).
      </p>
    </>
  );
}
