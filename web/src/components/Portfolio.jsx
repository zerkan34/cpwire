import React, { useState } from "react";
import { ACTIFS } from "../groups.js";
import { cle } from "../lib/commun.js";

const SEV_CLS = { critique: "red", surveiller: "amber", controle: "green" };
const CAT_CLS = { encours: "prog", retourTest: "block", retourProd: "block" };
// Couleur de la pastille priorité selon le nom Jira (quel que soit le schéma : Highest/High… ou Priorité 1/2…).
function prioClass(p) {
  const s = (p || "").toLowerCase();
  if (/highest|urgent|critique|critical|bloquant|\b1\b|p1|^1/.test(s)) return "p-hi";
  if (/high|haute|élevé|eleve|major|majeur|\b2\b|p2|^2/.test(s)) return "p-md";
  return "p-lo";
}
const GROUPS = [
  ["encours", "En cours"],
  ["retourTest", "Retour test"],
  ["retourProd", "Retour prod"],
];

function Card({ dossier, f, eng, att, risk, onClick, onOpen360, can360, onTicket }) {
  const [open, setOpen] = useState(false);
  const sev = att?.severity || ((f.enRetard || 0) > 0 || (f.retours || 0) > 2 ? "surveiller" : "controle");
  const cls = SEV_CLS[sev] || "green";
  const reason = att?.reasons?.[0]?.text || null;

  // « Ce qui se fait » = tickets actifs, regroupés par état.
  const active = (f.items || []).filter((i) => ACTIFS.includes(i.categorie));
  const groups = GROUPS
    .map(([cat, label]) => ({ cat, label, items: active.filter((i) => i.categorie === cat) }))
    .filter((g) => g.items.length);

  // Débit réel : ce qui a été résolu aujourd'hui / sur 7 jours (dates Jira), plutôt que le cumul depuis toujours.
  const _today = new Date().toISOString().slice(0, 10);
  const _wk = Date.now() - 7 * 86400000;
  const faitJour = (f.items || []).filter((i) => (i.resolu || "").slice(0, 10) === _today).length;
  const faitSem = (f.items || []).filter((i) => i.resolu && new Date(i.resolu).getTime() >= _wk).length;

  return (
    <div className={`pcard sev-${cls}`} onClick={onClick}>
      <div className="pc-head">
        <div className="pc-title">
          <span className={`pc-pastille ${cls}`} aria-hidden="true" />
          <h3>{dossier}</h3>
          {eng ? <span className={`eng-badge ${eng === "Projet" ? "is-projet" : eng === "TMA" ? "is-tma" : "is-mix"}`}>{eng}</span> : null}
          {risk && risk.score > 0 ? <span className={`pc-risk risk-niv-${risk.niveau.replace(/é/g, "e")}`} title={risk.facteurs.slice(0, 4).map((x) => `${x.n} ${x.label}`).join(" · ")}>risque {risk.score}</span> : null}
        </div>
      </div>
      {sev !== "controle" && reason ? (
        <div className="pc-why">
          <div className={`pc-reason ${cls}`}>{reason}</div>
          {att?.action ? <div className="pc-action">→ {att.action}</div> : null}
        </div>
      ) : (
        <div className="pc-reason calm">À jour</div>
      )}
      <div className="meta"><b className="meta-day">{faitJour} fait{faitJour > 1 ? "s" : ""} aujourd'hui</b> · {faitSem} cette semaine · {f.reste} à traiter</div>
      <div className="pbar"><span style={{ width: `${f.pct}%` }} /></div>
      <div className="stats">
        {f.enRetard > 0 && <span className="dot block">{f.enRetard} en retard</span>}
        {f.retours > 0 && <span className="dot ret">{f.retours} retour{f.retours > 1 ? "s" : ""}</span>}
        <span className="dot todo">{f.cats.afaire} à faire</span>
        <span className="dot prog">{f.actifsDev} en cours</span>
        {f.enRecette > 0 && <span className="dot rec">{f.enRecette} en recette</span>}
        <span className="dot done">{f.valides} validé{f.valides > 1 ? "s" : ""}</span>
      </div>

      {active.length > 0 ? (
        <div className="pc-acc">
          <button className="pc-acc-tg" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            <span className={`pc-acc-cv ${open ? "o" : ""}`} aria-hidden="true">›</span>
            Ce qui se fait <b>{active.length}</b>
          </button>
          {open ? (
            <div className="pc-acc-scroll">
              {groups.map((g) => (
                <div className="pc-acc-grp" key={g.cat}>
                  <div className="pc-acc-grp-hd">
                    <span className={`pc-acc-bullet ${CAT_CLS[g.cat]}`} aria-hidden="true" />
                    {g.label} <b>{g.items.length}</b>
                  </div>
                  <ul className="pc-acc-list">
                    {g.items.map((i) => {
                      const blocked = i.statut === "Bloqué" || i.flagged;
                      return (
                        <li key={i.cle}>
                          <button className="pc-acc-row" onClick={(e) => { e.stopPropagation(); onTicket && onTicket(i); }}>
                            <span className="pc-acc-main">
                              <span className="pc-acc-l1">{i.flagged ? <span className="pc-acc-flag" title="Flaggé dans Jira (impediment)">🚩</span> : null}<b className="pc-acc-key">{i.cle}</b>{i.resume}</span>
                              <span className={`pc-acc-l2 ${blocked ? "blocked" : ""}`}>
                                {blocked ? `bloqué${i.assigne ? ` · ${i.assigne}` : ""}` : (i.assigne || "non assigné")}
                                {i.priorite ? <span className={`pc-acc-prio ${prioClass(i.priorite)}`} title={`Priorité Jira : ${i.priorite}`}>{i.priorite}</span> : null}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {onOpen360 && (!can360 || can360(dossier)) ? <button className="pcard-360" onClick={(e) => { e.stopPropagation(); onOpen360(dossier); }} title="Vue complète du client">Fiche 360°</button> : null}
    </div>
  );
}

export default function Portfolio({ facts, engagement = {}, attention = {}, risk = {}, onOpen, onOpen360, can360, onTicket }) {
  const localScore = (f) => (f.enRetard || 0) * 1000 + (f.retours || 0) * 50 + (f.reste || 0);
  const score = (d, f) => (attention[d]?.score ?? localScore(f));
  const entries = Object.entries(facts?.byDossier || {}).sort((a, b) => score(b[0], b[1]) - score(a[0], a[1]));
  if (!entries.length) return <div className="panel empty">Aucun projet à afficher pour l'instant.</div>;
  return (
    <div className="cards">
      {entries.map(([dossier, f]) => (
        <Card key={dossier} dossier={dossier} f={f} eng={engagement[dossier]} att={attention[dossier]} risk={risk[cle(dossier)]}
          onClick={() => onOpen(dossier)} onOpen360={onOpen360} can360={can360} onTicket={onTicket} />
      ))}
    </div>
  );
}
