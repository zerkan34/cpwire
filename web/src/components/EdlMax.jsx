import React, { useMemo, useState } from "react";
import DATA from "../data/edlMax.json";

// Suivi refonte MAX (EDL) — source : fichier fourni par EDL, jamais mélangé au Jira.
const ST = {
  "validé": { cls: "done", label: "validé" },
  "terminé à valider": { cls: "rec", label: "à valider" },
  "en cours": { cls: "prog", label: "en cours" },
  "à modifier": { cls: "todo", label: "à modifier" },
  "sans modif attendue": { cls: "none", label: "sans modif" },
};
const INSCOPE = new Set(["validé", "terminé à valider", "en cours", "à modifier"]);
const count = (pred) => DATA.filter(pred).length;

export default function EdlMax() {
  const groups = useMemo(() => {
    const m = {};
    for (const e of DATA) (m[e.g2] ||= []).push(e);
    return Object.entries(m);
  }, []);
  const inscope = count((e) => INSCOPE.has(e.statut));
  const val = count((e) => e.statut === "validé");
  const pct = inscope ? Math.round((100 * val) / inscope) : 0;

  return (
    <div className="emx">
      <div className="emx-head">
        <h3 className="c360-sec" style={{ margin: 0 }}>Refonte MAX — écrans</h3>
        <span className="emx-src">source : fichier EDL · {DATA.length} écrans</span>
      </div>
      <div className="emx-prog">
        <div className="emx-pct">{pct}<small>%</small> <span>validés · {val}/{inscope} concernés</span></div>
        <div className="emx-bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="emx-legend">
          <span className="emx-chip done">{val} validés</span>
          <span className="emx-chip rec">{count((e) => e.statut === "terminé à valider")} à valider</span>
          <span className="emx-chip prog">{count((e) => e.statut === "en cours")} en cours</span>
          <span className="emx-chip todo">{count((e) => e.statut === "à modifier")} à modifier</span>
          <span className="emx-chip none">{count((e) => e.statut === "sans modif attendue")} sans modif</span>
        </div>
      </div>
      {groups.map(([g2, items]) => <Group key={g2} g2={g2} items={items} />)}
    </div>
  );
}

function Group({ g2, items }) {
  const [open, setOpen] = useState(false);
  const inscope = items.filter((e) => INSCOPE.has(e.statut)).length;
  const val = items.filter((e) => e.statut === "validé").length;
  const byG3 = {};
  for (const e of items) (byG3[e.g3 || ""] ||= []).push(e);

  return (
    <div className="emx-grp">
      <button className="emx-grp-tg" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`pc-acc-cv ${open ? "o" : ""}`} aria-hidden="true">›</span>
        <span className="emx-grp-name">{g2}</span>
        <span className="emx-grp-meta">{val}/{inscope} validés · {items.length} écrans</span>
      </button>
      {open ? (
        <div className="emx-grp-body">
          {Object.entries(byG3).map(([g3, es]) => (
            <div className="emx-sub" key={g3}>
              {g3 ? <div className="emx-sub-hd">{g3}</div> : null}
              <ul className="emx-list">
                {es.map((e, i) => {
                  const s = ST[e.statut] || { cls: "none", label: "à statuer" };
                  return (
                    <li key={i} className="emx-it">
                      <span className="emx-ec">{e.ecran}</span>
                      <span className="emx-it-right">
                        {e.ordre ? <span className={`emx-prio p${e.ordre}`}>P{e.ordre}</span> : null}
                        <span className={`emx-st ${s.cls}`}>{s.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
