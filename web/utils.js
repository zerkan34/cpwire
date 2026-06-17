// dailyCr.js — Construit le « Compte rendu du jour ».
// Le ZIP contient UN FICHIER PAR PROJET CLIENT (un CR détaillé par client),
// chaque fichier étant un document HTML AUTONOME (CSS en ligne + accordéons <details> natifs)
// qui s'ouvre dans n'importe quel navigateur, hors de l'application.

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

const STYLE = `
  :root { --ink:#1f1d2b; --muted:#6b6880; --indigo:#2c2945; --gold:#a9842f; --line:#e7e4f0; --soft:#f7f6fb; --warn:#a9531f; --warnbg:#fbeede; --ok:#1f7a52; --okbg:#e7f6ee; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); margin: 0; padding: 28px; background: #fff; line-height: 1.5; }
  .doc { max-width: 940px; margin: 0 auto; }
  header.cr { border-bottom: 3px solid var(--indigo); padding-bottom: 14px; margin-bottom: 18px; }
  header.cr .eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; font-weight: 700; color: var(--gold); }
  header.cr h1 { font-size: 25px; margin: 4px 0 8px; color: var(--indigo); }
  header.cr .meta { font-size: 13px; color: var(--muted); }
  header.cr .meta b { color: var(--ink); }
  .tag { display:inline-block; font-size:11px; font-weight:800; padding:1px 8px; border-radius:999px; margin-left:6px; vertical-align:middle; }
  .tag.tma { background:#efeafe; color:#5b3fb0; border:1px solid #e0d6f5; }
  .tag.projet { background:var(--warnbg); color:var(--warn); border:1px solid #f0d2b0; }
  .tag.mix { background:#eef3ff; color:#3a5bd0; border:1px solid #d4e0ff; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 22px; }
  .kpi { flex: 1 1 110px; background: var(--soft); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; text-align: center; }
  .kpi b { display: block; font-size: 23px; font-weight: 800; color: var(--indigo); line-height: 1; }
  .kpi span { display: block; font-size: 11px; color: var(--muted); margin-top: 5px; text-transform: uppercase; letter-spacing: .04em; }
  .kpi.warn { background: var(--warnbg); border-color: #f0d9bf; } .kpi.warn b { color: var(--warn); }
  .kpi.ok { background: var(--okbg); border-color: #c8ebd7; } .kpi.ok b { color: var(--ok); }
  details { border: 1px solid var(--line); border-radius: 12px; margin-bottom: 12px; overflow: hidden; background: #fff; }
  summary { cursor: pointer; list-style: none; padding: 12px 16px; font-weight: 700; font-size: 15px; color: var(--indigo); background: var(--soft); display: flex; align-items: center; gap: 10px; user-select: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: "\\25B8"; color: var(--gold); font-size: 13px; transition: transform .15s; }
  details[open] summary::before { transform: rotate(90deg); }
  summary .cnt { margin-left: auto; background: var(--indigo); color: #fff; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  table.tk { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.tk th { text-align: left; padding: 9px 16px; background: #fff; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--line); }
  table.tk td { padding: 9px 16px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.tk tr:last-child td { border-bottom: none; }
  table.tk tbody tr:nth-child(even) td { background: #fafafd; }
  td.k { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 700; color: var(--indigo); white-space: nowrap; }
  td.r { width: 52%; }
  td.d { white-space: nowrap; }
  .late { color: var(--warn); font-weight: 700; font-size: 11px; }
  section.ccl { margin-top: 24px; border-top: 2px solid var(--line); padding-top: 14px; }
  section.ccl h2 { font-size: 17px; color: var(--indigo); margin: 0 0 8px; }
  section.ccl p { margin: 0; font-size: 14px; }
  footer.cr { margin-top: 22px; font-size: 11.5px; color: var(--muted); text-align: center; }
  @media print { body { padding: 0; } details { break-inside: avoid; } }
`;

// Construit le document HTML d'UN client.
function clientDoc({ dossier, items, meName, human, heure }) {
  const c = {};
  items.forEach((i) => { c[i.categorie] = (c[i.categorie] || 0) + 1; });
  const total = items.length;
  const done = (c.termine || 0) + (c.miseEnProd || 0);
  const rec = (c.recetteArmonie || 0) + (c.recetteClient || 0);
  const ret = (c.retourTest || 0) + (c.retourProd || 0);
  const late = items.filter((i) => i.enRetard).length;

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
    <div class="kpi"><b>${total}</b><span>Total</span></div>
    <div class="kpi"><b>${c.afaire || 0}</b><span>À faire</span></div>
    <div class="kpi"><b>${c.encours || 0}</b><span>En cours</span></div>
    <div class="kpi"><b>${rec}</b><span>En recette</span></div>
    <div class="kpi warn"><b>${ret}</b><span>À retravailler</span></div>
    <div class="kpi warn"><b>${late}</b><span>En retard</span></div>
    <div class="kpi ok"><b>${done}</b><span>Terminés</span></div>
  </div>`;

  const seg = [];
  if (c.encours) seg.push(`${c.encours} en cours`);
  if (c.afaire) seg.push(`${c.afaire} à faire`);
  if (rec) seg.push(`${rec} en recette`);
  if (ret) seg.push(`${ret} à retravailler (retours)`);
  if (done) seg.push(`${done} terminé${done > 1 ? "s" : ""}`);
  const parts = [];
  parts.push(`Au ${human}, le périmètre ${dossier} compte ${total} ticket${total > 1 ? "s" : ""}.`);
  if (seg.length) parts.push(`Répartition : ${seg.join(", ")}.`);
  if (late) parts.push(`${late} ticket${late > 1 ? "s" : ""} en retard à surveiller de près.`);
  if (ret) parts.push(`Les retours de test/production constituent la priorité immédiate sur ce client : ils sont détaillés ci-dessus pour action.`);
  else parts.push(`Aucun retour de test ou de production en cours : le pipeline de recette est sain à ce jour.`);
  parts.push(`Prochaines étapes : finaliser les recettes en cours et préparer les mises en production une fois les validations complètes.`);
  const conclusion = parts.join(" ");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CR ${esc(dossier)}</title><style>${STYLE}</style></head>
<body><div class="doc">
  <header class="cr">
    <div class="eyebrow">Compte rendu journalier</div>
    <h1>${esc(dossier)}${tag}</h1>
    <div class="meta">Compte rendu du <b>${esc(human)}</b> · Chef de projet : <b>${esc(meName)}</b> · Établi à ${esc(heure)} · Source : Jira (cp|WIRE)</div>
  </header>
  ${kpis}
  ${sections || '<p style="color:#6b6880">Aucun ticket à afficher pour ce client.</p>'}
  <section class="ccl"><h2>Conclusion</h2><p>${esc(conclusion)}</p></section>
  <footer class="cr">Document généré automatiquement par cp|WIRE le ${esc(human)} à ${esc(heure)}.</footer>
</div></body></html>`;
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
    name: `CR ${safeName(d)} ${iso}.html`,
    html: clientDoc({ dossier: d, items: byDoss[d], meName, teamLabel, human, heure }),
  }));

  return { iso, human, heure, fileBase: `CR du ${iso}`, files };
}
