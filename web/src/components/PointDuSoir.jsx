import React, { useEffect, useState } from "react";

// « Le point du soir » — reproduit le relevé quotidien par statut (mêmes libellés
// que le mail de la direction), avec les écarts vs le dernier relevé d'un jour
// antérieur. Les chiffres viennent de computeFacts (cats atomiques) → toujours vrais.
// L'historique jour-à-jour est mémorisé localement (par navigateur) : les écarts
// apparaissent dès le 2e jour de consultation.
const ROWS = [
  ["miseEnProd", "Mise en production"],
  ["termine", "Terminé"],
  ["recetteClient", "Recette client"],
  ["recetteArmonie", "Recette Armonie"],
  ["encours", "En cours"],
  ["retourTest", "Retour de test"],
  ["attenteClient", "En attente client"],
];
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDelta = (d) => (d == null ? "·" : d === 0 ? "(=)" : d > 0 ? `(+${d})` : `(${d})`);

export default function PointDuSoir({ dossier, cats, items = [], onTicket }) {
  const cats0 = cats || {};
  const [baseline, setBaseline] = useState(null);
  const [copied, setCopied] = useState(false);
  const [openK, setOpenK] = useState(null);

  useEffect(() => {
    if (!dossier) return;
    const key = `cpwire:point:${dossier}`;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { store = {}; }
    const today = todayStr();
    const past = Object.keys(store).filter((d) => d < today).sort();
    setBaseline(past.length ? { date: past[past.length - 1], cats: store[past[past.length - 1]] } : null);
    // Enregistre le relevé du jour (cats des 7 statuts), garde 14 jours.
    store[today] = ROWS.reduce((o, [k]) => { o[k] = cats0[k] || 0; return o; }, {});
    const keep = Object.keys(store).sort().slice(-14);
    const trimmed = {}; keep.forEach((d) => { trimmed[d] = store[d]; });
    try { localStorage.setItem(key, JSON.stringify(trimmed)); } catch (e) { /* quota / privé : on ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier]);

  const rows = ROWS.map(([k, label]) => {
    const n = cats0[k] || 0;
    const prev = baseline ? (baseline.cats[k] ?? null) : null;
    return { k, label, n, delta: prev == null ? null : n - prev };
  });
  const total = rows.reduce((s, r) => s + r.n, 0);
  const horsPoint = (cats0.afaire || 0) + (cats0.annule || 0) + (cats0.retourProd || 0);

  const copy = async () => {
    const lines = rows.map((r) => `${r.label} : ${r.n} ${fmtDelta(r.delta)}`).join("\n");
    const txt = `Point du ${new Date().toLocaleDateString("fr-FR")} — ${dossier}\n\n${lines}`;
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { /* clipboard indispo */ }
  };

  return (
    <div className="pds">
      <div className="pds-head">
        <h3 className="c360-sec" style={{ margin: 0 }}>Le point du soir</h3>
        <button className="pds-copy" onClick={copy}>{copied ? "Copié ✓" : "Copier le point"}</button>
      </div>
      <table className="pds-tbl">
        <tbody>
          {rows.map((r) => {
            const open = openK === r.k;
            const clickable = r.n > 0 && typeof onTicket === "function";
            const its = open ? (items || []).filter((i) => i.categorie === r.k) : null;
            return (
              <React.Fragment key={r.k}>
                <tr className={`pds-row ${clickable ? "clk" : ""} ${open ? "open" : ""}`}
                    onClick={clickable ? () => setOpenK(open ? null : r.k) : undefined}>
                  <td className="pds-lbl">{clickable ? <span className="pds-cv" aria-hidden="true">›</span> : null}{r.label}</td>
                  <td className="pds-n">{r.n}</td>
                  <td className={`pds-d ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}`}>{fmtDelta(r.delta)}</td>
                </tr>
                {open && its && its.length > 0 ? (
                  <tr className="pds-sub"><td colSpan={3}>
                    <ul className="pds-tickets">
                      {its.map((i) => (
                        <li key={i.cle}>
                          <button className="pds-tk" onClick={(e) => { e.stopPropagation(); onTicket(i); }}>
                            {i.flagged ? <span className="pds-flag">🚩</span> : null}
                            <b className="pds-tk-key">{i.cle}</b>
                            <span className="pds-tk-res">{i.resume}</span>
                            <span className="pds-tk-asg">{i.assigne || "non assigné"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </td></tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="pds-foot">
        {total} tickets suivis{horsPoint ? ` · ${horsPoint} hors point (à faire / annulés / retour prod)` : ""}
        {baseline ? ` · écarts vs le ${baseline.date}` : " · premier relevé enregistré — les écarts apparaîtront au prochain jour"}
      </p>
    </div>
  );
}
