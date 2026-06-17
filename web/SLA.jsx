import React, { useMemo, useState } from "react";

// Libellés des catégories (alignés sur server/config.js → CATEGORY_LABEL).
const LABEL = {
  afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
  miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé",
};
// Ordre d'affichage du pipeline (du début vers la fin du cycle).
const ORDER = ["afaire", "encours", "retourTest", "retourProd", "recetteArmonie", "recetteClient", "attenteClient", "miseEnProd", "termine", "annule"];
const DONE = ["termine", "miseEnProd", "annule"];   // sortis du « reste à recetter »
const RECETTE = ["recetteArmonie", "recetteClient"]; // actuellement en recette
const RETOUR = ["retourTest", "retourProd"];          // revenus en arrière → à retravailler

export default function Recette({ issues = [], onTicket }) {
  const [open, setOpen] = useState({});

  const data = useMemo(() => {
    const m = {};
    issues.forEach((i) => {
      const d = i.dossier || "Autre";
      const r = (m[d] ||= { dossier: d, total: 0, cats: {}, items: [] });
      r.total += 1;
      r.cats[i.categorie] = (r.cats[i.categorie] || 0) + 1;
      r.items.push(i);
    });
    return Object.values(m).map((r) => {
      const done = DONE.reduce((s, k) => s + (r.cats[k] || 0), 0);
      r.reste = r.total - done;                                    // pas encore validé
      r.enRecette = RECETTE.reduce((s, k) => s + (r.cats[k] || 0), 0);
      r.retours = RETOUR.reduce((s, k) => s + (r.cats[k] || 0), 0);
      r.reworkItems = r.items.filter((i) => RETOUR.includes(i.categorie))
        .sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));
      const engs = new Set(r.items.map((i) => i.engagement).filter((e) => e && e !== "—"));
      r.engagement = engs.size === 0 ? "" : engs.size === 1 ? [...engs][0] : "TMA + Projet";
      return r;
    }).sort((a, b) => b.reste - a.reste);
  }, [issues]);

  const totReste = data.reduce((s, r) => s + r.reste, 0);
  const totRetours = data.reduce((s, r) => s + r.retours, 0);

  if (!issues.length) return <div className="panel empty">Aucune donnée — actualise depuis Jira.</div>;

  return (
    <>
      <div className="section-title">Recette — à recetter &amp; à retravailler
        <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {totReste} à recetter · {totRetours} à retravailler
        </span>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        <b>Reste à recetter</b> = programmes pas encore validés (tout sauf <i>Mise en prod</i>, <i>Terminé</i>, <i>Annulé</i>).
        {" "}<b>En recette</b> = actuellement en <i>Recette Armonie</i> ou <i>Recette client</i>.
        {" "}<b>À retravailler</b> = revenus en <i>Retour test</i> / <i>Retour production</i>. Clique un programme pour voir sa <b>chaîne de statuts</b>.
      </p>

      {data.map((r) => (
        <div className="rec-card" key={r.dossier}>
          <div className="rec-hd">
            <span className="rec-name">{r.dossier}</span>
            {r.engagement ? <span className={`eng-badge ${r.engagement === "Projet" ? "is-projet" : r.engagement === "TMA" ? "is-tma" : "is-mix"}`}>{r.engagement}</span> : null}
            <span className="rec-metrics">
              <span className="rec-m rec-big"><b>{r.reste}</b><small>à recetter</small></span>
              <span className="rec-m"><b>{r.enRecette}</b><small>en recette</small></span>
              <span className={`rec-m ${r.retours ? "rec-rew" : ""}`}><b>{r.retours}</b><small>à retravailler</small></span>
              <span className="rec-m rec-done"><b>{(r.cats.termine || 0) + (r.cats.miseEnProd || 0)}</b><small>validés</small></span>
            </span>
          </div>

          <div className="rec-chips">
            {ORDER.filter((k) => r.cats[k]).map((k) => (
              <span className={`rec-chip cat-${k}`} key={k}>{LABEL[k]}<b>{r.cats[k]}</b></span>
            ))}
          </div>

          {r.reworkItems.length > 0 && (
            <div className="rec-rework">
              <button className="rec-rew-tg" onClick={() => setOpen((o) => ({ ...o, [r.dossier]: !o[r.dossier] }))}>
                {open[r.dossier] ? "▾" : "▸"} {r.reworkItems.length} programme(s) à retravailler (retour)
              </button>
              {open[r.dossier] && (
                <ul className="rec-rew-list">
                  {r.reworkItems.map((i) => (
                    <li key={i.cle} onClick={() => onTicket && onTicket(i)} title="Ouvrir la fiche et voir la chaîne de statuts">
                      <span className="k">{i.cle}</span>
                      <span className="rr-res">{i.resume}</span>
                      <span className={`pill ${i.categorie === "retourProd" ? "block" : "todo"}`}>{LABEL[i.categorie]}</span>
                      {i.dev && i.dev !== "Non assigné" ? <span className="tag">{i.dev}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
