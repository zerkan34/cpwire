import React, { useEffect, useState } from "react";
import { progResume } from "../ticket.js";

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
const CAT_FR = { afaire: "À faire", encours: "En cours", retourTest: "Retour de test", retourProd: "Retour prod", recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "En attente client", miseEnProd: "Mise en production", termine: "Terminé", annule: "Annulé" };

export default function PointDuSoir({ dossier, cats, items = [], onTicket }) {
  const cats0 = cats || {};
  const [baseline, setBaseline] = useState(null);
  const [copied, setCopied] = useState(false);
  const [openK, setOpenK] = useState(null);
  const [period, setPeriod] = useState("tout");

  useEffect(() => {
    if (!dossier) return;
    const key = `cpwire:point:${dossier}`;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { store = {}; }
    const today = todayStr();
    const past = Object.keys(store).filter((d) => d < today).sort();
    setBaseline(past.length ? { date: past[past.length - 1], cats: store[past[past.length - 1]] } : null);
    // Enregistre le relevé du jour (cats des 7 statuts), garde 14 jours.
    // On mémorise la LISTE des clés par statut (et plus seulement le compte),
    // pour afficher le mouvement (entrés / sortis) au relevé suivant.
    const curKeys = {}; ROWS.forEach(([k]) => { curKeys[k] = []; });
    (items || []).forEach((i) => { if (curKeys[i.categorie]) curKeys[i.categorie].push(i.cle); });
    store[today] = curKeys;
    const keep = Object.keys(store).sort().slice(-14);
    const trimmed = {}; keep.forEach((d) => { trimmed[d] = store[d]; });
    try { localStorage.setItem(key, JSON.stringify(trimmed)); } catch (e) { /* quota / privé : on ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier]);

  const WIN = { jour: 1, semaine: 7, mois: 30, annee: 365, tout: null };
  const cutoff = WIN[period] ? Date.now() - WIN[period] * 86400000 : null;
  const inWin = (i) => !cutoff || new Date(i.maj || i.resolu || i.cree || 0).getTime() >= cutoff;
  const periodItems = cutoff ? (items || []).filter(inWin) : (items || []);
  const itemsForCat = (k) => periodItems.filter((i) => i.categorie === k);
  const prevCount = (k) => {
    const p = baseline ? baseline.cats[k] : null;
    if (Array.isArray(p)) return p.length;
    return typeof p === "number" ? p : null;
  };
  const rows = ROWS.map(([k, label]) => {
    const n = cutoff ? itemsForCat(k).length : (cats0[k] || 0);
    const pc = prevCount(k);
    return { k, label, n, delta: cutoff ? null : (pc == null ? null : n - pc) };
  });
  const total = rows.reduce((s, r) => s + r.n, 0);
  const horsPoint = cutoff ? 0 : (cats0.afaire || 0) + (cats0.annule || 0) + (cats0.retourProd || 0);

  const copy = async () => {
    const lines = rows.map((r) => `* ${r.label} : ${r.n} ${fmtDelta(r.delta)}`).join("\n");
    const entete = dossier && dossier !== "Tous dossiers" ? ` — ${dossier}` : "";
    const txt = `Données suivies du ${new Date().toLocaleDateString("fr-FR")}${entete}\n\n${lines}`;
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { /* clipboard indispo */ }
  };

  return (
    <div className="pds">
      <div className="pds-head">
        <h3 className="c360-sec" style={{ margin: 0 }}>Le point du soir{dossier === "Tous dossiers" ? " — tous dossiers" : ""}</h3>
        <div className="pds-head-r">
          <select className="c360-sortsel" value={period} onChange={(e) => { setPeriod(e.target.value); setOpenK(null); }} aria-label="Période du point du soir">
            <option value="tout">Tout (état actuel)</option>
            <option value="jour">Aujourd'hui</option>
            <option value="semaine">7 jours</option>
            <option value="mois">30 jours</option>
            <option value="annee">1 an</option>
          </select>
          <button className="pds-copy" onClick={copy}>{copied ? "Copié ✓" : "Copier le point"}</button>
        </div>
      </div>
      <table className="pds-tbl">
        <tbody>
          {rows.map((r) => {
            const open = openK === r.k;
            const clickable = r.n > 0 && typeof onTicket === "function";
            const its = open ? itemsForCat(r.k) : null;
            const prevK = !cutoff && baseline && Array.isArray(baseline.cats[r.k]) ? baseline.cats[r.k] : null;
            let entered = null, leftKeys = null;
            if (open && its && prevK) {
              const curSet = new Set(its.map((i) => i.cle));
              const prevSet = new Set(prevK);
              entered = new Set(its.filter((i) => !prevSet.has(i.cle)).map((i) => i.cle));
              leftKeys = prevK.filter((c) => !curSet.has(c));
            }
            return (
              <React.Fragment key={r.k}>
                <tr className={`pds-row ${clickable ? "clk" : ""} ${open ? "open" : ""}`}
                    onClick={clickable ? () => setOpenK(open ? null : r.k) : undefined}>
                  <td className="pds-lbl">{clickable ? <span className="pds-cv" aria-hidden="true">›</span> : null}{r.label}</td>
                  <td className="pds-n">{r.n}</td>
                  <td className={`pds-d ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}`}><span className="pds-delta">{fmtDelta(r.delta)}</span></td>
                </tr>
                {open && its && its.length > 0 ? (
                  <tr className="pds-sub"><td colSpan={3}>
                    {prevK ? (
                      <div className="pds-move">
                        <span className="pds-move-h">Depuis le {baseline.date}</span>
                        <span className="pds-move-up">+{entered.size} entré{entered.size > 1 ? "s" : ""}</span>
                        <span className="pds-move-dn">−{leftKeys.length} sorti{leftKeys.length > 1 ? "s" : ""}</span>
                        {leftKeys.length ? (
                          <div className="pds-left">Sortis : {leftKeys.map((c) => { const m = (items || []).find((x) => x.cle === c); return c + (m ? ` → ${CAT_FR[m.categorie] || m.categorie}` : " (hors point)"); }).join(" · ")}</div>
                        ) : null}
                      </div>
                    ) : null}
                    <ul className="pds-tickets">
                      {its.map((i) => (
                        <li key={i.cle}>
                          <button className="pds-tk" onClick={(e) => { e.stopPropagation(); onTicket(i); }}>
                            {i.flagged ? <span className="pds-flag">🚩</span> : null}
                            <b className="pds-tk-key">{i.cle}</b>
                            <span className="pds-tk-res">{progResume(i)}</span>
                            {entered && entered.has(i.cle) ? <span className="pds-new">nouveau</span> : null}
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
        {cutoff
          ? `${total} ticket${total > 1 ? "s" : ""} avec activité sur la période sélectionnée`
          : <>{total} tickets suivis{horsPoint ? ` · ${horsPoint} hors point (à faire / annulés / retour prod)` : ""}{baseline ? ` · écarts vs le ${baseline.date}` : " · premier relevé enregistré — les écarts apparaîtront au prochain jour"}</>}
      </p>
    </div>
  );
}
