// blockersDoc.js — Document « Points bloquants » charté, par client. Inclus dans le ZIP du récap.
// Chiffres et dates 100 % issus des données (jamais inventés). Les tickets « dormants » (sans
// mouvement depuis longtemps, probablement obsolètes) sont EXCLUS, comme dans le voyant.

import { computeBlockers } from "./blockers.js";

const NAVY = "#2E2A5D", INDIGO = "#4B3F8F", GOLD = "#A8884E", INK = "#1F1B33";
const MUTED = "#6E6A86", SOFT = "#F5F2FC", LINE = "#e7e5f1", RED = "#C0392B", AMBER = "#C2691A";
const OBSOLETE_DAYS = 180;

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmtD(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function joursOuvres(iso, now = new Date()) {
  if (!iso) return 0; const d = new Date(iso); if (isNaN(d)) return 0;
  let n = 0; const cur = new Date(d);
  while (cur < now) { cur.setDate(cur.getDate() + 1); const wd = cur.getDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}
const daysCal = (iso) => { if (!iso) return 0; const d = new Date(iso); return isNaN(d) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000); };
function sinceLabel(kind) {
  switch (kind) {
    case "retard": return "échéance dépassée le";
    case "bloque": return "signalé bloquant le";
    case "retourProd": return "passé en retour prod le";
    case "retourTest": return "passé en retour test le";
    case "afaire": return "en « À faire » depuis le";
    default: return "dans cet état depuis le";
  }
}
function preciseSince(p, sinceMap) {
  if (p.kind === "retard") return p.since;
  const s = sinceMap[p.id];
  if (!s) return p.since;
  if (p.kind === "bloque") return s.flaggedAt || s.enteredStatusAt || p.since;
  return s.enteredStatusAt || p.since;
}
function clientIntro(list) {
  const c = list.filter((p) => p.severity === "critique").length;
  const m = list.length - c;
  const bits = [`${list.length} point${list.length > 1 ? "s" : ""} bloquant${list.length > 1 ? "s" : ""}`];
  if (c) bits.push(`${c} critique${c > 1 ? "s" : ""}`);
  if (m) bits.push(`${m} à surveiller`);
  let txt = bits.join(" · ");
  const oldest = list.slice().sort((a, b) => b._days - a._days)[0];
  if (oldest && oldest._since) txt += `. Le plus ancien dans son état : ${oldest.id}, ${sinceLabel(oldest.kind)} ${fmtD(oldest._since)} (${oldest._days} j ouvrés).`;
  return txt;
}
function engTag(eng) {
  if (eng === "Projet") return `<span class="eng eng-p">PROJET</span>`;
  if (eng === "TMA") return `<span class="eng eng-t">TMA</span>`;
  return "";
}

// Chemin « ZIP du récap » : recalcule tout depuis les tickets et exclut les dormants (>180 j).
export function buildBlockersDoc(issues = [], { meName = "", sinceMap = {} } = {}) {
  const all = computeBlockers(issues).map((p) => {
    const _since = preciseSince(p, sinceMap);
    return { ...p, _since, _days: joursOuvres(_since), _moveDays: daysCal(p.maj) };
  });
  const dormant = all.filter((p) => p._moveDays > OBSOLETE_DAYS).length;
  const pts = all.filter((p) => p._moveDays <= OBSOLETE_DAYS); // dormants exclus
  return renderBlockersHtml(pts, { meName, dormant });
}

// Chemin « export du voyant » : rend EXACTEMENT la liste déjà filtrée à l'écran
// (client choisi, dormants masqués ou non, recherche, tri). Aucun recalcul, aucune
// ré-exclusion — fidélité totale aux filtres. `caption` décrit les filtres appliqués.
export function buildBlockersDocFromPoints(points = [], { meName = "", caption = "", dormant = 0 } = {}) {
  const pts = points.map((p) => ({
    ...p,
    _since: (p._since != null ? p._since : p.since) || null,
    _days: (p._days != null ? p._days : joursOuvres(p._since != null ? p._since : p.since)),
    _moveDays: (p._moveDays != null ? p._moveDays : daysCal(p.maj)),
  }));
  return renderBlockersHtml(pts, { meName, dormant, caption });
}

// Rendu charté commun (depuis une liste de points déjà préparés).
function renderBlockersHtml(pts, { meName = "", dormant = 0, caption = "" } = {}) {
  const crit = pts.filter((p) => p.severity === "critique").length;
  const byClient = {};
  pts.forEach((p) => { const c = p.project || "—"; (byClient[c] ||= []).push(p); });
  const clients = Object.keys(byClient).sort();
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const sections = clients.map((c) => {
    const list = byClient[c].slice().sort((a, b) => (b.severity === "critique") - (a.severity === "critique") || b._days - a._days);
    const rows = list.map((p) => {
      const col = p.severity === "critique" ? RED : AMBER;
      const tag = p.severity === "critique" ? "CRITIQUE" : "MAJEUR";
      return `<tr>
        <td class="sev"><span class="badge" style="background:${col}">${tag}</span>${engTag(p.engagement)}</td>
        <td class="cle">${esc(p.id)}</td>
        <td class="res"><div class="t">${esc(p.title || "")}</div><div class="why" style="color:${col}">${esc(p.reason || "")}</div></td>
        <td class="dev">${esc(p.assignee || "Non assigné")}</td>
        <td class="since">${sinceLabel(p.kind)}<br><b>${fmtD(p._since)}</b><span class="d">${p._days} j ouvrés</span></td>
      </tr>`;
    }).join("");
    return `<section class="cli">
      <div class="cli-h"><span class="cli-name">${esc(c)}</span><span class="cli-c">${list.length} point${list.length > 1 ? "s" : ""}</span></div>
      <p class="intro">${esc(clientIntro(list))}</p>
      <table><thead><tr><th>Gravité</th><th>Ticket</th><th>Sujet &amp; raison</th><th>Développeur</th><th>Depuis</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }).join("");

  const body = pts.length
    ? sections
    : `<section class="cli"><p class="empty">Aucun point bloquant actif à signaler. Tous les voyants sont au vert.</p></section>`;

  const etabli = meName || "Nicolas Durand";
  const clientsLabel = clients.length ? clients.join(", ") : "—";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Points bloquants — ${esc(today)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
    @page { size: A4; margin: 15mm 14mm; }
    *{box-sizing:border-box} html,body{margin:0}
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:${INK};font-size:11.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    h1,h2,h3,.cli-name,.synth .s b,.cov-title{font-family:Poppins,Inter,sans-serif}

    /* ---------- COUVERTURE ---------- */
    .cover{position:relative;min-height:262mm;display:flex;flex-direction:column;justify-content:center;
      background:linear-gradient(150deg,${NAVY} 0%,${INDIGO} 62%,#3a3470 100%);color:#fff;
      margin:-15mm -14mm 0;padding:34mm 22mm;page-break-after:always}
    .cover .eyebrow{font-size:10.5px;letter-spacing:.28em;text-transform:uppercase;color:#d8cda0;font-weight:700}
    .cov-title{font-size:54px;font-weight:800;letter-spacing:.5px;margin:14px 0 0;line-height:1}
    .cover .csub{font-size:15px;opacity:.9;margin-top:14px}
    .cover .cmeta{font-size:12.5px;opacity:.8;margin-top:6px;text-transform:capitalize}
    .cover .crule{width:96px;height:4px;background:${GOLD};border-radius:3px;margin:26px 0}
    .cover .pill{display:inline-block;border:1px solid rgba(216,205,160,.6);color:#e9e0bf;font-size:9.5px;
      letter-spacing:.22em;text-transform:uppercase;font-weight:700;padding:6px 12px;border-radius:20px}
    .enbref{margin-top:30px;background:rgba(255,255,255,.07);border-left:3px solid ${GOLD};border-radius:0 8px 8px 0;padding:16px 20px;max-width:118mm}
    .enbref .lab{font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:#d8cda0;font-weight:700}
    .enbref p{margin:8px 0 0;font-size:12px;line-height:1.6;opacity:.95}
    .cover .estab{margin-top:auto;padding-top:30px;font-size:11px;opacity:.85}
    .cover .estab .lab{font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:#d8cda0;font-weight:700;display:block;margin-bottom:3px}
    .cover .conf{position:absolute;left:22mm;bottom:16mm;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55)}
    .cover .web{position:absolute;right:22mm;bottom:16mm;font-size:9px;letter-spacing:.06em;color:rgba(255,255,255,.55)}

    /* ---------- INTÉRIEUR ---------- */
    .synth{display:flex;flex-wrap:wrap;gap:30px;padding:20px 4px 18px;border-bottom:2px solid ${GOLD};margin-bottom:4px}
    .synth .s{font-size:9.5px;color:${MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600}
    .synth .s b{display:block;font-size:30px;font-weight:800;line-height:1;margin-bottom:4px}
    .synth .s.tot b{color:${NAVY}} .synth .s.cri b{color:${RED}} .synth .s.maj b{color:${AMBER}} .synth .s.cli b{color:${INDIGO}}
    h2.sec{font-size:13px;color:${NAVY};letter-spacing:.04em;margin:18px 0 6px;text-transform:uppercase}
    .lead{color:${MUTED};font-size:11.5px;margin:0 0 14px}
    .legend{background:${SOFT};border:1px solid ${LINE};border-radius:9px;padding:12px 16px;margin:0 0 18px}
    .legend .lt{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:${INDIGO};font-weight:700;margin-bottom:7px}
    .legend .row{display:flex;gap:9px;align-items:baseline;font-size:10.5px;color:${INK};margin:4px 0}
    .legend .k{display:inline-block;min-width:64px;font-weight:800;font-size:8px;letter-spacing:.5px;color:#fff;padding:3px 7px;border-radius:5px;text-align:center}
    .legend .k.c{background:${RED}} .legend .k.m{background:${AMBER}} .legend .k.d{background:${INDIGO}}
    .filt{font-size:10.5px;color:${INDIGO};font-weight:600;margin:0 0 8px} .filt b{color:${NAVY}}
    .note{font-size:10.5px;color:${MUTED};margin:0 0 14px;font-style:italic}
    section.cli{margin:0 0 22px;break-inside:avoid;page-break-inside:avoid}
    .cli-h{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,${NAVY},${INDIGO});color:#fff;border-radius:9px;padding:10px 15px;box-shadow:inset 0 -3px 0 rgba(168,136,78,.7)}
    .cli-h .cli-name{font-size:15px;font-weight:700;letter-spacing:.3px}
    .cli-h .cli-c{font-size:10px;text-transform:uppercase;letter-spacing:.1em;opacity:.85}
    .intro{margin:9px 2px 10px;color:${MUTED};font-size:11px}
    table{width:100%;border-collapse:separate;border-spacing:0}
    thead{display:table-header-group}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};padding:5px 9px;border-bottom:1.5px solid ${GOLD}}
    td{padding:9px;border-bottom:1px solid ${LINE};vertical-align:top}
    td.sev{width:80px} td.cle{width:80px;font-family:ui-monospace,Menlo,monospace;font-weight:700;color:${GOLD};padding-top:11px}
    td.dev{width:120px;font-weight:600} td.since{width:108px;white-space:nowrap;color:${MUTED};font-size:10px;line-height:1.35}
    td.since b{color:${INK};font-size:11.5px} td.since .d{display:block;color:${MUTED};font-size:9.5px;margin-top:1px}
    .badge{display:inline-block;color:#fff;font-size:8px;font-weight:800;letter-spacing:.5px;padding:3px 7px;border-radius:5px}
    .eng{display:inline-block;margin-top:5px;font-size:7.5px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:5px}
    .eng-p{background:#fff2e7;color:#b4560b;border:1px solid #f0d2b0}
    .eng-t{background:#e2f3ea;color:#1f8a5f;border:1px solid #bfe3d0}
    .res .t{font-weight:600;line-height:1.35} .res .why{font-size:10px;font-weight:600;margin-top:3px}
    .empty{color:${MUTED};padding:26px;text-align:center;font-size:13px}
    .ft{margin-top:18px;padding-top:10px;color:${MUTED};font-size:9px;border-top:1px solid ${LINE};display:flex;justify-content:space-between}
  </style></head><body>

  <div class="cover">
    <div class="eyebrow">Armonie Group · Points bloquants</div>
    <h1 class="cov-title">Points<br>bloquants</h1>
    <div class="csub">Portefeuille TMA &amp; Projets — suivi multi-clients</div>
    <div class="cmeta">${clients.length} client${clients.length > 1 ? "s" : ""} · ${esc(today)}</div>
    <div class="crule"></div>
    <span class="pill">Document de travail interne</span>
    <div class="enbref">
      <div class="lab">En bref</div>
      <p>${pts.length} point${pts.length > 1 ? "s" : ""} bloquant${pts.length > 1 ? "s" : ""} recensé${pts.length > 1 ? "s" : ""} sur l'ensemble du portefeuille. ${clients.length} client${clients.length > 1 ? "s" : ""} concerné${clients.length > 1 ? "s" : ""} : ${esc(clientsLabel)}. ${crit} critique${crit > 1 ? "s" : ""} (échéance dépassée) · ${pts.length - crit} à surveiller (statut figé). Données issues de Jira : statuts, drapeaux et historique.</p>
    </div>
    <div class="estab"><span class="lab">Établi par</span>${esc(etabli)}<br>Chef de projet (MOE) — Armonie Group</div>
    <div class="conf">Armonie Group · Confidentiel</div>
    <div class="web">armonie.group</div>
  </div>

  <h2 class="sec">Synthèse — vue d'ensemble</h2>
  <p class="lead">Répartition des ${pts.length} point${pts.length > 1 ? "s" : ""} bloquant${pts.length > 1 ? "s" : ""} sur ${clients.length} client${clients.length > 1 ? "s" : ""}. Le détail par client suit.</p>
  <div class="synth">
    <div class="s tot"><b>${pts.length}</b>points bloquants</div>
    <div class="s cri"><b>${crit}</b>critiques</div>
    <div class="s maj"><b>${pts.length - crit}</b>à surveiller</div>
    <div class="s cli"><b>${clients.length}</b>clients</div>
  </div>
  <div class="legend">
    <div class="lt">Comment lire ce document</div>
    <div class="row"><span class="k c">Critique</span><span>Échéance dépassée.</span></div>
    <div class="row"><span class="k m">Majeur</span><span>Assigné mais resté en « À faire » (statut non transitionné), recette rejetée, ou signalé bloquant.</span></div>
    <div class="row"><span class="k d">Depuis</span><span>Date d'entrée réelle dans l'état bloquant, et ancienneté en jours ouvrés.</span></div>
  </div>
  ${caption ? `<p class="filt">Filtres appliqués : ${esc(caption)}</p>` : ""}
  ${dormant ? `<p class="note">${dormant} ticket${dormant > 1 ? "s" : ""} dormant${dormant > 1 ? "s" : ""} (sans mouvement depuis plus de ${OBSOLETE_DAYS} jours, probablement obsolète${dormant > 1 ? "s" : ""}) exclu${dormant > 1 ? "s" : ""} de ce relevé.</p>` : ""}
  ${body}
  <div class="ft"><span>Armonie Group · Points bloquants — document de travail interne · confidentiel</span><span>${esc(today)}</span></div>
  </body></html>`;

  return { name: "Points-bloquants.html", dossier: "Points bloquants", html, count: pts.length };
}
