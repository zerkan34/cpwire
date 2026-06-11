import React, { useMemo, useState } from "react";

const ACTIVE = ["encours", "retourTest", "retourProd"];
const DONE = ["termine", "miseEnProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];

// Onglet "Développeurs" : qui a combien de tickets ; clic sur un dev -> fiche (stats jour/mois).
export default function Developers({ issues = [], onTicket, onDev, deletedDevs = [] }) {
  const [dossier, setDossier] = useState("Tous");
  const delSet = new Set(deletedDevs);

  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("cpwire_hidden_devs") || "[]")); } catch { return new Set(); } });
  const [showHidden, setShowHidden] = useState(false);
  const persistHidden = (s) => { try { localStorage.setItem("cpwire_hidden_devs", JSON.stringify([...s])); } catch { /* */ } };
  const hide = (name) => setHidden((prev) => { const n = new Set(prev); n.add(name); persistHidden(n); return n; });
  const unhide = (name) => setHidden((prev) => { const n = new Set(prev); n.delete(name); persistHidden(n); return n; });

  const dossiers = useMemo(
    () => ["Tous", ...Array.from(new Set(issues.map((i) => i.dossier))).sort()],
    [issues]
  );

  const rows = useMemo(() => {
    const scope = issues.filter((i) => dossier === "Tous" || i.dossier === dossier);
    const m = {};
    scope.forEach((i) => {
      // Un ticket compte pour CHAQUE contributeur (assigné + nom en titre + initiales en étiquette).
      const devs = (Array.isArray(i.contributors) && i.contributors.length) ? i.contributors : [i.dev || i.assigne || "Non assigné"];
      devs.forEach((d) => {
        (m[d] ||= { dev: d, total: 0, termine: 0, encours: 0, recette: 0, retard: 0, items: [] });
        const r = m[d];
        r.total += 1;
        if (DONE.includes(i.categorie)) r.termine += 1;
        else if (ACTIVE.includes(i.categorie)) r.encours += 1;
        else if (WAIT.includes(i.categorie)) r.recette += 1;
        if (i.enRetard) r.retard += 1;
        r.items.push(i);
      });
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [issues, dossier]);

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const totalTickets = issues.filter((i) => dossier === "Tous" || i.dossier === dossier).length;
  const realDevs = rows.filter((r) => r.dev !== "Non assigné").length;
  const nonAssigne = rows.find((r) => r.dev === "Non assigné")?.total || 0;

  return (
    <>
      <div className="section-title">Développeurs
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {realDevs} développeur(s) · {totalTickets} ticket(s){nonAssigne ? ` · ${nonAssigne} non assigné(s)` : ""}{dossier !== "Tous" ? ` · ${dossier}` : ""}
        </span>
      </div>

      <div className="panel dev-panel">
        <div className="recap-hd">
          <span className="recap-hd-name">Charge par développeur</span>
          <span className="recap-hd-meta">{realDevs} dev{realDevs > 1 ? "s" : ""} · {totalTickets} ticket{totalTickets > 1 ? "s" : ""}</span>
        </div>
        <div className="dev-panel-bd">
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
            {rows.filter((r) => showHidden || (!hidden.has(r.dev) && !delSet.has(r.dev))).map((r) => {
              const isDel = delSet.has(r.dev);
              const isHidden = hidden.has(r.dev);
              return (
                <div className={`dev-row ${isDel ? "del" : ""} ${isHidden ? "hid" : ""}`} key={r.dev} role="button" tabIndex={0}
                  onClick={() => onDev && onDev(r.dev)} title="Voir la fiche du développeur">
                  <span className="dev-name dname">{r.dev}{r.dev === "Non assigné" ? " ⚠" : ""}{isDel ? <span className="dev-del-tag">inactif</span> : null}</span>
                  <span className="dev-bar">
                    <span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} />
                  </span>
                  <span className="dev-counts">
                    <span className="dev-tot">{r.total}</span>
                    <span className="pill done">{r.termine}</span>
                    <span className="pill prog">{r.encours}</span>
                    {r.recette ? <span className="pill todo">{r.recette}</span> : null}
                    {r.retard ? <span className="pill block">{r.retard} retard</span> : null}
                    {isHidden
                      ? <button className="dev-hide" title="Réafficher dans la liste" onClick={(e) => { e.stopPropagation(); unhide(r.dev); }}>Réafficher</button>
                      : (isDel ? <button className="dev-hide" title="Masquer de la liste" onClick={(e) => { e.stopPropagation(); hide(r.dev); }}>Masquer</button> : null)}
                    <span className="dev-caret">›</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {rows.some((r) => hidden.has(r.dev) || delSet.has(r.dev)) && (
          <div className="dev-hidden-bar">
            <button className="btn-line sm" onClick={() => setShowHidden((s) => !s)}>
              {showHidden ? "Cacher les inactifs / masqués" : `Afficher les inactifs / masqués (${rows.filter((r) => hidden.has(r.dev) || delSet.has(r.dev)).length})`}
            </button>
          </div>
        )}
        </div>
      </div>

      <p className="hint">
        Clique un développeur pour ouvrir sa fiche (tickets pris, activité du jour, répartition par mois).
        Légende : <span className="pill done">terminés</span> <span className="pill prog">en cours</span>
        <span className="pill todo">en recette</span>. Le volume reflète l'activité, pas une note de performance.
        <br />
        <b>Comment c'est compté :</b> un ticket est rattaché à <b>toutes</b> les personnes qui y ont contribué — la personne <b>assignée</b> dans Jira (auto-assignation comprise), un nom « (Prénom Nom) » écrit en fin de titre, et les <b>initiales en étiquette</b> (ex. « HRE » → Hamza). Un même ticket peut donc compter pour deux personnes. S'il reste des tickets sans personne, ils tombent dans <b>« Non assigné&nbsp;⚠ »</b> ({nonAssigne} ici). Le détail réel de qui a agi et quand est dans chaque ticket (Historique &amp; temps).
      </p>
    </>
  );
}
