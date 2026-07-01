import { useEffect, useState } from "react";
import { fetchCharge } from "../api.js";

// Vue « Charge & capacité » : qui porte quoi, qui est en surcharge, qui a de la
// marge — tiré des assignations Jira réelles. WIP = tickets actifs côté équipe.

const ETAT = {
  surcharge: { t: "Surcharge", c: "chg-red" },
  ok: { t: "Charge normale", c: "chg-ok" },
  marge: { t: "De la marge", c: "chg-green" },
  non_assigne: { t: "Non assigné", c: "chg-grey" },
};

export default function Charge({ onDev }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    fetchCharge().then((r) => on && setData(r)).catch((e) => on && setErr(e && e.message ? e.message : String(e)));
    return () => { on = false; };
  }, []);

  if (err) return <div className="af"><p className="af-empty af-err">Charge indisponible : {err}</p></div>;
  if (!data) return <div className="af"><div className="af-skel" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div></div>;

  const maxWip = Math.max(1, ...data.devs.map((d) => d.wip));
  const s = data.stats;

  return (
    <div className="af charge">
      <div className="af-intro"><b>Charge & capacité.</b> Le travail en cours (WIP) par personne : tickets actifs côté équipe (en cours, retour de test, recette Armonie). Les statuts en attente client ne comptent pas — la balle n'est pas dans notre camp.</div>
      <p className="af-do">→ <b>Quoi en faire :</b> repérer d'un coup d'œil qui est en <b>surcharge</b> (à délester) et qui a de la <b>marge</b> (à qui confier). Seuils : surcharge ≥ {data.seuils.surcharge} WIP, marge ≤ {data.seuils.marge}.</p>

      <div className="af-kpis">
        <div className="af-kpi"><b>{s.personnes}</b><span>personnes actives</span></div>
        <div className="af-kpi"><b>{s.wipMoyen}</b><span>WIP moyen</span></div>
        <div className={`af-kpi ${s.surcharges ? "af-kpi-reg" : ""}`}><b>{s.surcharges}</b><span>en surcharge</span></div>
        <div className="af-kpi af-kpi-d"><b>{s.marges}</b><span>avec de la marge</span></div>
      </div>

      <div className="panel sante-panel">
        <ul className="chg-list">
          {data.devs.map((d) => {
            const et = ETAT[d.etat] || ETAT.ok;
            return (
              <li className="chg-row" key={d.dev}>
                <div className="chg-hd">
                  {d.nonAssigne
                    ? <span className="chg-name chg-name-na">{d.dev}</span>
                    : <button type="button" className="chg-name" onClick={() => onDev && onDev({ name: d.dev })} title="Ouvrir la fiche">{d.dev}</button>}
                  <span className={`chg-etat ${et.c}`}>{et.t}</span>
                  <span className="chg-wip"><b>{d.wip}</b> WIP</span>
                </div>
                <div className="chg-bar"><span className={`chg-bar-f ${et.c}`} style={{ width: `${Math.round((d.wip / maxWip) * 100)}%` }} /></div>
                <div className="chg-meta">
                  {d.parCat.length ? d.parCat.map((c) => <span className="chg-chip" key={c.cat}>{c.label} <b>{c.n}</b></span>) : <span className="chg-muted">aucun ticket actif</span>}
                  {d.afaire ? <span className="chg-chip chg-chip-soft">À faire <b>{d.afaire}</b></span> : null}
                  {d.attente ? <span className="chg-chip chg-chip-soft">Attente client <b>{d.attente}</b></span> : null}
                  {d.oldestActiveJours != null ? <span className="chg-chip chg-chip-soft">+ vieux actif <b>{d.oldestActiveJours} j</b></span> : null}
                </div>
                <div className="chg-doss">{d.dossiers.slice(0, 6).map((x) => <span className="chg-doss-i" key={x.nom}>{x.nom} <i>{x.n}</i></span>)}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
