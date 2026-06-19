import React, { useMemo, useState } from "react";

import { CAT_ORDER as ORDER, CAT_LABEL as LABEL, CLOS as DONE, RECETTE, RETOUR, PIPELINE_ACTIFS as ACTIVE } from "../groups.js";

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
  const [q, setQ] = useState(""); // recherche propre à la page (dossier ou ticket)
  const ql = q.trim().toLowerCase();
  const matchItem = (i) => !ql || `${i.cle} ${i.resume || ""}`.toLowerCase().includes(ql);

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
  const totEnRecette = data.reduce((s, r) => s + r.enRecette, 0);
  const totValides = data.reduce((s, r) => s + r.valides, 0);

  if (!issues.length) return <div className="panel empty">Aucune donnée — actualise depuis Jira.</div>;

  const pick = (dossier, kind, key) => setSel((s) => {
    const cur = s[dossier];
    if (cur && cur.kind === kind && cur.key === key) { const n = { ...s }; delete n[dossier]; return n; }
    return { ...s, [dossier]: { kind, key } };
  });
  const listFor = (r) => {
    const cur = sel[r.dossier]; if (!cur) return null;
    const cats = cur.kind === "cat" ? [cur.key] : (GROUP_CATS[cur.key] || []);
    return r.items.filter((i) => cats.includes(i.categorie) && matchItem(i))
      .sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));
  };
  const labelOf = (cur) => cur.kind === "cat" ? LABEL[cur.key]
    : ({ reste: "à recetter", enRecette: "en recette", retours: "à retravailler", actifs: "actifs", done: "validés" }[cur.key] || cur.key);

  return (
    <>
      <div className="rec-hero hero-with-search">
        <div className="ph-main">
          <span className="rec-hero-k">Recette</span>
          <h2>Pilotage de bout en bout</h2>
          <p>Suivi des programmes de leur entrée en recette jusqu'à la mise en production — clique un chiffre, une pastille puis un programme pour ouvrir sa fiche et sa chaîne de statuts.</p>
        </div>
        <div className="page-search on-hero">
          <span className="ps-ic">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un dossier, un programme…" aria-label="Rechercher en recette" />
          {q && <button className="ps-x" onClick={() => setQ("")} title="Effacer">×</button>}
        </div>
      </div>

      {data.filter((r) => !ql || r.dossier.toLowerCase().includes(ql) || r.items.some(matchItem)).map((r) => {
        const cur = sel[r.dossier];
        const list = listFor(r);
        const on = (kind, key) => cur && cur.kind === kind && cur.key === key ? "is-on" : "";
        return (
          <div className="rc2-card" key={r.dossier}>
            <div className="rc2-top">
              <div className="rc2-id">
                <span className="rc2-name">{r.dossier}</span>
                {r.engagement ? <span className={`eng-badge ${r.engagement === "Projet" ? "is-projet" : r.engagement === "TMA" ? "is-tma" : "is-mix"}`}>{r.engagement}</span> : null}
              </div>
              <div className="rc2-metrics">
                <button className={`rc2-m ${on("group", "reste")}`} onClick={() => pick(r.dossier, "group", "reste")}><b>{r.reste}</b><small>à recetter</small></button>
                <button className={`rc2-m ${on("group", "enRecette")}`} onClick={() => pick(r.dossier, "group", "enRecette")}><b>{r.enRecette}</b><small>en recette</small></button>
                <button className={`rc2-m rew ${r.retours ? "hot" : ""} ${on("group", "retours")}`} onClick={() => pick(r.dossier, "group", "retours")}><b>{r.retours}</b><small>à retravailler</small></button>
                <button className={`rc2-m done ${on("group", "done")}`} onClick={() => pick(r.dossier, "group", "done")}><b>{r.valides}</b><small>validés</small></button>
              </div>
            </div>

            <div className="rc2-bar" title="Répartition du pipeline">
              {[["#3a6fb5", r.actifs, "À faire / En cours"], ["var(--orange)", r.retours, "À retravailler"], ["var(--gold)", r.enRecette, "En recette"], ["var(--green)", r.valides, "Validés"], ["#b9b6c8", r.cats.annule || 0, "Annulé"]]
                .filter(([, v]) => v > 0)
                .map(([c, v, t], idx) => (
                  <span key={idx} className="rc2-seg" title={`${t} : ${v}`} style={{ width: `${(v / r.total) * 100}%`, background: c }} />
                ))}
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
