import React, { useEffect, useMemo, useState } from "react";
import { fetchHistory, crForDate, crDailyForPeriod } from "../api.js";
import { frDate, printHtml, buildSimpleDoc } from "../utils.js";
import DocPreview from "./DocPreview.jsx";

const LABELS = { cr_journalier: "CR journalier", cr_ecrit: "CR écrit", cr_date: "CR rédigé (IA)", cr_reunion: "CR réunion", prep_reunion: "Prépa réunion", brief_matin: "Brief matinal", cr_global: "Rapport global", cra_import: "Import CRA", ticket_push: "Mise à jour Jira", dev_delete: "Fiche dev masquée", dev_restore: "Fiche dev restaurée" };
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

export default function History({ issues = [], onTicket, onDev, deletedDevs = [], inactiveDevs = [] }) {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState("hier");
  const [client, setClient] = useState("Tous");
  const [doc, setDoc] = useState(null);
  const [crBusy, setCrBusy] = useState(false);
  const [crBusy2, setCrBusy2] = useState(false);
  const [crErr, setCrErr] = useState("");
  const delSet = new Set(deletedDevs);
  const inactiveSet = new Set(inactiveDevs);
  const greyed = (d) => delSet.has(d) || inactiveSet.has(d); // parti OU sans activité Jira → grisé

  useEffect(() => { fetchHistory().then((d) => setEvents(d.events)).catch((e) => setErr(e.message)); }, []);

  const allClients = useMemo(() => Array.from(new Set(issues.map((i) => i.dossier).filter(Boolean))).sort(), [issues]);

  const dayOptions = useMemo(() => { const a = []; const now = new Date(); for (let k = 0; k < 31; k++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k); a.push({ v: dayValue(d), label: d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }) }); } return a; }, []);
  const monthOptions = useMemo(() => { const a = []; const now = new Date(); for (let k = 0; k < 12; k++) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); a.push({ v: monthValue(d), label: `${MOIS[d.getMonth()]} ${d.getFullYear()}` }); } return a; }, []);

  const data = useMemo(() => {
    const range = periodRange(period);
    const all = issues.filter((i) => inRange(i.maj, range) || inRange(i.resolu, range));
    const touched = client === "Tous" ? all : all.filter((i) => i.dossier === client);
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
  }, [issues, period, client]);

  const label = periodLabel(period);

  // L'IA génère un CR rédigé pour la PÉRIODE sélectionnée et le client choisi (ou tous).
  const proposeCr = async () => {
    setCrBusy(true); setCrErr("");
    try {
      const [rs, re] = periodRange(period);
      const startISO = rs ? rs.toISOString() : null;
      const endISO = re ? re.toISOString() : null;
      const out = await crForDate({ dossier: client, startISO, endISO, label });
      const slug = (label || "periode").replace(/[^\wÀ-ÿ]+/g, "_");
      setDoc({
        title: `CR rédigé — ${client === "Tous" ? "tous clients" : client} — ${label}`,
        html: out.html,
        dossier: client === "Tous" ? "" : client,
        filename: `CR_${client === "Tous" ? "tous" : client}_${slug}.html`,
      });
    } catch (e) { setCrErr(e.message || String(e)); }
    setCrBusy(false);
  };

  // CR JOURNALIER DÉTAILLÉ (le même format que « récap du jour »), pour la période choisie.
  const proposeDetailed = async () => {
    setCrBusy2(true); setCrErr("");
    try {
      const [rs, re] = periodRange(period);
      const out = await crDailyForPeriod({
        dossier: client,
        startISO: rs ? rs.toISOString() : null,
        endISO: re ? re.toISOString() : null,
        label,
      });
      const slug = (label || "periode").replace(/[^\wÀ-ÿ]+/g, "_");
      setDoc({
        title: `CR journalier détaillé — ${client === "Tous" ? "tous clients" : client} — ${label}`,
        html: out.html,
        dossier: client === "Tous" ? "" : client,
        filename: `CR_detaille_${client === "Tous" ? "tous" : client}_${slug}.html`,
      });
    } catch (e) { setCrErr(e.message || String(e)); }
    setCrBusy2(false);
  };

  const exportPdf = () => {
    let clientsHtml = "";
    data.clients.forEach((c) => {
      const rows = c.items.map((i) => `<tr><td>${esc(i.cle)}</td><td>${esc(i.resume)}${i.flagged ? " 🚩" : ""}</td><td>${esc(i.dev || i.assigne || "")}</td><td>${esc(i.statutJira || i.statut)}</td><td>${fr(i.resolu || i.maj)}</td></tr>`).join("");
      clientsHtml += `<h3>${esc(c.client)} — ${c.done} terminé(s) · ${c.active} en cours · ${c.blocked} bloqué(s)</h3>
        <table><tr><th>Clé</th><th>Résumé</th><th>Dév.</th><th>Statut</th><th>Date</th></tr>${rows}</table>`;
    });
    const devRows = data.devs.map((d) => `<tr><td>${esc(d.dev)}${delSet.has(d.dev) ? " (supprimé)" : ""}</td><td>${d.done}</td><td>${d.touched}</td></tr>`).join("") || "<tr><td colspan='3'>—</td></tr>";
    const body = `<h2>Par client</h2>${clientsHtml || "<p class='muted'>Aucune activité sur la période.</p>"}
      <h2>Synthèse par développeur</h2>
      <table><tr><th>Développeur</th><th>Terminés</th><th>Travaillés</th></tr>${devRows}</table>`;
    const cartouche = [
      ["Client", client === "Tous" ? "Tous les clients" : client],
      ["Période", label],
      ["Équipe", "Armonie"],
      ["Chef de projet", "Nicolas Durand"],
      ["Synthèse", `${data.totalDone} terminé(s) · ${data.touched} avec activité · ${data.clients.length} client(s)`],
    ];
    printHtml(buildSimpleDoc({ kicker: "Récap par client", title: `Récap — ${label}`, cartouche, bodyHtml: body }));
  };

  return (
    <>
      <div className="section-title">Historique des récaps par client</div>
      <p className="hint" style={{ marginTop: -6 }}>
        Choisis un client et une période : le récap est reconstitué automatiquement à partir de l'historique Jira (chaque journée passée est déjà disponible — « Hier » = le récap de la veille). Exportable en PDF. <b>Le bouton « Générer le CR rédigé (IA) » produit un compte rendu complet de la période choisie</b> (jour, semaine, mois…).
      </p>

      <div className="ctabs">
        <button className={`ctab ${client === "Tous" ? "active" : ""}`} onClick={() => setClient("Tous")}>Tous</button>
        {allClients.map((c) => (
          <button key={c} className={`ctab ${client === c ? "active" : ""}`} onClick={() => setClient(c)}>{c}</button>
        ))}
      </div>

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
          <button className="btn-solid gold sm" style={{ marginLeft: 10 }} disabled={crBusy2} onClick={proposeDetailed}>{crBusy2 ? "Génération…" : "✨ CR journalier détaillé"}</button>
          <button className="btn-line sm" style={{ marginLeft: 8 }} disabled={crBusy} onClick={proposeCr}>{crBusy ? "Rédaction…" : "CR rédigé (IA)"}</button>
          <button className="btn-line sm" style={{ marginLeft: 8 }} onClick={exportPdf}>Exporter PDF</button>
        </p>
        {!crErr && (
          <p className="hint" style={{ marginTop: -2 }}>
            <b>« CR journalier détaillé »</b> = le même compte rendu que dans « Récap du jour » (analyse + tickets détaillés), mais pour <b>{label}</b> et pour {client === "Tous" ? "tous les clients" : <b>{client}</b>}. « CR rédigé » = version en texte continu. Sans IA branchée, les CR restent produits (en mode « brut »).
          </p>
        )}
        {crErr && <div className="banner">CR impossible : {crErr}</div>}

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
                          ? <span className={`dev-chip ${greyed(dev) ? "del" : ""}`} title="Voir la fiche" onClick={(e) => { e.stopPropagation(); onDev && onDev(dev); }}>{dev}</span>
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
                    <td><span className={greyed(d.dev) ? "dev-chip del" : "dev-chip"}>{d.dev}{delSet.has(d.dev) ? <span className="dev-del-tag">parti</span> : (inactiveSet.has(d.dev) ? <span className="dev-del-tag">inactif</span> : null)}</span></td>
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
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </>
  );
}
