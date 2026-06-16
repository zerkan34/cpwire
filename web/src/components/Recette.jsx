import React, { useMemo, useState } from "react";

const LABEL = {
  afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
  miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé",
};
const ORDER = ["afaire", "encours", "retourTest", "retourProd", "recetteArmonie", "recetteClient", "attenteClient", "miseEnProd", "termine", "annule"];
const DONE = ["termine", "miseEnProd", "annule"];
const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];
const RETOUR = ["retourTest", "retourProd"];
const ACTIVE = ["afaire", "encours"];

// Quelles catégories pour un "groupe" cliqué.
const GROUP_CATS = {
  reste: ORDER.filter((k) => !DONE.includes(k)),
  enRecette: RECETTE,
  retours: RETOUR,
  actifs: ACTIVE,
  done: ["termine", "miseEnProd"],
};

export default function Recette({ issues = [], onTicket }) {
  const [sel, setSel] = useState({}); // { [dossier]: {kind:'group'|'cat', key} }

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
      r.reste = r.total - done;
      r.enRecette = RECETTE.reduce((s, k) => s + (r.cats[k] || 0), 0);
      r.retours = RETOUR.reduce((s, k) => s + (r.cats[k] || 0), 0);
      r.actifs = ACTIVE.reduce((s, k) => s + (r.cats[k] || 0), 0);
      r.valides = (r.cats.termine || 0) + (r.cats.miseEnProd || 0);
      const engs = new Set(r.items.map((i) => i.engagement).filter((e) => e && e !== "—"));
      r.engagement = engs.size === 0 ? "" : engs.size === 1 ? [...engs][0] : "TMA + Projet";
      return r;
    }).sort((a, b) => b.reste - a.reste);
  }, [issues]);

  const totReste = data.reduce((s, r) => s + r.reste, 0);
  const totRetours = data.reduce((s, r) => s + r.retours, 0);

  if (!issues.length) return <div className="panel empty">Aucune donnée — actualise depuis Jira.</div>;

  const pick = (dossier, kind, key) => setSel((s) => {
    const cur = s[dossier];
    if (cur && cur.kind === kind && cur.key === key) { const n = { ...s }; delete n[dossier]; return n; }
    return { ...s, [dossier]: { kind, key } };
  });
  const listFor = (r) => {
    const cur = sel[r.dossier]; if (!cur) return null;
    const cats = cur.kind === "cat" ? [cur.key] : (GROUP_CATS[cur.key] || []);
    return r.items.filter((i) => cats.includes(i.categorie))
      .sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));
  };
  const labelOf = (cur) => cur.kind === "cat" ? LABEL[cur.key]
    : ({ reste: "à recetter", enRecette: "en recette", retours: "à retravailler", actifs: "actifs", done: "validés" }[cur.key] || cur.key);

  return (
    <>
      <div className="section-title">Recette — pilotage de bout en bout
        <span style={{ fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {totReste} à recetter · {totRetours} à retravailler
        </span>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Clique un <b>chiffre</b> ou une <b>pastille</b> pour dérouler les programmes concernés, puis un <b>programme</b> pour ouvrir sa fiche et sa chaîne de statuts.
      </p>

      {data.map((r) => {
        const cur = sel[r.dossier];
        const list = listFor(r);
        const on = (kind, key) => cur && cur.kind === kind && cur.key === key ? "is-on" : "";
        return (
          <div className="rec-card" key={r.dossier}>
            <div className="rec-hd">
              <span className="rec-name">{r.dossier}</span>
              {r.engagement ? <span className={`eng-badge ${r.engagement === "Projet" ? "is-projet" : r.engagement === "TMA" ? "is-tma" : "is-mix"}`}>{r.engagement}</span> : null}
              <span className="rec-metrics">
                <button className={`rec-m rec-big ${on("group", "reste")}`} onClick={() => pick(r.dossier, "group", "reste")}><b>{r.reste}</b><small>à recetter</small></button>
                <button className={`rec-m ${on("group", "enRecette")}`} onClick={() => pick(r.dossier, "group", "enRecette")}><b>{r.enRecette}</b><small>en recette</small></button>
                <button className={`rec-m ${r.retours ? "rec-rew" : ""} ${on("group", "retours")}`} onClick={() => pick(r.dossier, "group", "retours")}><b>{r.retours}</b><small>à retravailler</small></button>
                <button className={`rec-m rec-done ${on("group", "done")}`} onClick={() => pick(r.dossier, "group", "done")}><b>{r.valides}</b><small>validés</small></button>
              </span>
            </div>

            <div className="rec-chips">
              {ORDER.filter((k) => r.cats[k]).map((k) => (
                <button className={`rec-chip cat-${k} ${on("cat", k)}`} key={k} onClick={() => pick(r.dossier, "cat", k)}>{LABEL[k]}<b>{r.cats[k]}</b></button>
              ))}
            </div>

            {cur && list && (
              <div className="rec-drill">
                <div className="rec-drill-hd">{list.length} programme(s) · <b>{labelOf(cur)}</b>
                  <button className="rec-drill-x" onClick={() => pick(r.dossier, cur.kind, cur.key)} title="Fermer">×</button>
                </div>
                {list.length === 0 ? <div className="rec-drill-empty">Aucun programme dans cette catégorie.</div> : (
                  <ul className="rec-rew-list">
                    {list.map((i) => (
                      <li key={i.cle} onClick={() => onTicket && onTicket(i)} title="Ouvrir la fiche et la chaîne de statuts">
                        <span className="k">{i.cle}</span>
                        <span className="rr-res">{i.resume}</span>
                        <span className={`rec-chip cat-${i.categorie}`}>{LABEL[i.categorie]}</span>
                        {i.dev && i.dev !== "Non assigné" ? <span className="tag">{i.dev}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
