// dailyCr.js — Construit le « Récap du jour ».
// Le ZIP contient UN FICHIER PAR PROJET CLIENT, chaque fichier étant un document HTML
// autonome dans la charte cp|WIRE (CSS en ligne + accordéons <details> natifs),
// qui s'ouvre dans n'importe quel navigateur, hors de l'application.

import { LOGO_DATA_URI } from "./logo.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Ordre d'affichage des catégories (le plus actionnable d'abord). `open` = accordéon déplié par défaut.
const CR_CATS = [
  { key: "retourTest", label: "Retour de test — à retravailler", open: true },
  { key: "retourProd", label: "Retour de production — à retravailler", open: true },
  { key: "encours", label: "En cours", open: true },
  { key: "afaire", label: "À faire", open: true },
  { key: "recetteArmonie", label: "En recette (Armonie)", open: true },
  { key: "recetteClient", label: "En recette client", open: true },
  { key: "attenteClient", label: "En attente client", open: true },
  { key: "miseEnProd", label: "Mise en production", open: false },
  { key: "termine", label: "Terminés", open: false },
  { key: "annule", label: "Annulés", open: false },
];

function workers(i) {
  if (i.contributors && i.contributors.length) return i.contributors.join(", ");
  return i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "—");
}

function rowsTable(items) {
  const rows = items
    .slice()
    .sort((a, b) => String(a.cle).localeCompare(String(b.cle)))
    .map((i) => `<tr>
      <td class="k">${esc(i.cle)}</td>
      <td class="r">${esc(i.resume || "—")}</td>
      <td>${esc(workers(i))}</td>
      <td class="d">${esc(i.echeance || "—")}${i.enRetard ? ' <span class="late">en retard</span>' : ""}</td>
    </tr>`).join("");
  return `<table class="tk"><thead><tr><th>Clé</th><th>Résumé</th><th>Sur le ticket</th><th>Échéance</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Logo cp|WIRE — marque (SVG autonome) + mot-symbole.
const CW_MARK = `<svg class="cw-mark" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="cwg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E2A5D"/><stop offset="1" stop-color="#4B3F8F"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#cwg)"/><circle cx="7.5" cy="8" r="2" fill="#A8884E"/><circle cx="16.5" cy="16" r="2" fill="#A8884E"/><path d="M7.5 8L16.5 16" stroke="#F5F2FC" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const CW_WORD = `<span class="cw-cp">cp</span><span class="cw-bar">|</span><span class="cw-wire">WIRE</span>`;

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
:root{ --navy:#2E2A5D; --indigo:#4B3F8F; --gold:#A8884E; --lavande:#F5F2FC; --ink:#2B2620; --body:#4a4763; --muted:#6b6488; --line:#ece9f3; --serif:'Poppins','Segoe UI',system-ui,sans-serif; --sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif; --warn:#a9531f; --warnbg:#faf2ea; --ok:#2f7d4f; --okbg:#e7f3ec; }
*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; }
body{ background:#e9e7ef; font-family:var(--sans); color:var(--body); line-height:1.6; padding:34px 16px; -webkit-font-smoothing:antialiased; }
.page{ max-width:900px; margin:0 auto; background:#fff; border-radius:6px; box-shadow:0 18px 50px rgba(46,42,93,.14); overflow:hidden; }
.bar{ height:8px; background:linear-gradient(90deg,var(--navy) 0%,var(--indigo) 52%,var(--gold) 100%); }
.inner{ padding:50px 60px 38px; }
.brand{ display:flex; align-items:center; gap:13px; margin-bottom:34px; }
.cpwire-logo{ font-family:var(--serif); font-weight:800; letter-spacing:-.01em; white-space:nowrap; display:inline-flex; align-items:center; gap:8px; }
.brand-logo{ height:42px; width:auto; display:block; }
.cpwire-logo .cw-cp{ color:var(--indigo); }
.cpwire-logo .cw-bar{ color:var(--gold); margin:0 1px; }
.cpwire-logo .cw-wire{ color:var(--navy); letter-spacing:.05em; }
.cpwire-logo.lg{ font-size:23px; }
.cpwire-logo.sm{ font-size:14px; gap:0; vertical-align:middle; }
.cw-mark{ width:26px; height:26px; flex:none; }
.tagline{ font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
.eyebrow{ font-size:12px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--gold); margin-bottom:12px; }
h1.title{ font-family:var(--serif); font-size:38px; font-weight:800; color:var(--navy); line-height:1.05; letter-spacing:-.015em; margin:0; }
h2.subtitle{ font-family:var(--serif); font-size:19px; font-weight:700; color:var(--indigo); margin:9px 0 0; line-height:1.25; }
.rule{ width:120px; height:5px; border-radius:3px; background:linear-gradient(90deg,var(--gold),var(--indigo)); margin:22px 0 24px; }
.lede{ font-size:15px; line-height:1.75; color:var(--body); max-width:64ch; margin:0; }
.lede b{ color:var(--navy); font-weight:700; }
.tag{ display:inline-block; font-size:11px; font-weight:800; padding:2px 9px; border-radius:999px; margin-left:8px; vertical-align:middle; }
.tag.tma{ background:#efeafe; color:#5b3fb0; } .tag.projet{ background:var(--warnbg); color:var(--warn); } .tag.mix{ background:#eef3ff; color:#3a5bd0; }
.meta{ margin-top:30px; background:var(--lavande); border-left:4px solid var(--gold); border-radius:14px; padding:22px 26px; display:grid; grid-template-columns:160px 1fr; row-gap:12px; column-gap:18px; }
.meta dt{ font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); align-self:center; }
.meta dd{ margin:0; font-size:14px; color:#3f3d57; font-weight:500; }
.kpis{ display:flex; flex-wrap:wrap; gap:12px; margin:26px 0 8px; }
.kpi{ flex:1 1 120px; background:var(--lavande); border-radius:12px; padding:14px 16px; text-align:center; }
.kpi b{ display:block; font-family:var(--serif); font-size:26px; font-weight:800; color:var(--navy); line-height:1; }
.kpi span{ display:block; font-size:11px; color:var(--muted); margin-top:7px; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
.kpi.warn{ background:var(--warnbg); } .kpi.warn b{ color:var(--warn); }
.kpi.ok{ background:var(--okbg); } .kpi.ok b{ color:var(--ok); }
.sec-title{ font-family:var(--serif); font-size:14px; font-weight:700; color:var(--navy); text-transform:uppercase; letter-spacing:.07em; margin:30px 0 12px; }
details{ border:1px solid var(--line); border-radius:12px; margin-bottom:10px; overflow:hidden; background:#fff; }
summary{ cursor:pointer; list-style:none; padding:12px 16px; font-weight:700; font-size:14.5px; color:var(--indigo); background:var(--lavande); display:flex; align-items:center; gap:10px; user-select:none; }
summary::-webkit-details-marker{ display:none; }
summary::before{ content:"\\25B8"; color:var(--gold); font-size:13px; transition:transform .15s; }
details[open] summary::before{ transform:rotate(90deg); }
summary .cnt{ margin-left:auto; background:var(--navy); color:#fff; font-size:12px; font-weight:700; padding:2px 10px; border-radius:999px; }
table.tk{ width:100%; border-collapse:collapse; font-size:13px; }
table.tk th{ text-align:left; padding:9px 16px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid var(--line); font-weight:600; }
table.tk td{ padding:9px 16px; border-bottom:1px solid var(--line); vertical-align:top; color:var(--body); }
table.tk tr:last-child td{ border-bottom:none; }
table.tk tbody tr:nth-child(even) td{ background:#faf9fd; }
td.k{ font-family:ui-monospace,"SF Mono",Menlo,monospace; font-weight:700; color:var(--indigo); white-space:nowrap; }
td.r{ width:50%; }
td.d{ white-space:nowrap; }
.late{ color:var(--warn); font-weight:700; font-size:11px; }
section.ccl{ margin-top:28px; background:#faf6ee; border-left:4px solid var(--gold); border-radius:12px; padding:18px 22px; }
section.ccl h2{ font-family:var(--serif); font-size:13px; text-transform:uppercase; letter-spacing:.1em; color:var(--gold); margin:0 0 8px; }
section.ccl p{ margin:0; font-size:14.5px; color:#403d57; line-height:1.7; }
footer.cr{ margin-top:40px; padding-top:18px; border-top:1px solid var(--line); text-align:center; }
footer.cr .f1{ font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:#b3aecb; }
footer.cr .f2{ font-size:11px; color:var(--muted); margin-top:7px; font-weight:600; }
@media print{ body{ background:#fff; padding:0; } .page{ box-shadow:none; border-radius:0; max-width:none; } .inner{ padding:14mm 16mm; } details,table,section.ccl,.meta{ page-break-inside:avoid; } @page{ margin:12mm; } }
@media (max-width:640px){ .inner{ padding:32px 22px; } h1.title{ font-size:30px; } .meta{ grid-template-columns:1fr; row-gap:4px; } .meta dt{ margin-top:8px; } }
`;

// Construit le document HTML d'UN client.
function clientDoc({ dossier, items, meName, human, heure }) {
  const c = {};
  items.forEach((i) => { c[i.categorie] = (c[i.categorie] || 0) + 1; });
  const done = (c.termine || 0) + (c.miseEnProd || 0);
  const rec = (c.recetteArmonie || 0) + (c.recetteClient || 0);
  const ret = (c.retourTest || 0) + (c.retourProd || 0);
  const late = items.filter((i) => i.enRetard).length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const wkAgo = Date.now() - 7 * 86400000;
  const faitJour = items.filter((i) => (i.resolu || "").slice(0, 10) === todayIso).length;
  const faitSem = items.filter((i) => i.resolu && new Date(i.resolu).getTime() >= wkAgo).length;
  // Activité réelle du jour : tickets ayant bougé (mis à jour aujourd'hui), pas seulement « résolus ».
  // Sur un projet, « résolu aujourd'hui » est souvent 0 alors que l'équipe a avancé — d'où ce repère.
  const bougeJour = items.filter((i) => (i.maj || "").slice(0, 10) === todayIso).length;

  const engs = new Set(items.map((i) => i.engagement).filter((e) => e && e !== "—"));
  const engagement = engs.size === 0 ? "" : engs.size === 1 ? [...engs][0] : "TMA + Projet";
  const engCls = engagement === "Projet" ? "projet" : engagement === "TMA" ? "tma" : "mix";
  const tag = engagement ? ` <span class="tag ${engCls}">${esc(engagement)}</span>` : "";

  const sections = CR_CATS.map((cat) => {
    const list = items.filter((i) => i.categorie === cat.key);
    if (!list.length) return "";
    return `<details${cat.open ? " open" : ""}><summary>${esc(cat.label)} <span class="cnt">${list.length}</span></summary>${rowsTable(list)}</details>`;
  }).filter(Boolean).join("\n");

  const kpis = `<div class="kpis">
    <div class="kpi ok"><b>${bougeJour}</b><span>Ont bougé aujourd'hui</span></div>
    <div class="kpi"><b>${faitJour}</b><span>Terminés aujourd'hui</span></div>
    <div class="kpi"><b>${c.encours || 0}</b><span>En cours</span></div>
    <div class="kpi"><b>${rec}</b><span>En recette</span></div>
    <div class="kpi warn"><b>${ret}</b><span>À retravailler</span></div>
    <div class="kpi warn"><b>${late}</b><span>En retard</span></div>
    <div class="kpi"><b>${c.afaire || 0}</b><span>À faire</span></div>
  </div>`;

  // Petite conclusion — synthèse courte, orientée action.
  const ccl = [];
  if (ret) ccl.push(`Priorité immédiate : ${ret} retour${ret > 1 ? "s" : ""} de test ou de production à retravailler.`);
  else ccl.push(`Pipeline de recette sain : aucun retour de test ou de production en cours.`);
  if (rec) ccl.push(`${rec} ticket${rec > 1 ? "s" : ""} en recette à faire avancer.`);
  if (late) ccl.push(`${late} ticket${late > 1 ? "s" : ""} en retard à surveiller.`);
  ccl.push(`Prochaines étapes : finaliser les recettes en cours, puis préparer les mises en production validées.`);
  const conclusion = ccl.join(" ");

  const ledeAct = bougeJour > 0
    ? `<b>${bougeJour} ticket${bougeJour > 1 ? "s" : ""}</b> ${bougeJour > 1 ? "ont" : "a"} avancé aujourd'hui sur <b>${esc(dossier)}</b>${faitJour ? `, dont <b>${faitJour}</b> terminé${faitJour > 1 ? "s" : ""}` : ""}`
    : `aucun ticket n'a changé de statut aujourd'hui sur <b>${esc(dossier)}</b> ; le chantier reste actif (<b>${c.encours || 0}</b> en cours, <b>${rec}</b> en recette)`;
  const lede = `Au ${esc(human)}, ${ledeAct}.${faitSem ? ` ${faitSem} ticket${faitSem > 1 ? "s" : ""} terminé${faitSem > 1 ? "s" : ""} sur les 7 derniers jours.` : ""} ${ret ? "Les retours de test ou de production sont la priorité du jour." : "Le pipeline de recette est sain."}`;

  const meSign = esc(meName.replace(/\s+(\S+)$/, (m, p) => " " + p.toUpperCase()));

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Récap ${esc(dossier)} — ${esc(human)}</title><style>${STYLE}</style></head>
<body><div class="page"><div class="bar"></div><div class="inner">
  <div class="brand"><img class="brand-logo" src="${LOGO_DATA_URI}" alt="Armonie"></div>
  <div class="eyebrow">Armonie Group · Récap journalier</div>
  <h1 class="title">Récap du jour</h1>
  <h2 class="subtitle">${esc(dossier)}${tag}</h2>
  <div class="rule"></div>
  <p class="lede">${lede}</p>
  <dl class="meta">
    <dt>Client</dt><dd>${esc(dossier)}</dd>
    <dt>Périmètre</dt><dd>TMA — suivi Jira${engagement ? ` (${esc(engagement)})` : ""}</dd>
    <dt>Objet</dt><dd>Récap quotidien — tickets actifs &amp; priorités</dd>
    <dt>Date</dt><dd>${esc(human)}</dd>
    <dt>Rédaction</dt><dd>${esc(meName)} — Chef de projet MOE</dd>
    <dt>Source</dt><dd>Jira</dd>
    <dt>Classification</dt><dd>Interne</dd>
  </dl>
  ${kpis}
  <div class="sec-title">Revue complète des tickets</div>
  ${sections || '<p style="color:#6b6880">Aucun ticket à afficher pour ce client.</p>'}
  <section class="ccl"><h2>Conclusion</h2><p>${esc(conclusion)}</p></section>
  <footer class="cr"><div class="f1">Armonie Group · Notos · PHL Soft — Confidentiel</div><div class="f2">${meSign} · Récap ${esc(human)}</div></footer>
</div></div></body></html>`;
}

// Nettoie un nom de client pour en faire un nom de fichier sûr.
function safeName(s) { return String(s || "Client").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim(); }

// Renvoie { iso, human, heure, fileBase, files: [{ dossier, count, name, html }] } — un fichier par client.
export function buildDailyCrFiles(issues = [], { meName = "Nicolas Durand", teamLabel = "TMA Armonie" } = {}) {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const human = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const byDoss = {};
  issues.forEach((i) => { const d = i.dossier || "Autre"; (byDoss[d] ||= []).push(i); });
  const dossiers = Object.keys(byDoss).sort((a, b) => a.localeCompare(b));

  const files = dossiers.map((d) => ({
    dossier: d,
    count: byDoss[d].length,
    name: `Recap ${safeName(d)} ${iso}.html`,
    html: clientDoc({ dossier: d, items: byDoss[d], meName, teamLabel, human, heure }),
  }));

  return { iso, human, heure, fileBase: `Recap du ${iso}`, files };
}
