import React, { useMemo, useState } from "react";
import { printHtml } from "../utils.js";
import ExportBar from "./ExportBar.jsx";
import { useModalBack, backOut } from "../modalNav.js";

const ACTIVE = ["encours", "retourTest", "retourProd"];
const DONE = ["termine", "miseEnProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

const PERIODS = [
  { id: "auj", label: "Aujourd'hui" },
  { id: "hier", label: "Hier" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
  { id: "6mois", label: "6 mois" },
  { id: "tout", label: "Tout" },
];

function periodRange(period) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "auj") return [startToday, null];
  if (period === "hier") { const y = new Date(startToday); y.setDate(y.getDate() - 1); return [y, startToday]; }
  if (period === "semaine") { const d = new Date(startToday); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return [d, null]; }
  if (period === "mois") return [new Date(now.getFullYear(), now.getMonth(), 1), null];
  if (period === "6mois") return [new Date(now.getFullYear(), now.getMonth() - 5, 1), null];
  return [null, null];
}
function inRange(iso, range) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  if (range[0] && t < range[0].getTime()) return false;
  if (range[1] && t >= range[1].getTime()) return false;
  return true;
}
function ymKey(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function fr(iso) { try { return new Date(iso).toLocaleDateString("fr-FR"); } catch { return ""; } }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m])); }

export default function DeveloperModal({ devName, allIssues = [], onClose, onTicket, deleted = false, onDelete, onRestore }) {
  const [period, setPeriod] = useState("semaine");
  const [copied, setCopied] = useState(false);
  useModalBack(onClose);

  const askDelete = () => {
    if (window.confirm(`Masquer la fiche de « ${devName} » ?\n\nLes données Jira ne sont pas supprimées. Le développeur apparaîtra en gris (« supprimé ») dans les listes et récaps. Tu pourras le restaurer à tout moment.`)) {
      onDelete && onDelete();
      backOut();
    }
  };

  const items = useMemo(
    () => allIssues.filter((i) => (Array.isArray(i.contributors) && i.contributors.length)
      ? i.contributors.includes(devName)
      : ((i.dev || i.assigne || "Non assigné") === devName)),
    [allIssues, devName]
  );

  const g = useMemo(() => ({
    total: items.length,
    termine: items.filter((i) => DONE.includes(i.categorie)).length,
    encours: items.filter((i) => ACTIVE.includes(i.categorie)).length,
    recette: items.filter((i) => WAIT.includes(i.categorie)).length,
    retard: items.filter((i) => i.enRetard).length,
    flagged: items.filter((i) => i.flagged).length,
  }), [items]);

  const months = useMemo(() => {
    const now = new Date(); const arr = [];
    for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); arr.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), done: 0 }); }
    const idx = Object.fromEntries(arr.map((m) => [m.key, m]));
    items.forEach((i) => { if (DONE.includes(i.categorie)) { const k = ymKey(i.resolu || i.maj); if (idx[k]) idx[k].done += 1; } });
    return { arr, max: arr.reduce((m, x) => Math.max(m, x.done), 0) || 1 };
  }, [items]);

  const per = useMemo(() => {
    const range = periodRange(period);
    const touched = items.filter((i) => inRange(i.maj, range) || inRange(i.resolu, range));
    const doneInPeriod = (i) => DONE.includes(i.categorie) && inRange(i.resolu || i.maj, range);
    const byDossier = {};
    touched.forEach((i) => {
      (byDossier[i.dossier] ||= { dossier: i.dossier, touched: 0, done: 0 });
      byDossier[i.dossier].touched += 1;
      if (doneInPeriod(i)) byDossier[i.dossier].done += 1;
    });
    const projets = Object.values(byDossier).sort((a, b) => b.touched - a.touched);
    const done = touched.filter(doneInPeriod).length;
    const list = touched.slice().sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));
    return { touched: touched.length, done, projets, list, doneInPeriod };
  }, [items, period]);

  if (!devName) return null;
  const periodLabel = PERIODS.find((p) => p.id === period)?.label || "";

  const copyRecap = async () => {
    const L = [];
    L.push(`Activité de ${devName} — ${periodLabel.toLowerCase()}`);
    L.push(`${per.touched} ticket(s) travaillé(s) · ${per.done} terminé(s) · ${per.projets.length} projet(s)`);
    L.push("", "Par projet :");
    per.projets.forEach((p) => L.push(`- ${p.dossier} : ${p.touched} touché(s)${p.done ? ` (${p.done} terminé(s))` : ""}`));
    L.push("", "Détail :");
    per.list.forEach((i) => L.push(`- ${i.cle} — ${i.resume} [${i.statutJira || i.statut}]${i.flagged ? " 🚩" : ""}${per.doneInPeriod(i) ? " ✓ terminé" : ""}`));
    try { await navigator.clipboard.writeText(L.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  const buildDevHtml = () => {
    const css = `body{font-family:Arial,Helvetica,sans-serif;color:#2a2937;font-size:12px;padding:26px;} h1{font-size:20px;color:#c95f1c;margin:0 0 2px;} .sub{color:#666;margin-bottom:14px;font-size:12px;} h2{font-size:13px;color:#2c2945;border-bottom:2px solid #eee;padding-bottom:4px;margin:16px 0 6px;} table{width:100%;border-collapse:collapse;margin:6px 0;font-size:11.5px;} th{background:#f4f2fb;text-align:left;padding:6px 8px;border:1px solid #e2def2;font-size:10px;text-transform:uppercase;letter-spacing:.03em;} td{padding:6px 8px;border:1px solid #eee;vertical-align:top;} tr{break-inside:avoid;} .foot{margin-top:16px;color:#999;font-size:10px;} @page{margin:14mm 13mm;}`;
    const proj = per.projets.map((p) => `<tr><td>${esc(p.dossier)}</td><td>${p.touched}</td><td>${p.done || "—"}</td></tr>`).join("") || "<tr><td colspan='3'>—</td></tr>";
    const det = per.list.map((i) => `<tr><td>${esc(i.cle)}</td><td>${esc(i.dossier)}</td><td>${esc(i.resume)}${i.flagged ? " 🚩" : ""}</td><td>${fr(i.maj)}</td><td>${esc(i.statutJira || i.statut)}${per.doneInPeriod(i) ? " ✓" : ""}</td></tr>`).join("") || "<tr><td colspan='5'>—</td></tr>";
    const mois = months.arr.map((m) => `<tr><td>${m.label}</td><td>${m.done}</td></tr>`).join("");
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style><title> </title></head><body>
      <h1>Fiche développeur — ${esc(devName)}</h1>
      <div class="sub">Période : <b>${esc(periodLabel)}</b> · ${per.touched} ticket(s) travaillé(s) · ${per.done} terminé(s) · ${per.projets.length} projet(s) · équipe Armonie · Chef de projet : Nicolas Durand</div>
      <h2>Vue d'ensemble</h2>
      <table><tr><th>Tickets pris</th><th>Terminés</th><th>En cours</th><th>En recette</th><th>En retard</th><th>Flaggés</th></tr>
      <tr><td>${g.total}</td><td>${g.termine}</td><td>${g.encours}</td><td>${g.recette}</td><td>${g.retard}</td><td>${g.flagged}</td></tr></table>
      <h2>Par projet — ${esc(periodLabel)}</h2>
      <table><tr><th>Projet</th><th>Travaillés</th><th>Terminés</th></tr>${proj}</table>
      <h2>Ce qu'il a fait — ${esc(periodLabel)}</h2>
      <table><tr><th>Clé</th><th>Projet</th><th>Résumé</th><th>Date</th><th>Statut</th></tr>${det}</table>
      <h2>Terminés par mois (6 derniers mois)</h2>
      <table><tr><th>Mois</th><th>Terminés</th></tr>${mois}</table>
      <div class="foot">Généré par cp|WIRE — ${new Date().toLocaleString("fr-FR")}</div>
    </body></html>`;
  };
  const exportPdf = () => printHtml(buildDevHtml());

  return (
    <div className="overlay" onClick={backOut}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="modal-back" onClick={backOut} title="Retour">←</button>
          <button className="x" onClick={backOut}>×</button>
          <div className="k">Fiche développeur</div>
          <h3>{devName}</h3>
        </div>
        <div className="modal-bd">

          {deleted && (
            <div className="banner" style={{ marginTop: 0, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: 1 }}>Cette fiche est marquée comme <b>supprimée</b> (développeur inactif). Ses données restent consultables.</span>
              <button className="btn-line sm" onClick={() => onRestore && onRestore()}>Restaurer la fiche</button>
            </div>
          )}

          <div className="dev-stats">
            <div className="dstat"><div className="v">{g.total}</div><div className="l">Tickets pris</div></div>
            <div className="dstat done"><div className="v">{g.termine}</div><div className="l">Terminés</div></div>
            <div className="dstat prog"><div className="v">{g.encours}</div><div className="l">En cours</div></div>
            <div className="dstat todo"><div className="v">{g.recette}</div><div className="l">En recette</div></div>
            <div className="dstat block"><div className="v">{g.retard}</div><div className="l">En retard</div></div>
            <div className="dstat flagged"><div className="v">{g.flagged}</div><div className="l">🚩 Flaggés</div></div>
          </div>

          <div className="dev-sec-h" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>Activité —</span>
            <div className="filters" style={{ margin: 0 }}>
              {PERIODS.map((p) => (
                <button key={p.id} className={`fbtn ${period === p.id ? "active" : ""}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>

          <p className="period-sum">
            <b>{periodLabel}</b> : <b>{per.touched}</b> ticket(s) travaillé(s) · <b>{per.done}</b> terminé(s) · sur <b>{per.projets.length}</b> projet(s)
            {!deleted && <button className="btn-line sm" style={{ marginLeft: 10, color: "var(--red)", borderColor: "#f0c7cb" }} onClick={askDelete}>Supprimer la fiche</button>}
          </p>
          <ExportBar buildHtml={buildDevHtml} filename={`fiche-${devName}.html`} subject={`Fiche développeur — ${devName}`} />

          {per.projets.length > 0 ? (
            <table className="proj-tbl">
              <thead><tr><th>Projet</th><th>Tickets travaillés</th><th>Terminés</th></tr></thead>
              <tbody>
                {per.projets.map((p) => (
                  <tr key={p.dossier}><td><span className="tag">{p.dossier}</span></td><td><b>{p.touched}</b></td><td>{p.done || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">Aucune activité sur cette période.</div>
          )}

          {per.list.length > 0 && (
            <>
              <div className="dev-sec-h">Ce qu'il a fait ({per.list.length})</div>
              <table className="fiche-tbl">
                <thead><tr><th className="c-cle">Clé</th><th className="c-proj">Projet</th><th className="c-res">Résumé</th><th className="c-date">Date</th><th className="c-stat">Statut</th></tr></thead>
                <tbody>
                  {per.list.slice(0, 200).map((i) => (
                    <tr key={i.cle} onClick={() => onTicket && onTicket(i)}>
                      <td className="c-cle"><span className="k">{i.cle}</span></td>
                      <td className="c-proj"><span className="tag">{i.dossier}</span></td>
                      <td className="c-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}</td>
                      <td className="c-date">{fr(i.maj)}</td>
                      <td className="c-stat">{per.doneInPeriod(i) ? <span className="pill done">terminé</span> : <span className={`pill ${PILL[i.statut] || "todo"}`}>{i.statutJira || i.statut}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {per.list.length > 200 && <p className="hint">+ {per.list.length - 200} autre(s)…</p>}
            </>
          )}

          <div className="dev-sec-h">Tendance — terminés par mois (6 derniers mois)</div>
          <div className="month-chart">
            {months.arr.map((m) => (
              <div className="mc-col" key={m.key} title={`${m.label} : ${m.done} terminé(s)`}>
                <div className="mc-val">{m.done}</div>
                <div className="mc-bar-wrap"><div className="mc-bar" style={{ height: `${Math.round((m.done / months.max) * 100)}%` }} /></div>
                <div className="mc-lbl">{m.label}</div>
              </div>
            ))}
          </div>

          <p className="hint" style={{ marginTop: 8 }}>
            « Travaillé » = ticket dont l'activité (mise à jour ou résolution Jira) tombe dans la période. Le détail des heures est dans chaque ticket (clique une ligne). Période « cette semaine » = depuis lundi.
          </p>

        </div>
      </div>
    </div>
  );
}
