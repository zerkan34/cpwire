import React, { useEffect, useMemo, useState } from "react";
import { fetchHistory } from "../api.js";
import { frDate, printHtml } from "../utils.js";

const LABELS = { cr_journalier: "CR journalier", cr_reunion: "CR réunion", ticket_push: "Mise à jour Jira", dev_delete: "Fiche dev masquée", dev_restore: "Fiche dev restaurée" };
const DONE = ["termine", "miseEnProd"];
const ACTIVE = ["encours", "retourTest", "retourProd"];

const PRESETS = [
  { id: "auj", label: "Aujourd'hui" },
  { id: "hier", label: "Hier" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
  { id: "moisdernier", label: "Mois dernier" },
  { id: "tout", label: "Tout" },
];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function pad(n) { return String(n).padStart(2, "0"); }
function dayValue(d) { return `day:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthValue(d) { return `month:${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

function periodRange(period) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period.startsWith("day:")) { const [y, m, d] = period.slice(4).split("-").map(Number); const s = new Date(y, m - 1, d); const e = new Date(y, m - 1, d + 1); return [s, e]; }
  if (period.startsWith("month:")) { const [y, m] = period.slice(6).split("-").map(Number); return [new Date(y, m - 1, 1), new Date(y, m, 1)]; }
  if (period === "auj") return [startToday, null];
  if (period === "hier") { const y = new Date(startToday); y.setDate(y.getDate() - 1); return [y, startToday]; }
  if (period === "semaine") { const d = new Date(startToday); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return [d, null]; }
  if (period === "mois") return [new Date(now.getFullYear(), now.getMonth(), 1), null];
  if (period === "moisdernier") return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  return [null, null];
}
function periodLabel(period) {
  if (period.startsWith("day:")) { const [y, m, d] = period.slice(4).split("-").map(Number); return `${pad(d)} ${MOIS[m - 1]} ${y}`; }
  if (period.startsWith("month:")) { const [y, m] = period.slice(6).split("-").map(Number); return `${MOIS[m - 1]} ${y}`; }
  return PRESETS.find((p) => p.id === period)?.label || "";
}
function inRange(iso, range) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  if (range[0] && t < range[0].getTime()) return false;
  if (range[1] && t >= range[1].getTime()) return false;
  return true;
}
function fr(iso) { try { return new Date(iso).toLocaleDateString("fr-FR"); } catch { return ""; } }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m])); }
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

export default function History({ issues = [], onTicket, onDev, deletedDevs = [] }) {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState("hier");
  const delSet = new Set(deletedDevs);

  useEffect(() => { fetchHistory().then((d) => setEvents(d.events)).catch((e) => setErr(e.message)); }, []);

  const dayOptions = useMemo(() => { const a = []; const now = new Date(); for (let k = 0; k < 31; k++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k); a.push({ v: dayValue(d), label: d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }) }); } return a; }, []);
  const monthOptions = useMemo(() => { const a = []; const now = new Date(); for (let k = 0; k < 12; k++) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); a.push({ v: monthValue(d), label: `${MOIS[d.getMonth()]} ${d.getFullYear()}` }); } return a; }, []);

  const data = useMemo(() => {
    const range = periodRange(period);
    const touched = issues.filter((i) => inRange(i.maj, range) || inRange(i.resolu, range));
    const doneIn = (i) => DONE.includes(i.categorie) && inRange(i.resolu || i.maj, range);

    const byClient = {}; const byDev = {}; const byProj = {};
    touched.forEach((i) => {
      const cli = i.dossier || "Autre";
      (byClient[cli] ||= { client: cli, items: [], done: 0, active: 0, blocked: 0 });
      const c = byClient[cli];
      c.items.push(i);
      if (doneIn(i)) c.done += 1;
      else if (i.statut === "Bloqué") c.blocked += 1;
      else if (ACTIVE.includes(i.categorie)) c.active += 1;

      const dev = i.dev || i.assigne || "Non assigné";
      (byDev[dev] ||= { dev, touched: 0, done: 0 });
      byDev[dev].touched += 1; if (doneIn(i)) byDev[dev].done += 1;
      (byProj[cli] ||= { dossier: cli, touched: 0, done: 0 });
      byProj[cli].touched += 1; if (doneIn(i)) byProj[cli].done += 1;
    });
    Object.values(byClient).forEach((c) => c.items.sort((a, b) => String(b.resolu || b.maj || "").localeCompare(String(a.resolu || a.maj || ""))));
    const clients = Object.values(byClient).sort((a, b) => b.items.length - a.items.length);
    const devs = Object.values(byDev).filter((d) => d.dev !== "Non assigné").sort((a, b) => b.done - a.done || b.touched - a.touched);
    const projets = Object.values(byProj).sort((a, b) => b.touched - a.touched);
    const totalDone = touched.filter(doneIn).length;
    return { touched: touched.length, totalDone, clients, devs, projets };
  }, [issues, period]);

  const label = periodLabel(period);

  const exportPdf = () => {
    const css = `body{font-family:Arial,Helvetica,sans-serif;color:#2a2937;font-size:12px;padding:26px;} h1{font-size:20px;color:#c95f1c;margin:0 0 2px;} .sub{color:#666;margin-bottom:14px;font-size:12px;} h2{font-size:14px;color:#2c2945;margin:18px 0 4px;} h3{font-size:12.5px;color:#2c2945;background:#f4f2fb;border-left:4px solid #e0600f;padding:6px 10px;margin:14px 0 4px;} table{width:100%;border-collapse:collapse;margin:4px 0 6px;font-size:11px;} th{background:#f7f6fc;text-align:left;padding:5px 8px;border:1px solid #e2def2;font-size:9.5px;text-transform:uppercase;} td{padding:5px 8px;border:1px solid #eee;vertical-align:top;} tr{break-inside:avoid;} .meta{color:#666;font-weight:600;font-size:10.5px;} .foot{margin-top:16px;color:#999;font-size:10px;}`;
    let clientsHtml = "";
    data.clients.forEach((c) => {
      const rows = c.items.map((i) => `<tr><td>${esc(i.cle)}</td><td>${esc(i.resume)}${i.flagged ? " 🚩" : ""}</td><td>${esc(i.dev || i.assigne || "")}</td><td>${esc(i.statutJira || i.statut)}</td><td>${fr(i.resolu || i.maj)}</td></tr>`).join("");
      clientsHtml += `<h3>${esc(c.client)} <span class="meta">— ${c.done} terminé(s) · ${c.active} en cours · ${c.blocked} bloqué(s)</span></h3>
        <table><tr><th>Clé</th><th>Résumé</th><th>Dév.</th><th>Statut</th><th>Date</th></tr>${rows}</table>`;
    });
    const devRows = data.devs.map((d) => `<tr><td>${esc(d.dev)}${delSet.has(d.dev) ? " (supprimé)" : ""}</td><td>${d.done}</td><td>${d.touched}</td></tr>`).join("") || "<tr><td colspan='3'>—</td></tr>";
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style><title>Récap ${esc(label)}</title></head><body>
      <h1>Récap par client — ${esc(label)}</h1>
      <div class="sub">${data.totalDone} ticket(s) terminé(s) · ${data.touched} ticket(s) avec activité · ${data.clients.length} client(s)</div>
      <h2>Par client</h2>
      ${clientsHtml || "<p>Aucune activité sur la période.</p>"}
      <h2>Synthèse par développeur</h2>
      <table><tr><th>Développeur</th><th>Terminés</th><th>Travaillés</th></tr>${devRows}</table>
      <div class="foot">Généré par cp|WIRE — ${new Date().toLocaleString("fr-FR")}</div>
    </body></html>`;
    printHtml(html);
  };

  return (
    <>
      <div className="section-title">Historique des récaps par client</div>
      <p className="hint" style={{ marginTop: -6 }}>
        Choisis un jour ou un mois : le récap par client est reconstitué automatiquement à partir de l'historique Jira (chaque journée passée est déjà disponible — « Hier » = le récap de la veille). Exportable en PDF.
      </p>

      <div className="panel">
        <div className="filters" style={{ marginBottom: 8 }}>
          <span className="fg-lbl">Période</span>
          {PRESETS.map((p) => (
            <button key={p.id} className={`fbtn ${period === p.id ? "active" : ""}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="filters" style={{ marginBottom: 4, gap: 14 }}>
          <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            Jour précis
            <select value={period.startsWith("day:") ? period : ""} onChange={(e) => e.target.value && setPeriod(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)" }}>
              <option value="">—</option>
              {dayOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            Mois précis
            <select value={period.startsWith("month:") ? period : ""} onChange={(e) => e.target.value && setPeriod(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)" }}>
              <option value="">—</option>
              {monthOptions.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <p className="period-sum">
          <b>{label}</b> : <b>{data.totalDone}</b> terminé(s) · <b>{data.touched}</b> avec activité · <b>{data.clients.length}</b> client(s)
          <button className="btn-line sm" style={{ marginLeft: 10 }} onClick={exportPdf}>Exporter PDF</button>
        </p>

        {data.clients.length === 0 ? (
          <div className="empty">Aucune activité sur cette période.</div>
        ) : (
          data.clients.map((c) => (
            <div key={c.client} className="cli-block">
              <div className="cli-h">
                <span className="tag">{c.client}</span>
                <span className="cli-meta">{c.done} terminé(s){c.active ? ` · ${c.active} en cours` : ""}{c.blocked ? ` · ${c.blocked} bloqué(s)` : ""} · {c.items.length} ticket(s)</span>
              </div>
              <table className="fiche-tbl">
                <thead><tr><th className="c-cle">Clé</th><th className="c-res">Résumé</th><th className="c-proj">Dév.</th><th className="c-stat">Statut</th><th className="c-date">Date</th></tr></thead>
                <tbody>
                  {c.items.slice(0, 40).map((i) => {
                    const dev = i.dev || i.assigne || "";
                    return (
                      <tr key={i.cle} onClick={() => onTicket && onTicket(i)}>
                        <td className="c-cle"><span className="k">{i.cle}</span></td>
                        <td className="c-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}</td>
                        <td className="c-proj">{dev && dev !== "Non assigné"
                          ? <span className={`dev-chip ${delSet.has(dev) ? "del" : ""}`} title="Voir la fiche" onClick={(e) => { e.stopPropagation(); onDev && onDev(dev); }}>{dev}</span>
                          : (dev || "—")}</td>
                        <td className="c-stat"><span className={`pill ${PILL[i.statut]}`}>{i.statutJira || i.statut}</span></td>
                        <td className="c-date">{fr(i.resolu || i.maj)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {c.items.length > 40 && <p className="hint">+ {c.items.length - 40} autre(s)…</p>}
            </div>
          ))
        )}
      </div>

      {data.devs.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 22 }}>Synthèse par développeur — {label}</div>
          <div className="panel">
            <table className="proj-tbl">
              <thead><tr><th>Développeur</th><th>Terminés</th><th>Travaillés</th></tr></thead>
              <tbody>
                {data.devs.map((d) => (
                  <tr key={d.dev} style={{ cursor: onDev ? "pointer" : "default" }} onClick={() => onDev && onDev(d.dev)}>
                    <td><span className={delSet.has(d.dev) ? "dev-chip del" : "dev-chip"}>{d.dev}{delSet.has(d.dev) ? <span className="dev-del-tag">supprimé</span> : null}</span></td>
                    <td><b>{d.done}</b></td>
                    <td>{d.touched}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-title" style={{ marginTop: 22 }}>Journal de l'application</div>
      <p className="hint" style={{ marginTop: -6 }}>Tout ce qui a été produit ou poussé depuis l'application.</p>
      {err ? (
        <div className="banner">Erreur : {err}</div>
      ) : !events ? (
        <div className="panel empty">Chargement…</div>
      ) : events.length === 0 ? (
        <div className="panel empty">Rien pour l'instant. Génère un CR ou pousse un ticket pour démarrer le journal.</div>
      ) : (
        <div className="hist">
          {events.map((e) => (
            <div className="hist-row" key={e.id}>
              <span className="when">{frDate(e.at)}</span>
              <span className="type">{LABELS[e.type] || e.type}</span>
              <span style={{ flex: 1 }}>{e.label}{e.meta?.simulated ? " (simulé)" : ""}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
