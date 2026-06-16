import React, { useMemo, useState } from "react";

const ACTIVE = ["encours", "retourTest", "retourProd"];
const DONE = ["termine", "miseEnProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];

// Onglet "Développeurs" : qui a combien de tickets ; clic sur un dev -> fiche.
// Deux groupes : développeurs ACTIFS, et ANCIENS développeurs — soit marqués
// manuellement "parti d'Armonie", soit détectés sans activité Jira depuis N mois.
export default function Developers({ issues = [], onTicket, onDev, deletedDevs = [], inactiveDevs = [], inactiveMonths = 2, onMarkLeft, onRestoreDev }) {
  const [dossier, setDossier] = useState("Tous");
  const delSet = new Set(deletedDevs);        // marqués manuellement "parti d'Armonie"
  const inactiveSet = new Set(inactiveDevs);  // détectés sans activité Jira depuis N mois

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
        (m[d] ||= { dev: d, total: 0, termine: 0, encours: 0, recette: 0, retard: 0, items: [], lastMaj: "" });
        const r = m[d];
        r.total += 1;
        if (DONE.includes(i.categorie)) r.termine += 1;
        else if (ACTIVE.includes(i.categorie)) r.encours += 1;
        else if (WAIT.includes(i.categorie)) r.recette += 1;
        if (i.enRetard) r.retard += 1;
        if (i.maj && String(i.maj) > String(r.lastMaj)) r.lastMaj = i.maj; // dernière activité connue
        r.items.push(i);
      });
    });
    return Object.values(m).map((r) => {
      if (r.lastMaj) r.lastLabel = new Date(r.lastMaj).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
      return r;
    }).sort((a, b) => b.total - a.total);
  }, [issues, dossier]);

  // Classement : actif vs ancien (manuel "parti" OU auto "sans activité depuis N mois").
  const isLeft = (d) => delSet.has(d);
  const isAuto = (d) => inactiveSet.has(d) && !delSet.has(d);
  const isAncien = (d) => d !== "Non assigné" && (isLeft(d) || isAuto(d));

  const activeRows = rows.filter((r) => !isAncien(r.dev));
  const ancienRows = rows.filter((r) => isAncien(r.dev));

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const totalTickets = issues.filter((i) => dossier === "Tous" || i.dossier === dossier).length;
  const realDevs = activeRows.filter((r) => r.dev !== "Non assigné").length;
  const nonAssigne = rows.find((r) => r.dev === "Non assigné")?.total || 0;

  const counts = (r) => (
    <>
      <span className="dev-tot" title="Tickets pris">{r.total}</span>
      <span className="pill done" title="Terminés">{r.termine}</span>
      <span className="pill prog" title="En cours">{r.encours}</span>
      <span className={`pill todo ${r.recette ? "" : "pf-z"}`} title="En recette">{r.recette || "–"}</span>
      <span className={`pill block ${r.retard ? "" : "pf-z"}`} title="En retard">{r.retard || "–"}</span>
    </>
  );

  return (
    <>
      <div className="section-title">Développeurs
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {realDevs} en activité{ancienRows.length ? ` · ${ancienRows.length} ancien(s)` : ""} · {totalTickets} ticket(s){nonAssigne ? ` · ${nonAssigne} non assigné(s)` : ""}{dossier !== "Tous" ? ` · ${dossier}` : ""}
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
              <button key={d} className={`fbtn ${dossier === d ? "active" : ""}`} onClick={() => setDossier(d)}>{d}</button>
            ))}
          </div>
          <div className="sep" />

          {activeRows.length === 0 ? (
            <div className="empty">Aucun développeur actif pour ce périmètre.</div>
          ) : (
            <div className="dev-list">
              {activeRows.map((r) => (
                <div className="dev-row" key={r.dev} role="button" tabIndex={0}
                  onClick={() => onDev && onDev(r.dev)} title="Voir la fiche du développeur">
                  <span className="dev-name dname">{r.dev}{r.dev === "Non assigné" ? " ⚠" : ""}</span>
                  <span className="dev-bar"><span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} /></span>
                  <span className="dev-counts">
                    {counts(r)}
                    {onMarkLeft && r.dev !== "Non assigné" ? <button className="dev-hide" title="Marquer ce développeur comme parti d'Armonie" onClick={(e) => { e.stopPropagation(); onMarkLeft(r.dev); }}>Marquer parti</button> : <span className="dev-hide-ph" />}
                    <span className="dev-caret">›</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {ancienRows.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 22 }}>Anciens développeurs
            <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
              {" "}— {ancienRows.length} personne(s) · stats conservées, grisées
            </span>
          </div>
          <div className="panel dev-panel">
            <div className="dev-panel-bd">
              <p className="hint" style={{ marginTop: 0 }}>
                Deux origines : <b>marqué « parti »</b> par le chef de projet, ou <b>sans activité Jira depuis {inactiveMonths} mois</b> (détection automatique — à confirmer, car un développeur peut être actif sans rien saisir dans Jira).
              </p>
              <div className="dev-list">
                {ancienRows.map((r) => {
                  const left = isLeft(r.dev);
                  return (
                    <div className={`dev-row ${left ? "del" : "inactive"}`} key={r.dev} role="button" tabIndex={0}
                      onClick={() => onDev && onDev(r.dev)} title="Voir la fiche du développeur">
                      <span className="dev-name dname">{r.dev}
                        {left
                          ? <span className="dev-del-tag">ne fait plus partie d'Armonie</span>
                          : <span className="dev-inactive-tag">sans activité depuis {inactiveMonths} mois{r.lastLabel ? ` · dern. ${r.lastLabel}` : ""}</span>}
                      </span>
                      <span className="dev-bar"><span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} /></span>
                      <span className="dev-counts">
                        {counts(r)}
                        {left
                          ? (onRestoreDev ? <button className="dev-hide" title="Réintégrer dans l'équipe active" onClick={(e) => { e.stopPropagation(); onRestoreDev(r.dev); }}>Réintégrer</button> : null)
                          : (onMarkLeft ? <button className="dev-hide" title="Confirmer qu'il a quitté Armonie" onClick={(e) => { e.stopPropagation(); onMarkLeft(r.dev); }}>Marquer parti</button> : null)}
                        <span className="dev-caret">›</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="hint">
        Clique un développeur pour ouvrir sa fiche (tickets pris, activité, répartition par mois).
        Légende : <span className="pill done">terminés</span> <span className="pill prog">en cours</span> <span className="pill todo">en recette</span>. Le volume reflète l'activité Jira, pas une note de performance.
        <br />
        <b>Comment c'est compté :</b> un ticket est rattaché à <b>toutes</b> les personnes qui y ont contribué — la personne <b>assignée</b> dans Jira, un nom « (Prénom Nom) » écrit en fin de titre, et les <b>initiales en étiquette</b> (ex. « HRE » → Hamza). Un même ticket peut donc compter pour deux personnes. Les tickets sans personne tombent dans <b>« Non assigné&nbsp;⚠ »</b> ({nonAssigne} ici).
      </p>
    </>
  );
}
