import React, { useMemo, useState, useEffect } from "react";
import { daysSince } from "../lib/commun.js";
import { printHtml, buildSimpleDoc, esc } from "../utils.js";
import ExportBar from "./ExportBar.jsx";
import Avatar from "./Avatar.jsx";
import { fetchDevWork } from "../api.js";
import { useModalBack, backOut } from "../modalNav.js";
import { useReadOnly } from "../readonly.js";

import { ACTIFS as ACTIVE, VALIDES as DONE, PILL } from "../groups.js";
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];
const FTEST = {
  pris: () => true,
  done: (i) => DONE.includes(i.categorie),
  encours: (i) => ACTIVE.includes(i.categorie),
  recette: (i) => WAIT.includes(i.categorie),
  retard: (i) => i.enRetard,
  flag: (i) => i.flagged,
};
const FLABEL = { pris: "Tickets pris", done: "Terminés", encours: "En cours", recette: "En recette", retard: "En retard", flag: "🚩 Flaggés" };

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
function agoTxt(iso) { const d = daysSince(iso); if (d === null) return ""; if (d <= 0) return "aujourd'hui"; if (d === 1) return "hier"; if (d < 30) return `il y a ${d} j`; const m = Math.floor(d / 30); return `il y a ${m} mois`; }

export default function DeveloperModal({ devName, allIssues = [], onClose, onTicket, onRefresh, deleted = false, onDelete, onRestore }) {
  const [period, setPeriod] = useState("tout");
  const [filter, setFilter] = useState("encours");
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState({ k: "date", dir: "desc" });
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Tick « live » : rafraîchit les durées relatives (depuis X) sans rechargement.
  const [, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ro = useReadOnly();
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

  // Charge ACTUELLE : on raisonne sur ce qui est OUVERT (en cours + en recette),
  // pas sur le cumul historique des tickets pris — sinon tout état courant vaut ~1 %.
  const openTotal = g.encours + g.recette;
  const load = useMemo(() => {
    const pc = (n) => (openTotal ? Math.round((n / openTotal) * 100) : 0);
    return [
      { k: "En cours", n: g.encours, pct: pc(g.encours), cls: "prog" },
      { k: "En recette", n: g.recette, pct: pc(g.recette), cls: "todo" },
    ];
  }, [g, openTotal]);
  const completion = g.total ? Math.round((g.termine / g.total) * 100) : 0;

  const topProjet = useMemo(() => {
    const c = {};
    items.forEach((i) => { if (i.dossier) c[i.dossier] = (c[i.dossier] || 0) + 1; });
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "";
  }, [items]);

  const email = useMemo(() => {
    const hit = items.find((i) => i.assigne === devName && i.assigneEmail);
    return hit ? hit.assigneEmail : "";
  }, [items, devName]);

  // Tickets ACTIFS (en cours / recette) — "sur quoi il travaille en ce moment", indépendant de la période.
  const activeItems = useMemo(
    () => items.filter((i) => ACTIVE.includes(i.categorie) || WAIT.includes(i.categorie))
      .sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || ""))),
    [items]
  );

  const [work, setWork] = useState({});         // { cle: {heuresDev, depuisAssigne, derniereActivite, ...} }
  const [workLoading, setWorkLoading] = useState(false);
  const [workConfigured, setWorkConfigured] = useState(true);
  // Reset de l'activité au changement de développeur uniquement (évite le clignotement à chaque synchro).
  useEffect(() => { setWork({}); setWorkConfigured(true); setRefreshedAt(null); }, [devName]);
  // Chargement / rafraîchissement silencieux de l'activité : re-tourne à chaque synchro (activeItems change) et sur ↻.
  useEffect(() => {
    let alive = true;
    const keys = activeItems.slice(0, 10).map((i) => i.cle);
    if (!keys.length) { setRefreshedAt(Date.now()); return; }
    setWorkLoading(true);
    fetchDevWork(devName, keys)
      .then((r) => { if (!alive) return; setWorkConfigured(r.configured !== false); const m = {}; (r.items || []).forEach((it) => { m[it.cle] = it; }); setWork(m); setRefreshedAt(Date.now()); })
      .catch(() => { if (alive) setWorkConfigured(true); })
      .finally(() => { if (alive) setWorkLoading(false); });
    return () => { alive = false; };
  }, [devName, activeItems, reloadKey]);
  // Actualiser maintenant : resynchronise les tickets (app) puis recharge l'activité.
  const refreshNow = () => {
    if (refreshing) return;
    setReloadKey((k) => k + 1);
    if (onRefresh) { setRefreshing(true); Promise.resolve(onRefresh()).catch(() => {}).finally(() => setRefreshing(false)); }
  };

  const months = useMemo(() => {
    const now = new Date(); const arr = [];
    for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); arr.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), done: 0 }); }
    const idx = Object.fromEntries(arr.map((m) => [m.key, m]));
    items.forEach((i) => { if (DONE.includes(i.categorie)) { const k = ymKey(i.resolu || i.maj); if (idx[k]) idx[k].done += 1; } });
    return { arr, max: arr.reduce((m, x) => Math.max(m, x.done), 0) || 1 };
  }, [items]);

  // Rendement — TOUT est déduit des dates Jira (création, résolution). Aucune invention.
  const rendement = useMemo(() => {
    const now = Date.now();
    const doneItems = items.filter((i) => DONE.includes(i.categorie));
    const parse = (iso) => { const t = new Date(iso).getTime(); return isNaN(t) ? null : t; };
    const ageOf = (i) => { const t = parse(i.resolu || i.maj); return t == null ? null : (now - t) / 86400000; };
    const within = (d) => doneItems.filter((i) => { const a = ageOf(i); return a != null && a >= 0 && a <= d; }).length;
    const r30 = within(30), r90 = within(90);
    const perWeek = r90 > 0 ? r90 / 13 : (r30 > 0 ? r30 / 4.345 : 0);
    const sum6 = months.arr.reduce((s, m) => s + m.done, 0);
    const perMonth = sum6 / 6;
    const perWeekHabit = sum6 / 26.1;                                 // régime moyen sur 6 mois (/sem)
    const ratioHabit = perWeekHabit > 0 ? Math.round((perWeek / perWeekHabit) * 100) : null;
    const last3 = months.arr.slice(3).reduce((s, m) => s + m.done, 0);
    const prev3 = months.arr.slice(0, 3).reduce((s, m) => s + m.done, 0);
    const trendPct = prev3 === 0 ? (last3 > 0 ? 100 : 0) : Math.round(((last3 - prev3) / prev3) * 100);
    const open = g.encours + g.recette;
    const etaWeeks = perWeek > 0 ? Math.ceil(open / perWeek) : null;
    // délai de traitement (création → résolution) sur les résolus récents (180 j), repli sur tous
    const leadOf = (i) => { const c = parse(i.cree), r = parse(i.resolu || i.maj); return (c && r && r >= c) ? (r - c) / 86400000 : null; };
    const leadAll = doneItems.map(leadOf).filter((x) => x != null);
    const leadRecent = doneItems.filter((i) => { const a = ageOf(i); return a != null && a <= 180; }).map(leadOf).filter((x) => x != null);
    const lead = leadRecent.length >= 3 ? leadRecent : leadAll;
    const med = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const medLead = med(lead) != null ? Math.round(med(lead)) : null;
    const avgLead = lead.length ? Math.round(lead.reduce((a, b) => a + b, 0) / lead.length) : null;
    // plus ancien ticket encore ouvert
    const openItems = items.filter((i) => ACTIVE.includes(i.categorie) || WAIT.includes(i.categorie));
    let oldestOpenItem = null, oldestAge = -1;
    openItems.forEach((i) => { const t = parse(i.statutDepuis || i.maj); if (t == null) return; const a = (now - t) / 86400000; if (a > oldestAge) { oldestAge = a; oldestOpenItem = i; } });
    const oldestOpen = oldestAge >= 0 ? Math.round(oldestAge) : null;
    // sparkline hebdo (12 semaines)
    const startWeek = (ts) => { const x = new Date(ts); const wd = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - wd); return x.getTime(); };
    const thisMon = startWeek(now);
    const weeks = [];
    for (let k = 11; k >= 0; k--) weeks.push({ t: thisMon - k * 7 * 86400000, n: 0 });
    doneItems.forEach((i) => { const t = parse(i.resolu || i.maj); if (t == null) return; for (let j = weeks.length - 1; j >= 0; j--) { if (t >= weeks[j].t) { weeks[j].n++; break; } } });
    const wMax = weeks.reduce((m, w) => Math.max(m, w.n), 0) || 1;
    return { r30, r90, perWeek: Math.round(perWeek * 10) / 10, perWeekHabit: Math.round(perWeekHabit * 10) / 10, ratioHabit, sum6, perMonth: Math.round(perMonth * 10) / 10, trendPct, open, etaWeeks, medLead, avgLead, oldestOpen, oldestOpenItem, retard: g.retard, weeks, wMax, hasDone: doneItems.length > 0 };
  }, [items, months, g]);

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
  const filtered = items.filter(FTEST[filter] || (() => true)).sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));
  const showWork = filter === "encours" || filter === "recette";

  // Tri du tableau au clic sur une colonne.
  const clickSort = (k) => setSortBy((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: (k === "date" || k === "heures") ? "desc" : "asc" }));
  const sortVal = (i) => {
    if (sortBy.k === "cle") return i.cle || "";
    if (sortBy.k === "resume") return (i.resume || "").toLowerCase();
    if (sortBy.k === "statut") return (i.statutJira || i.statut || "").toLowerCase();
    if (sortBy.k === "heures") return (work[i.cle]?.heuresDevSec || 0);
    return i.resolu || i.maj || "";
  };
  const sorted = filtered.slice().sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b);
    const c = (typeof va === "number") ? (va - vb) : String(va).localeCompare(String(vb));
    return sortBy.dir === "asc" ? c : -c;
  });
  const th = (k, label, cls) => (
    <th className={`${cls} th-sort${sortBy.k === k ? " on" : ""}`} onClick={() => clickSort(k)} role="button" title="Trier sur cette colonne">
      {label}{sortBy.k === k ? (sortBy.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

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
    const proj = per.projets.map((p) => `<tr><td>${esc(p.dossier)}</td><td>${p.touched}</td><td>${p.done || "—"}</td></tr>`).join("") || "<tr><td colspan='3'>—</td></tr>";
    const det = per.list.map((i) => `<tr><td>${esc(i.cle)}</td><td>${esc(i.dossier)}</td><td>${esc(i.resume)}${i.flagged ? " 🚩" : ""}</td><td>${fr(i.maj)}</td><td>${esc(i.statutJira || i.statut)}${per.doneInPeriod(i) ? " ✓" : ""}</td></tr>`).join("") || "<tr><td colspan='5'>—</td></tr>";
    const mois = months.arr.map((m) => `<tr><td>${m.label}</td><td>${m.done}</td></tr>`).join("");
    const body = `
      <h2>Vue d'ensemble</h2>
      <table><tr><th>Tickets pris</th><th>Terminés</th><th>En cours</th><th>En recette</th><th>En retard</th><th>Flaggés</th></tr>
      <tr><td>${g.total}</td><td>${g.termine}</td><td>${g.encours}</td><td>${g.recette}</td><td>${g.retard}</td><td>${g.flagged}</td></tr></table>
      <h2>Par projet — ${esc(periodLabel)}</h2>
      <table><tr><th>Projet</th><th>Travaillés</th><th>Terminés</th></tr>${proj}</table>
      <h2>Ce qu'il a fait — ${esc(periodLabel)}</h2>
      <table><tr><th>Clé</th><th>Projet</th><th>Résumé</th><th>Date</th><th>Statut</th></tr>${det}</table>
      <h2>Terminés par mois (6 derniers mois)</h2>
      <table><tr><th>Mois</th><th>Terminés</th></tr>${mois}</table>`;
    const cartouche = [
      ["Développeur", devName],
      ["Période", periodLabel],
      ["Équipe", "Armonie"],
      ["Chef de projet", "Nicolas Durand"],
      ["Synthèse", `${per.touched} travaillé(s) · ${per.done} terminé(s) · ${per.projets.length} projet(s)`],
    ];
    return buildSimpleDoc({ kicker: "Fiche développeur", title: `Fiche développeur — ${devName}`, cartouche, bodyHtml: body });
  };
  const exportPdf = () => printHtml(buildDevHtml());

  return (
    <div className="overlay" onClick={backOut}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd dev-hero">
          <button className="modal-back" onClick={backOut} title="Retour">←</button>
          <button className="x" onClick={backOut}>×</button>
          <div className="dev-hero-k">Fiche développeur</div>
          <div className="dev-hero-av"><Avatar name={devName} size={96} /></div>
          <h3 className="dev-hero-name">{devName}</h3>
          <div className="dev-hero-meta">
            <span className="dhm gold">🏢 Armonie</span>
            {topProjet ? <span className="dhm">📁 Principalement&nbsp;: {topProjet}</span> : null}
          </div>
          {email
            ? <a className="dev-hero-email" href={`mailto:${email}`} title="Écrire un e-mail">✉ {email}</a>
            : <span className="dev-hero-email muted">E-mail non exposé par Jira</span>}
        </div>
        <div className="modal-bd">

          {deleted && (
            <div className="banner" style={{ marginTop: 0, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: 1 }}>Cette fiche est marquée comme <b>supprimée</b> (développeur inactif). Ses données restent consultables.</span>
              {!ro && <button className="btn-line sm" onClick={() => onRestore && onRestore()}>Restaurer la fiche</button>}
            </div>
          )}

          {/* RENDEMENT — tout est déduit des dates Jira (création, résolution) */}
          <div className="dev-yield">
            <div className="dl-head">
              <span className="dl-title">Rendement</span>
              <span className="dl-meta">déduit des dates Jira (création, résolution) — aucune saisie manuelle</span>
            </div>
            {!rendement.hasDone ? (
              <div className="dl-empty">Pas encore de ticket terminé sur la période — rendement non calculable.</div>
            ) : (
              <>
                <div className="dy-main">
                  <div className="dy-fig">
                    <span className="dy-num">{rendement.perWeek}</span>
                    <span className="dy-unit">terminés / semaine</span>
                    <span className="dy-note">moyenne sur {rendement.r90 > 0 ? "90" : "30"} derniers jours</span>
                  </div>
                  {rendement.ratioHabit != null && (
                    <div className={`dy-habit ${rendement.ratioHabit >= 105 ? "up" : rendement.ratioHabit <= 95 ? "down" : ""}`}>
                      <span className="dh-n">{rendement.ratioHabit}%</span>
                      <small>de son rythme habituel<br />(moy. 6 mois : {rendement.perWeekHabit}/sem)</small>
                    </div>
                  )}
                  <div className={`dy-trend ${rendement.trendPct > 0 ? "up" : rendement.trendPct < 0 ? "down" : ""}`}>
                    <span>{rendement.trendPct > 0 ? "▲" : rendement.trendPct < 0 ? "▼" : "▬"} {Math.abs(rendement.trendPct)}%</span>
                    <small>3 mois vs 3 préc.</small>
                  </div>
                  <div className="dy-spark" role="img" aria-label="Terminés par semaine, 12 dernières semaines">
                    {rendement.weeks.map((w, idx) => (
                      <span key={idx} className="dy-sp-bar" style={{ height: `${Math.max(6, Math.round((w.n / rendement.wMax) * 100))}%`, opacity: w.n ? 1 : 0.32 }} title={`${w.n} terminé(s)`} />
                    ))}
                  </div>
                </div>
                <div className="dy-grid">
                  <button type="button" className="dy-cell" onClick={() => setFilter("encours")} title="Voir les tickets ouverts">
                    <span className="dc-v">{rendement.open > 0 ? (rendement.etaWeeks != null ? `~${rendement.etaWeeks} sem.` : "—") : "0"}</span>
                    <span className="dc-l">écoulement de la pile{rendement.open ? ` · ${rendement.open} ouvert(s)` : ""}</span>
                  </button>
                  <button type="button" className="dy-cell" onClick={() => setFilter("done")} title="Voir les tickets terminés">
                    <span className="dc-v">{rendement.medLead != null ? `${rendement.medLead} j` : "—"}</span>
                    <span className="dc-l">délai médian · création → résolu</span>
                  </button>
                  <button type="button" className="dy-cell" onClick={() => setFilter("done")} title="Voir les tickets terminés">
                    <span className="dc-v">{rendement.avgLead != null ? `${rendement.avgLead} j` : "—"}</span>
                    <span className="dc-l">délai moyen</span>
                  </button>
                  <button type="button" className={`dy-cell ${rendement.oldestOpen != null && rendement.oldestOpen > 30 ? "warn" : ""}`} onClick={() => rendement.oldestOpenItem && onTicket && onTicket(rendement.oldestOpenItem)} title="Ouvrir ce ticket">
                    <span className="dc-v">{rendement.oldestOpen != null ? `${rendement.oldestOpen} j` : "—"}</span>
                    <span className="dc-l">plus ancien en cours{rendement.oldestOpenItem ? ` · ${rendement.oldestOpenItem.cle}` : ""}</span>
                  </button>
                  <button type="button" className="dy-cell" onClick={() => setFilter("done")} title="Voir les terminés">
                    <span className="dc-v">{rendement.r30}</span>
                    <span className="dc-l">résolus · 30 j</span>
                  </button>
                  <button type="button" className="dy-cell" onClick={() => setFilter("done")} title="Voir les terminés">
                    <span className="dc-v">{rendement.r90}</span>
                    <span className="dc-l">résolus · 90 j</span>
                  </button>
                  <button type="button" className="dy-cell" onClick={() => setFilter("done")} title="Voir les terminés">
                    <span className="dc-v">{rendement.sum6}</span>
                    <span className="dc-l">6 mois · ~{rendement.perMonth}/mois</span>
                  </button>
                  <button type="button" className={`dy-cell ${rendement.retard ? "warn" : ""}`} onClick={() => setFilter("retard")} title="Voir les tickets en retard">
                    <span className="dc-v">{rendement.retard}</span>
                    <span className="dc-l">en retard</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* EN DIRECT — sur quoi il travaille en ce moment (tickets ouverts + activité Jira réelle) */}
          <div className="dev-live">
            <div className="dl-head">
              <span className="dl-title"><span className="live-dot" />En ce moment</span>
              <span className="dl-meta">{activeItems.length} ticket{activeItems.length > 1 ? "s" : ""} ouvert{activeItems.length > 1 ? "s" : ""}{!workConfigured ? " · connecte Jira pour l'activité" : ""}</span>
            </div>
            {activeItems.length === 0 ? (
              <div className="dl-empty">Rien en cours ni en recette pour l'instant.</div>
            ) : (
              <ul className="dlive-list">
                {activeItems.slice(0, 5).map((i) => {
                  const w = work[i.cle];
                  const dA = w && w.derniereActivite ? daysSince(w.derniereActivite) : null;
                  let badge;
                  if (workLoading && !w) badge = <span className="wk wk-load">…</span>;
                  else if (dA !== null && dA <= 10) badge = <span className="wk wk-on">● actif · {agoTxt(w.derniereActivite)}</span>;
                  else if (dA !== null) badge = <span className="wk wk-warn">● {agoTxt(w.derniereActivite)}</span>;
                  else if (w && w.heuresDevSec > 0) badge = <span className="wk wk-warn">saisie (date inconnue)</span>;
                  else badge = <span className="wk wk-off">pas de saisie récente</span>;
                  return (
                    <li key={i.cle} onClick={() => onTicket && onTicket(i)} role="button" tabIndex={0} title="Ouvrir le ticket">
                      <span className="k">{i.cle}</span>
                      <span className="dlive-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}{i.statutDepuis ? <span className="tis"> · depuis {agoTxt(i.statutDepuis)}</span> : null}</span>
                      <span className={`pill ${PILL[i.statut] || "todo"}`}>{i.statutJira || i.statut}</span>
                      {badge}
                    </li>
                  );
                })}
                {activeItems.length > 5 ? <li className="dlive-more" onClick={() => setFilter("encours")} role="button">+ {activeItems.length - 5} autre(s) — voir la liste complète ↓</li> : null}
              </ul>
            )}
          </div>

          {/* CHARGE ACTUELLE — proportion de ce qui est OUVERT (pas le cumul all-time) */}
          <div className="dev-load">
            <div className="dl-head">
              <span className="dl-title">Charge actuelle</span>
              <span className="dl-meta">{openTotal} ouvert{openTotal > 1 ? "s" : ""}{g.retard ? ` · ${g.retard} en retard` : ""} · achèvement {completion}% <span className="dl-meta-sub">({g.termine}/{g.total} pris)</span></span>
            </div>
            {openTotal === 0 ? (
              <div className="dl-empty">Aucun ticket ouvert — rien sur la pile en ce moment.</div>
            ) : (
              <>
                <div className="dl-stack" role="img" aria-label="Répartition de la charge ouverte">
                  {load.map((s) => s.n ? <span key={s.k} className={`dl-seg ${s.cls}`} style={{ width: `${s.pct}%` }} title={`${s.k} : ${s.n} (${s.pct}% de l'ouvert)`} /> : null)}
                </div>
                <div className="dl-legend">
                  {load.map((s) => (
                    <span className="dl-lg" key={s.k}>
                      <i className={`dl-dot ${s.cls}`} />{s.k} <b>{s.n}</b> <span className="dl-lg-pct">{s.pct}%</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* MOUVEMENTS EN LIVE — activité récente du dev, triée par dernière mise à jour Jira */}
          <div className="dev-sec-h" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="dl-title" style={{ fontSize: 15 }}><span className="live-dot" style={{ marginRight: 8 }} />Mouvements en live</span>
            <div className="filters" style={{ margin: 0 }}>
              {[["encours", "En cours", g.encours], ["recette", "En recette", g.recette], ["done", "Terminés", g.termine], ["retard", "En retard", g.retard], ["flag", "🚩", g.flagged], ["pris", "Tous", g.total]].map(([id, label, val]) => (
                <button key={id} className={`fbtn ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}>{label} <span className="fbtn-n">{val}</span></button>
              ))}
            </div>
            <span className="dl-meta mv-sync" style={{ marginLeft: "auto" }}>
              {filtered.length} ticket{filtered.length > 1 ? "s" : ""}
              {refreshedAt ? <> · actualisé à {new Date(refreshedAt).toLocaleTimeString("fr-FR")}</> : null}
              <button type="button" className={`mv-refresh ${refreshing || workLoading ? "spin" : ""}`} onClick={refreshNow} title="Actualiser maintenant (resynchronise les tickets)">↻</button>
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty">Aucun ticket dans cette catégorie.</div>
          ) : (
            <ul className="mv-list">
              {filtered.slice(0, 25).map((i) => {
                const rec = daysSince(i.maj);
                const live = rec !== null && rec <= 2;
                return (
                  <li key={i.cle} onClick={() => onTicket && onTicket(i)} role="button" tabIndex={0} title="Ouvrir le ticket">
                    <span className="mv-when">{i.maj ? agoTxt(i.maj) : "—"}</span>
                    <span className={`pill ${PILL[i.statut] || "todo"}`}>{i.statutJira || i.statut}</span>
                    <span className="k mv-key">{i.cle}</span>
                    <span className="mv-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}{(ACTIVE.includes(i.categorie) || WAIT.includes(i.categorie)) && i.statutDepuis ? <span className="tis"> · dans ce statut depuis {agoTxt(i.statutDepuis)}</span> : null}</span>
                    {live ? <span className="mv-live" title="Activité de moins de 48 h" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > 25 && <p className="hint">+ {filtered.length - 25} autre(s) — affine avec les filtres ci-dessus.</p>}

          {/* À TRAVAILLER — détail (heures & activité Jira), repliable */}
          <details className="dev-fold">
            <summary>À travailler — détail (heures &amp; activité Jira) <span className="fold-n">{activeItems.length}</span></summary>
            <div className="dev-fold-bd">
              {activeItems.length === 0 ? (
                <div className="empty">Aucun ticket en cours ni en recette.</div>
              ) : (
                <table className="cpw-tbl fiche-tbl work-tbl">
                  <thead><tr><th className="c-cle">Clé</th><th className="c-res">Résumé</th><th className="c-stat">Statut</th><th className="c-h">Heures (lui)</th><th className="c-since">Pris le</th><th className="c-act">Travaille dessus ?</th></tr></thead>
                  <tbody>
                    {activeItems.map((i) => {
                      const w = work[i.cle];
                      const dA = w && w.derniereActivite ? daysSince(w.derniereActivite) : null;
                      let badge;
                      if (workLoading && !w) badge = <span className="wk wk-load">…</span>;
                      else if (dA !== null && dA <= 10) badge = <span className="wk wk-on">● actif · {agoTxt(w.derniereActivite)}</span>;
                      else if (dA !== null) badge = <span className="wk wk-warn">● {agoTxt(w.derniereActivite)}</span>;
                      else if (w && w.heuresDevSec > 0) badge = <span className="wk wk-warn">saisie (date inconnue)</span>;
                      else badge = <span className="wk wk-off">aucune saisie de temps</span>;
                      return (
                        <tr key={i.cle} onClick={() => onTicket && onTicket(i)}>
                          <td className="c-cle"><span className="k">{i.cle}</span></td>
                          <td className="c-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}</td>
                          <td className="c-stat"><span className={`pill ${PILL[i.statut] || "todo"}`}>{i.statutJira || i.statut}</span></td>
                          <td className="c-h">{w && w.heuresDevSec > 0 ? <b>{w.heuresDev}</b> : "—"}</td>
                          <td className="c-since">{w && w.depuisAssigne ? <span title={fr(w.depuisAssigne)}>{agoTxt(w.depuisAssigne)}</span> : "—"}</td>
                          <td className="c-act">{badge}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {!workConfigured && <p className="hint">Connecte Jira pour voir les heures et l'historique d'assignation.</p>}
              {workConfigured && activeItems.length > 0 && <p className="hint" style={{ marginTop: 6 }}>« Heures (lui) » = temps qu'<b>il</b> a saisi dans Jira. « Pris le » = dernière assignation. « Travaille dessus ? » : <b>actif</b> = saisie de moins de 10 jours.</p>}
            </div>
          </details>

          <div className="dev-actions">
            <ExportBar buildHtml={buildDevHtml} filename={`fiche-${devName}.html`} subject={`Fiche développeur — ${devName}`} />
            {!ro && !deleted && <button className="btn-line sm" style={{ color: "var(--red)", borderColor: "#f0c7cb" }} onClick={askDelete}>Supprimer la fiche</button>}
          </div>

          {/* CE QU'IL A FAIT — par période, repliable */}
          <details className="dev-fold">
            <summary>Ce qu'il a fait — par période <span className="fold-n">{per.touched}</span></summary>
            <div className="dev-fold-bd">
              <div className="dev-sec-h" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <span>Période —</span>
                <div className="filters" style={{ margin: 0 }}>
                  {PERIODS.map((p) => (
                    <button key={p.id} className={`fbtn ${period === p.id ? "active" : ""}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
                  ))}
                </div>
              </div>
              <p className="period-sum"><b>{periodLabel}</b> — <b>{per.done}</b> terminé(s) · <b>{per.touched}</b> avec activité · sur <b>{per.projets.length}</b> projet(s)</p>
              <p className="hint" style={{ marginTop: -4 }}>« Avec activité » = tickets dont la dernière mise à jour Jira tombe dans la période — cela peut inclure des changements faits par d'autres sur des tickets où il est contributeur, donc ce volume dépasse ce qu'il a personnellement terminé. « Terminé » = résolu dans la période. Le <b>rendement</b> plus haut compte les résolutions : c'est normal qu'il soit inférieur au volume d'activité.</p>
              {per.projets.length > 0 ? (
                <table className="cpw-tbl proj-tbl">
                  <thead><tr><th>Projet</th><th>Avec activité</th><th>Terminés</th></tr></thead>
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
                  <div className="dev-sec-h">Détail ({per.list.length})</div>
                  <table className="cpw-tbl fiche-tbl">
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
            </div>
          </details>

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
