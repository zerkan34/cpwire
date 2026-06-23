// blockersDoc.js — Document « Points bloquants » charté, organisé par client, ~2 pages.
// Inclus dans le ZIP du récap du jour. Chiffres et dates 100 % issus des données (jamais inventés).

import { computeBlockers } from "./blockers.js";

const NAVY = "#2E2A5D", INDIGO = "#4B3F8F", GOLD = "#A8884E", INK = "#1F1B33";
const MUTED = "#6E6A86", SOFT = "#F5F2FC", LINE = "#e7e5f1", RED = "#C0392B", AMBER = "#C2691A";

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmtD(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function joursOuvres(iso, now = new Date()) {
  if (!iso) return 0; const d = new Date(iso); if (isNaN(d)) return 0;
  let n = 0; const cur = new Date(d);
  while (cur < now) { cur.setDate(cur.getDate() + 1); const wd = cur.getDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}
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

// Petit texte factuel pour un client.
function clientIntro(list) {
  const c = list.filter((p) => p.severity === "critique").length;
  const m = list.length - c;
  const bits = [`${list.length} point${list.length > 1 ? "s" : ""} bloquant${list.length > 1 ? "s" : ""}`];
  if (c) bits.push(`${c} critique${c > 1 ? "s" : ""}`);
  if (m) bits.push(`${m} à surveiller`);
  let txt = bits.join(" · ");
  const oldest = list.slice().sort((a, b) => b._days - a._days)[0];
  if (oldest && oldest._since) txt += `. Le plus ancien : ${oldest.id}, ${sinceLabel(oldest.kind)} ${fmtD(oldest._since)} (${oldest._days} j ouvrés).`;
  return txt;
}

export function buildBlockersDoc(issues = [], { meName = "", sinceMap = {} } = {}) {
  const pts = computeBlockers(issues).map((p) => { const _since = preciseSince(p, sinceMap); return { ...p, _since, _days: joursOuvres(_since) }; });
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
        <td class="sev"><span class="badge" style="background:${col}">${tag}</span></td>
        <td class="cle">${esc(p.id)}</td>
        <td class="res"><div class="t">${esc(p.title || "")}</div><div class="why" style="color:${col}">${esc(p.reason || "")}</div></td>
        <td class="dev">${esc(p.assignee || "Non assigné")}</td>
        <td class="since"><b>${fmtD(p._since)}</b><div class="d">${sinceLabel(p.kind)} · ${p._days} j</div></td>
      </tr>`;
    }).join("");
    return `<section class="cli">
      <h2>${esc(c)}</h2>
      <p class="intro">${esc(clientIntro(list))}</p>
      <table><thead><tr><th>Gravité</th><th>Ticket</th><th>Sujet &amp; raison</th><th>Développeur</th><th>Depuis</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }).join("");

  const body = pts.length
    ? sections
    : `<section class="cli"><p class="empty">Aucun point bloquant à signaler. Tous les voyants sont au vert.</p></section>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Points bloquants — ${esc(today)}</title>
  <style>
    @page { size: A4; margin: 14mm 14mm; }
    *{box-sizing:border-box} html,body{margin:0}
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:${INK};font-size:11.5px;line-height:1.45}
    .hd{background:linear-gradient(135deg,${NAVY},${INDIGO});color:#fff;padding:18px 22px;border-bottom:3px solid ${GOLD}}
    .hd h1{margin:0;font-family:Poppins,Inter,sans-serif;font-size:20px;letter-spacing:.2px}
    .hd .sub{opacity:.85;font-size:12px;margin-top:3px;text-transform:capitalize}
    .synth{display:flex;flex-wrap:wrap;gap:18px;padding:12px 22px;background:${SOFT};border-bottom:1px solid ${LINE}}
    .synth .s{font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:.05em}
    .synth .s b{display:block;font-family:Poppins,Inter,sans-serif;font-size:19px;line-height:1.1;margin-top:1px}
    .synth .s.tot b{color:${NAVY}} .synth .s.cri b{color:${RED}} .synth .s.maj b{color:${AMBER}} .synth .s.cli b{color:${INDIGO}}
    .wrap{padding:14px 22px}
    section.cli{margin:0 0 14px;break-inside:avoid;page-break-inside:avoid}
    section.cli h2{font-family:Poppins,Inter,sans-serif;color:${NAVY};font-size:14px;margin:0 0 3px;border-left:3px solid ${GOLD};padding-left:8px}
    .intro{margin:0 0 7px;color:${MUTED};font-size:11px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${MUTED};padding:4px 7px;border-bottom:1.5px solid ${LINE}}
    td{padding:6px 7px;border-bottom:1px solid ${LINE};vertical-align:top}
    td.sev{width:64px} td.cle{width:74px;font-family:ui-monospace,Menlo,monospace;font-weight:700;color:${GOLD}}
    td.dev{width:120px;font-weight:600} td.since{width:96px;white-space:nowrap}
    td.since .d{font-size:9.5px;color:${MUTED};margin-top:1px}
    .badge{display:inline-block;color:#fff;font-size:8px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:4px}
    .res .t{font-weight:600} .res .why{font-size:10px;font-weight:600;margin-top:1px}
    .empty{color:${MUTED};padding:20px;text-align:center;font-size:13px}
    .ft{padding:8px 22px;color:${MUTED};font-size:9.5px;border-top:1px solid ${LINE}}
  </style></head><body>
  <div class="hd"><h1>Points bloquants</h1><div class="sub">${esc(today)}${meName ? " — " + esc(meName) : ""}</div></div>
  <div class="synth">
    <div class="s tot"><b>${pts.length}</b>points</div>
    <div class="s cri"><b>${crit}</b>critiques</div>
    <div class="s maj"><b>${pts.length - crit}</b>à surveiller</div>
    <div class="s cli"><b>${clients.length}</b>clients</div>
  </div>
  <div class="wrap">${body}</div>
  <div class="ft">cp|WIRE — données issues de Jira (statuts, drapeaux, historique). Dates = entrée réelle dans l'état bloquant. Document de travail interne.</div>
  </body></html>`;

  return { name: "Points-bloquants.html", dossier: "Points bloquants", html, count: pts.length };
}
