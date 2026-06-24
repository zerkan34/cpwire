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

export function buildBlockersDoc(issues = [], { meName = "", sinceMap = {} } = {}) {
  const all = computeBlockers(issues).map((p) => {
    const _since = preciseSince(p, sinceMap);
    return { ...p, _since, _days: joursOuvres(_since), _moveDays: daysCal(p.maj) };
  });
  const dormant = all.filter((p) => p._moveDays > OBSOLETE_DAYS).length;
  const pts = all.filter((p) => p._moveDays <= OBSOLETE_DAYS); // dormants exclus
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

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Points bloquants — ${esc(today)}</title>
  <style>
    @page { size: A4; margin: 16mm 15mm; }
    *{box-sizing:border-box} html,body{margin:0}
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:${INK};font-size:11.5px;line-height:1.5}
    .hd{background:linear-gradient(135deg,${NAVY},${INDIGO});color:#fff;padding:26px 28px;border-bottom:4px solid ${GOLD}}
    .hd .brand{font-size:10px;letter-spacing:.22em;text-transform:uppercase;opacity:.8}
    .hd h1{margin:8px 0 0;font-family:Poppins,Inter,sans-serif;font-size:26px;letter-spacing:.3px}
    .hd .sub{opacity:.88;font-size:13px;margin-top:6px;text-transform:capitalize}
    .synth{display:flex;flex-wrap:wrap;gap:26px;padding:18px 28px;background:${SOFT};border-bottom:1px solid ${LINE}}
    .synth .s{font-size:10.5px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em}
    .synth .s b{display:block;font-family:Poppins,Inter,sans-serif;font-size:23px;line-height:1.05;margin-top:2px}
    .synth .s.tot b{color:${NAVY}} .synth .s.cri b{color:${RED}} .synth .s.maj b{color:${AMBER}} .synth .s.cli b{color:${INDIGO}}
    .note{padding:10px 28px;font-size:10.5px;color:${MUTED};background:#fff;border-bottom:1px solid ${LINE}}
    .wrap{padding:20px 28px 8px}
    section.cli{margin:0 0 22px;break-inside:avoid;page-break-inside:avoid}
    .cli-h{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,${NAVY},${INDIGO});color:#fff;border-radius:9px;padding:9px 14px;box-shadow:inset 0 -3px 0 rgba(168,136,78,.7)}
    .cli-h .cli-name{font-family:Poppins,Inter,sans-serif;font-size:15px;font-weight:700;letter-spacing:.3px}
    .cli-h .cli-c{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;opacity:.85}
    .intro{margin:9px 2px 10px;color:${MUTED};font-size:11px}
    table{width:100%;border-collapse:separate;border-spacing:0}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};padding:5px 9px;border-bottom:1.5px solid ${LINE}}
    td{padding:9px;border-bottom:1px solid ${LINE};vertical-align:top}
    td.sev{width:78px} td.cle{width:78px;font-family:ui-monospace,Menlo,monospace;font-weight:700;color:${GOLD};padding-top:11px}
    td.dev{width:118px;font-weight:600} td.since{width:104px;white-space:nowrap;color:${MUTED};font-size:10px;line-height:1.35}
    td.since b{color:${INK};font-size:11.5px} td.since .d{display:block;color:${MUTED};font-size:9.5px;margin-top:1px}
    .badge{display:inline-block;color:#fff;font-size:8px;font-weight:800;letter-spacing:.5px;padding:3px 7px;border-radius:5px}
    .eng{display:inline-block;margin-top:5px;font-size:7.5px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:5px}
    .eng-p{background:rgba(168,136,78,.16);color:#8a6d2f;border:1px solid ${GOLD}}
    .eng-t{background:rgba(75,63,143,.13);color:${INDIGO};border:1px solid ${INDIGO}}
    .res .t{font-weight:600;line-height:1.35} .res .why{font-size:10px;font-weight:600;margin-top:3px}
    .empty{color:${MUTED};padding:26px;text-align:center;font-size:13px}
    .ft{padding:10px 28px;color:${MUTED};font-size:9.5px;border-top:1px solid ${LINE}}
  </style></head><body>
  <div class="hd"><div class="brand">Armonie Group &middot; Portefeuille TMA &amp; Projets</div><h1>Points bloquants</h1><div class="sub">${esc(today)}${meName ? " — " + esc(meName) : ""}</div></div>
  <div class="synth">
    <div class="s tot"><b>${pts.length}</b>points actifs</div>
    <div class="s cri"><b>${crit}</b>critiques</div>
    <div class="s maj"><b>${pts.length - crit}</b>à surveiller</div>
    <div class="s cli"><b>${clients.length}</b>clients</div>
  </div>
  ${dormant ? `<div class="note">${dormant} ticket${dormant > 1 ? "s" : ""} dormant${dormant > 1 ? "s" : ""} (sans mouvement depuis plus de ${OBSOLETE_DAYS} jours, probablement obsolète${dormant > 1 ? "s" : ""}) exclu${dormant > 1 ? "s" : ""} de ce relevé.</div>` : ""}
  <div class="wrap">${body}</div>
  <div class="ft">cp|WIRE — données issues de Jira (statuts, drapeaux, historique). « Depuis » = entrée réelle dans l'état bloquant. PROJET / TMA = type d'engagement. Document de travail interne.</div>
  </body></html>`;

  return { name: "Points-bloquants.html", dossier: "Points bloquants", html, count: pts.length };
}
