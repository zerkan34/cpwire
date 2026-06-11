import React, { useMemo, useState } from "react";

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

export default function DeveloperModal({ devName, allIssues = [], onClose, onTicket }) {
  const [period, setPeriod] = useState("semaine");
  const [copied, setCopied] = useState(false);

  const items = useMemo(
    () => allIssues.filter((i) => (i.dev || i.assigne || "Non assigné") === devName),
    [allIssues, devName]
  );
  if (!devName) return null;

  // Stats globales (tout l'historique connu).
  const g = useMemo(() => ({
    total: items.length,
    termine: items.filter((i) => DONE.includes(i.categorie)).length,
    encours: items.filter((i) => ACTIVE.includes(i.categorie)).length,
    recette: items.filter((i) => WAIT.includes(i.categorie)).length,
    retard: items.filter((i) => i.enRetard).length,
  }), [items]);

  // Graphe 6 mois (terminés par mois).
  const months = useMemo(() => {
    const now = new Date(); const arr = [];
    for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); arr.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), done: 0 }); }
    const idx = Object.fromEntries(arr.map((m) => [m.key, m]));
    items.forEach((i) => { if (DONE.includes(i.categorie)) { const k = ymKey(i.resolu || i.maj); if (idx[k]) idx[k].done += 1; } });
    return { arr, max: arr.reduce((m, x) => Math.max(m, x.done), 0) || 1 };
  }, [items]);

  // Activité sur la période choisie.
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

  const periodLabel = PERIODS.find((p) => p.id === period)?.label || "";

  const copyRecap = async () => {
    const lignes = [];
    lignes.push(`Activité de ${devName} — ${periodLabel.toLowerCase()}`);
    lignes.push(`${per.touched} ticket(s) touché(s) · ${per.done} terminé(s) · ${per.projets.length} projet(s)`);
    lignes.push("");
    lignes.push("Par projet :");
    per.projets.forEach((p) => lignes.push(`- ${p.dossier} : ${p.touched} touché(s)${p.done ? ` (${p.done} terminé(s))` : ""}`));
    lignes.push("");
    lignes.push("Détail :");
    per.list.forEach((i) => lignes.push(`- ${i.cle} — ${i.resume} [${i.statutJira || i.statut}]${per.doneInPeriod(i) ? " ✓ terminé" : ""}`));
    try { await navigator.clipboard.writeText(lignes.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 800 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="x" onClick={onClose}>×</button>
          <div className="k">Fiche développeur</div>
          <h3>{devName}</h3>
        </div>
        <div className="modal-bd">

          {/* Vue d'ensemble (tout l'historique) */}
          <div className="dev-stats">
            <div className="dstat"><div className="v">{g.total}</div><div className="l">Tickets pris</div></div>
            <div className="dstat done"><div className="v">{g.termine}</div><div className="l">Terminés</div></div>
            <div className="dstat prog"><div className="v">{g.encours}</div><div className="l">En cours</div></div>
            <div className="dstat todo"><div className="v">{g.recette}</div><div className="l">En recette</div></div>
            <div className="dstat block"><div className="v">{g.retard}</div><div className="l">En retard</div></div>
          </div>

          {/* Sélecteur de période */}
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
            <button className="btn-line sm" style={{ marginLeft: 10 }} onClick={copyRecap}>{copied ? "✓ Copié" : "Copier le récap"}</button>
          </p>

          {/* Répartition par projet */}
          {per.projets.length > 0 ? (
            <table className="proj-tbl">
              <thead><tr><th>Projet</th><th>Tickets travaillés</th><th>Terminés</th></tr></thead>
              <tbody>
                {per.projets.map((p) => (
                  <tr key={p.dossier}>
                    <td><span className="tag">{p.dossier}</span></td>
                    <td><b>{p.touched}</b></td>
                    <td>{p.done || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">Aucune activité sur cette période.</div>
          )}

          {/* Détail : ce qu'il a fait */}
          {per.list.length > 0 && (
            <>
              <div className="dev-sec-h">Ce qu'il a fait ({per.list.length})</div>
              <ul className="dev-items">
                {per.list.slice(0, 200).map((i) => (
                  <li key={i.cle} onClick={() => onTicket && onTicket(i)} style={{ cursor: "pointer" }}>
                    <span className="k">{i.cle}</span>
                    <span className="tag">{i.dossier}</span>
                    <span style={{ flex: 1 }}>{i.resume}</span>
                    <span className="dev-when">{fr(i.maj)}</span>
                    {per.doneInPeriod(i) ? <span className="pill done">terminé</span> : <span className={`pill ${PILL[i.statut] || "todo"}`}>{i.statutJira || i.statut}</span>}
                  </li>
                ))}
                {per.list.length > 200 && <li>+ {per.list.length - 200} autre(s)…</li>}
              </ul>
            </>
          )}

          {/* Tendance par mois */}
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
            « Travaillé » = ticket dont l'activité (mise à jour ou résolution Jira) tombe dans la période. « Ce qu'il a fait » liste ces tickets ;
            il ne s'agit pas d'un relevé d'heures. Période « cette semaine » = depuis lundi.
          </p>

        </div>
      </div>
    </div>
  );
}
