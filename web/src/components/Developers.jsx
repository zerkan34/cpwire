import React, { useEffect, useMemo, useState } from "react";
import { fetchCadence } from "../api.js";

const ACTIVE = ["encours", "retourTest", "retourProd"];
const DONE = ["termine", "miseEnProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];
const fmt = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);

// Onglet "Développeurs" : pouls de l'équipe (cadence réelle déduite de Jira) + synthèse
// par développeur unifiée (charge ACTUELLE + rythme). Clic sur un dev -> sa fiche.
// Deux groupes : développeurs ACTIFS, et ANCIENS (marqués "parti" ou sans activité depuis N mois).
export default function Developers({ issues = [], onTicket, onDev, deletedDevs = [], inactiveDevs = [], inactiveMonths = 2, onMarkLeft, onRestoreDev }) {
  const [dossier, setDossier] = useState("Tous");
  const [weeks, setWeeks] = useState(8);
  const [q, setQ] = useState(""); // recherche par nom de développeur (propre à la page)
  const [weekModal, setWeekModal] = useState(null); // détail d'une semaine (tickets résolus)
  const [rep, setRep] = useState(null);     // cadence (serveur)
  const delSet = new Set(deletedDevs);        // marqués manuellement "parti d'Armonie"
  const inactiveSet = new Set(inactiveDevs);  // détectés sans activité Jira depuis N mois

  // Cadence de l'équipe (débit, délais, par dev) — calculée côté serveur depuis les dates Jira.
  useEffect(() => {
    let alive = true;
    fetchCadence(weeks).then((r) => { if (alive) setRep(r); }).catch(() => { if (alive) setRep(null); });
    return () => { alive = false; };
  }, [weeks]);

  // Index du rythme par nom de développeur, pour jointure avec la charge.
  const cadByDev = useMemo(() => {
    const m = {}; (rep?.devs || []).forEach((d) => { m[d.nom] = d; }); return m;
  }, [rep]);
  const seuil = rep?.seuilSouffranceJours;
  const openTicket = (cle) => { if (onTicket && cle) { const t = issues.find((i) => i.cle === cle); if (t) onTicket(t); } };

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

  const matchQ = (r) => !q.trim() || r.dev.toLowerCase().includes(q.trim().toLowerCase());
  const activeRows = rows.filter((r) => !isAncien(r.dev)).filter(matchQ);
  const ancienRows = rows.filter((r) => isAncien(r.dev)).filter(matchQ);

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

  // Sous-ligne "rythme" sous le nom : résolus 30 j + alerte plus ancien en cours (souffrance).
  const rythme = (r) => {
    const c = cadByDev[r.dev];
    if (!c) return null;
    const traine = seuil != null && c.plusAncienJours > seuil;
    return (
      <span className="dev-rythme">
        <span><b>{c.resolus30}</b> résolus/30 j</span>
        {c.debitHebdo != null ? <span>{c.debitHebdo}/sem</span> : null}
        {c.plusAncienCle ? <span className={traine ? "souffrance" : ""} title="Plus ancien ticket en cours">⏳ {c.plusAncienJours} j</span> : null}
      </span>
    );
  };

  const e = rep?.equipe || {};
  const maxW = Math.max(1, ...((rep?.hebdo) || []).map((h) => h.count));

  return (
    <>
      <div className="page-hero">
        <span className="page-hero-k">Équipe</span>
        <h2>Développeurs</h2>
        <p>{realDevs} en activité{ancienRows.length ? ` · ${ancienRows.length} ancien(s)` : ""} · {totalTickets} ticket(s){nonAssigne ? ` · ${nonAssigne} non assigné(s)` : ""}{dossier !== "Tous" ? ` · ${dossier}` : ""}</p>
        <div className="page-search on-hero">
          <span className="ps-ic">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un développeur…" aria-label="Rechercher un développeur" />
          {q && <button className="ps-x" onClick={() => setQ("")} title="Effacer">×</button>}
        </div>
      </div>

      {/* ---- Pouls de l'équipe (cadence réelle, déduite des dates Jira) ---- */}
      <div className="panel dev-panel">
        <div className="recap-hd">
          <span className="recap-hd-name">Pouls de l'équipe</span>
          <span className="recap-hd-meta">rythme réel, calculé depuis Jira</span>
        </div>
        <div className="dev-panel-bd">
          {!rep ? (
            <div className="empty">Calcul du rythme de l'équipe…</div>
          ) : (
            <>
              <div className="enc-toggle" role="tablist">
                {[8, 12, 16].map((w) => (
                  <button key={w} className={`enc-tg ${weeks === w ? "on" : ""}`} onClick={() => setWeeks(w)}>{w} sem.</button>
                ))}
              </div>
              <div className="section-title" style={{ marginTop: 22, fontSize: 15 }}>Débit hebdomadaire — tickets résolus</div>
              <div className="cad-chart">
                {(rep.hebdo || []).map((h, idx) => (
                  <div className="cad-bar-wrap" key={idx} title={h.count ? `Semaine du ${h.label} : ${h.count} résolu(s) — cliquer pour le détail` : `Semaine du ${h.label} : 0`} role={h.count ? "button" : undefined} style={{ cursor: h.count ? "pointer" : "default" }} onClick={() => h.count && setWeekModal(h)}>
                    <div className="cad-bar-v">{h.count || ""}</div>
                    <div className="cad-bar" style={{ height: `${Math.round((h.count / maxW) * 100)}%` }} />
                    <div className="cad-bar-x">{h.label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- Synthèse par développeur : charge + rythme ---- */}
      <div className="panel dev-panel" style={{ marginTop: 18 }}>
        <div className="recap-hd">
          <span className="recap-hd-name">Synthèse par développeur</span>
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
                  <span className="dev-id">
                    <span className="dev-name dname">{r.dev}{r.dev === "Non assigné" ? " ⚠" : ""}</span>
                    {rythme(r)}
                  </span>
                  <span className="dev-bar"><span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} /></span>
                  <span className="dev-counts">
                    {counts(r)}
                    {onMarkLeft && r.dev !== "Non assigné" ? <button className="dev-hide" title="Marquer ce développeur comme parti d'Armonie" onClick={(ev) => { ev.stopPropagation(); onMarkLeft(r.dev); }}>Marquer parti</button> : <span className="dev-hide-ph" />}
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
                      <span className="dev-id">
                        <span className="dev-name dname">{r.dev}
                          {left
                            ? <span className="dev-del-tag">ne fait plus partie d'Armonie</span>
                            : <span className="dev-inactive-tag">sans activité depuis {inactiveMonths} mois{r.lastLabel ? ` · dern. ${r.lastLabel}` : ""}</span>}
                        </span>
                        {rythme(r)}
                      </span>
                      <span className="dev-bar"><span className="dev-bar-fill" style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }} /></span>
                      <span className="dev-counts">
                        {counts(r)}
                        {left
                          ? (onRestoreDev ? <button className="dev-hide" title="Réintégrer dans l'équipe active" onClick={(ev) => { ev.stopPropagation(); onRestoreDev(r.dev); }}>Réintégrer</button> : null)
                          : (onMarkLeft ? <button className="dev-hide" title="Confirmer qu'il a quitté Armonie" onClick={(ev) => { ev.stopPropagation(); onMarkLeft(r.dev); }}>Marquer parti</button> : null)}
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
        Charge : <span className="pill done">terminés</span> <span className="pill prog">en cours</span> <span className="pill todo">en recette</span> · Rythme (sous le nom) : <b>résolus/30 j</b>, débit/sem et <b>⏳ plus ancien en cours</b> (orange = en souffrance, au‑delà de {seuil ?? "—"} j).
        <br />
        <b>Comment c'est compté :</b> un ticket est rattaché à <b>toutes</b> les personnes qui y ont contribué — la personne <b>assignée</b> dans Jira, un nom « (Prénom Nom) » écrit en fin de titre, et les <b>initiales en étiquette</b> (ex. « HRE » → Hamza). Un même ticket peut donc compter pour deux personnes. Les tickets sans personne tombent dans <b>« Non assigné&nbsp;⚠ »</b> ({nonAssigne} ici). Le rythme (résolus, délais) est attribué à l'assigné courant.
      </p>

      {weekModal && (
        <div className="wk-back" onClick={() => setWeekModal(null)}>
          <div className="wk-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="wk-hero">
              <span className="wk-k">Débit hebdomadaire</span>
              <h3>Semaine du {weekModal.label}</h3>
              <p>{weekModal.count} ticket(s) résolu(s) cette semaine</p>
              <button className="wk-close" title="Fermer" onClick={() => setWeekModal(null)}>✕</button>
            </div>
            <div className="wk-body">
              {(weekModal.keys || []).length === 0 ? (
                <div className="empty">Aucun détail disponible pour cette semaine.</div>
              ) : (
                <ul className="wk-list">
                  {(weekModal.keys || []).map((k) => {
                    const it = issues.find((i) => i.cle === k);
                    return (
                      <li key={k} role="button" onClick={() => { if (it && onTicket) { onTicket(it); setWeekModal(null); } }}>
                        <span className="k">{k}</span>
                        <span className="wk-res">{it ? it.resume : "(ticket hors périmètre courant)"}</span>
                        {it ? <span className="tag">{it.dossier}</span> : null}
                        {it ? <span className={`pill ${it.categorie === "termine" || it.categorie === "miseEnProd" ? "done" : "prog"}`}>{it.statutJira || it.statut}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
