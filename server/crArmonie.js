// crArmonie.js — CR de dossier À LA CHARTE ARMONIE (HTML → WeasyPrint).
// -----------------------------------------------------------------------------
// Reprend le langage visuel figé du skill armonie-design (couverture à barre
// dégradée, kicker doré, tableaux à entête navy et coins arrondis, encart « en
// bref » lavande, pied de garde signataires) et le remplit avec les VRAIS chiffres
// du cockpit pour un dossier donné. Règle sacrée : zéro invention — toute valeur
// vient des données Jira/cp|WIRE ; en l'absence de source, « — ».
//
// Sortie : une chaîne HTML autonome, prête pour /api/pdf/render (WeasyPrint).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARMONIE_PALETTE as P } from "../shared/armonie-palette.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(HERE, "pdf", "fonts");

// Palette : source unique (shared/armonie-palette.js). Elle était recopiée ici, et
// portait donc encore l'ancienne charte navy/indigo/or après sa mise à jour.
const C = {
  navy: P.navy, indigo: P.indigo, gold: P.gold, goldLt: P.gold2,
  lav: P.soft, ink: P.ink, grey: P.muted, line: P.line,
  green: P.green, orange: P.amber,
};

let _fontCss = null;
function fontFaces() {
  if (_fontCss != null) return _fontCss;
  const face = (file, family, weight) => {
    try {
      const b = fs.readFileSync(path.join(FONTS, file));
      return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${b.toString("base64")}) format('truetype');}`;
    } catch { return ""; }
  };
  _fontCss = [
    face("Poppins-Regular.ttf", "Poppins", 400),
    face("Poppins-Medium.ttf", "Poppins", 600),
    face("Poppins-Bold.ttf", "Poppins", 800),
  ].join("\n");
  return _fontCss;
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const N = (v) => (v == null || v === "" ? "—" : v);

// Logo typographique (jamais une image) : « armo[n doré]ie » sur fond clair.
function logo() {
  return `<span style="font-family:'Poppins';font-weight:800;font-size:15px;color:${C.navy};letter-spacing:.01em;">armo<span style="color:${C.gold};">n</span>ie</span>`;
}

function coverEnBref(data) {
  const rows = [
    ["Tickets suivis", N(data.kpis.suivis)],
    ["Terminés", data.kpis.termines != null ? `${data.kpis.termines}${data.kpis.tauxTermine != null ? ` · ${data.kpis.tauxTermine} %` : ""}` : "—"],
    ["En cours", N(data.kpis.encours)],
    ["Points d'attention", String((data.sla.over.length + data.attention.figes.length + data.attention.incoherences.reduce((s, x) => s + x.items.length, 0)) || "aucun")],
  ];
  return `<div class="enbref">
    <div class="enbref-t">En bref</div>
    <table class="enbref-tb">${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join("")}</table>
  </div>`;
}

function secHead(kicker, titre, sous) {
  return `<div class="sec"><span class="sqr"></span><span class="kick">${esc(kicker)}</span>
    <div class="sec-t">${esc(titre)}</div>${sous ? `<div class="sec-s">${esc(sous)}</div>` : ""}</div>`;
}

function tableCats(cats) {
  if (!cats.length) return `<p class="muted">Aucune donnée de répartition disponible.</p>`;
  const body = cats.map((c, i) => `<tr class="${i % 2 ? "alt" : ""}"><td>${esc(c.label)}</td><td class="num">${c.n}</td></tr>`).join("");
  const total = cats.reduce((s, c) => s + c.n, 0);
  return `<table class="dt"><thead><tr><th>Catégorie</th><th class="num">Tickets</th></tr></thead>
    <tbody>${body}<tr class="tot"><td>Total suivi</td><td class="num">${total}</td></tr></tbody></table>`;
}

function listAttention(data) {
  const parts = [];
  if (data.sla.over.length) {
    parts.push(`<div class="blk"><div class="blk-h">SLA (résolution) dépassé — ${data.sla.over.length}</div><ul class="ul">${
      data.sla.over.slice(0, 10).map((a) => `<li><b>${esc(a.cle)}</b> — ${esc(a.resume || "")} <span class="tag tag-r">+${Math.round(a.depassementH || 0)} h</span></li>`).join("")}</ul></div>`);
  }
  if (data.sla.gtiOver && data.sla.gtiOver.length) {
    parts.push(`<div class="blk"><div class="blk-h">Prise en charge (GTI) dépassée — ${data.sla.gtiOver.length}</div><ul class="ul">${
      data.sla.gtiOver.slice(0, 8).map((a) => `<li><b>${esc(a.cle)}</b> — ${esc(a.resume || "")}</li>`).join("")}</ul></div>`);
  }
  if (data.attention.figes.length) {
    parts.push(`<div class="blk"><div class="blk-h">Tickets figés (≥ 30 j) — ${data.attention.figes.length}</div><ul class="ul">${
      data.attention.figes.slice(0, 10).map((f) => `<li><b>${esc(f.cle)}</b> — ${esc(f.resume || "")} <span class="tag">${f.jours} j</span></li>`).join("")}</ul></div>`);
  }
  for (const ic of data.attention.incoherences) {
    if (!ic.items.length) continue;
    parts.push(`<div class="blk"><div class="blk-h">${esc(ic.label)} — ${ic.items.length}</div><ul class="ul">${
      ic.items.slice(0, 10).map((it) => `<li><b>${esc(it.cle || "—")}</b> — ${esc(it.detail || "")}</li>`).join("")}</ul></div>`);
  }
  if (!parts.length) return `<div class="esc"><div class="esc-l">Aucun point d'attention</div>Aucune régression, aucun dépassement, aucun ticket figé sur ce dossier à date. Situation saine.</div>`;
  return parts.join("");
}

function listEcheances(ech) {
  if (!ech.length) return `<p class="muted">Aucune échéance datée à ce jour.</p>`;
  return `<div class="tl">${ech.slice(0, 12).map((e) => {
    const col = e.statut === "retard" ? C.orange : C.gold;
    const j = e.jours == null ? "—" : e.jours < 0 ? `en retard de ${-e.jours} j` : e.jours === 0 ? "aujourd'hui" : `dans ${e.jours} j`;
    return `<div class="tl-i"><span class="tl-d" style="color:${col}">${esc(j)}</span><span class="tl-m" style="background:${col}"></span><span class="tl-l">${esc(e.label)}</span></div>`;
  }).join("")}</div>`;
}

function riskBlock(risk) {
  if (!risk) return "";
  const col = risk.niveau === "critique" ? C.orange : risk.niveau === "élevé" ? C.gold : C.green;
  const fact = risk.facteurs && risk.facteurs.length
    ? `<ul class="ul">${risk.facteurs.map((f) => `<li>${f.n} ${esc(f.label)}${f.detail ? ` <span class="muted">(${esc(f.detail)})</span>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted">Aucun facteur de risque actif.</p>`;
  return `<div class="risk"><div class="risk-badge" style="background:${col}">${risk.score}<small>/100</small></div>
    <div class="risk-b"><div class="risk-n">Niveau ${esc(risk.niveau)}</div>${fact}</div></div>`;
}

// Camembert 3D SANS couture blanche — portage fidèle du helper donut() du skill
// armonie-design (même géométrie : rx62/ry27/depth22, flancs, ombre radiale, rim).
// Généralisé à N segments. segs = [{label, v, top, side, lc}].
function donut3d(segs, totalLabel) {
  const tot = segs.reduce((s, x) => s + x.v, 0) || 1;
  const rx = 62, ry = 27, depth = 22, cx = 74, cy = 44;
  const P = (deg) => { const r = (deg * Math.PI) / 180; return [cx + rx * Math.cos(r), cy + ry * Math.sin(r)]; };
  let a = 0; const rng = [];
  for (const s of segs) { const sw = 360 * s.v / tot; rng.push({ a0: a, a1: a + sw, ...s }); a += sw; }
  const side = [];
  for (const r of rng) {
    const s0 = Math.max(r.a0, 0), e0 = Math.min(r.a1, 180);
    if (e0 > s0) {
      const [x0, y0] = P(s0), [x1, y1] = P(e0); const lg = (e0 - s0) > 180 ? 1 : 0;
      side.push(`<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${rx} ${ry} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x1.toFixed(2)} ${(y1 + depth).toFixed(2)} A${rx} ${ry} 0 ${lg} 0 ${x0.toFixed(2)} ${(y0 + depth).toFixed(2)} Z" fill="${r.side}" stroke="${r.side}" stroke-width="1"/>`);
    }
  }
  const top = [], lab = [];
  for (const r of rng) {
    const [x0, y0] = P(r.a0), [x1, y1] = P(r.a1); const lg = (r.a1 - r.a0) > 180 ? 1 : 0;
    top.push(`<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${rx} ${ry} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${r.top}" stroke="${r.top}" stroke-width="1.3" stroke-linejoin="round"/>`);
    const m = ((r.a0 + r.a1) / 2) * Math.PI / 180; const lx = cx + rx * 0.52 * Math.cos(m), ly = cy + ry * 0.52 * Math.sin(m);
    const pct = Math.round(r.v / tot * 100);
    if (pct >= 6) lab.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${r.lc}" font-family="Poppins,sans-serif" font-weight="800" font-size="12" text-anchor="middle" dominant-baseline="central">${pct}%</text>`);
  }
  const uid = Math.random().toString(36).slice(2, 7);
  const defs = `<defs><radialGradient id="sh${uid}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#15122B" stop-opacity="0.40"/><stop offset="48%" stop-color="#15122B" stop-opacity="0.20"/><stop offset="100%" stop-color="#15122B" stop-opacity="0"/></radialGradient></defs>`;
  const shadow = `<ellipse cx="${cx}" cy="${(cy + ry + depth + 2).toFixed(1)}" rx="${(rx * 1.12).toFixed(1)}" ry="9" fill="url(#sh${uid})"/>`;
  const [rx0, ry0] = P(0), [rx1, ry1] = P(180);
  const rim = `<path d="M${rx0.toFixed(2)} ${ry0.toFixed(2)} A${rx} ${ry} 0 0 1 ${rx1.toFixed(2)} ${ry1.toFixed(2)}" fill="none" stroke="#000000" stroke-opacity="0.13" stroke-width="0.8"/>`;
  const svg = `<svg viewBox="0 6 150 106" width="150" height="106" xmlns="http://www.w3.org/2000/svg">${defs}${shadow}${side.join("")}${top.join("")}${rim}${lab.join("")}</svg>`;
  const legend = segs.map((s) => `<tr><td class="lc"><span class="sw" style="background:${s.top}"></span>${esc(s.label)}</td><td class="lv">${s.v}</td><td class="lp">${Math.round(s.v / tot * 100)}&nbsp;%</td></tr>`).join("");
  return `<div class="donut">${svg}<div class="ptot">${esc(totalLabel || (tot + " tickets"))}</div><table class="leg">${legend}</table></div>`;
}

// Frise verticale (pilule lavande, filet doré ; pivot navy) — helper flow() du skill.
function flowFrise(nodes) {
  const out = ['<div class="flow">'];
  nodes.forEach((n, i) => { if (i > 0) out.push('<div class="cn"></div>'); out.push(`<div class="nd${n.key ? " key" : ""}">${esc(n.label)}</div>`); });
  out.push("</div>");
  return out.join("");
}

export function buildDossierCrHtml(data) {
  const d = data.date || new Date().toISOString().slice(0, 10);
  const kp = data.kpis || {};
  const term = kp.termines || 0, enc = kp.encours || 0, suiv = kp.suivis || 0;
  const reste = Math.max(0, suiv - term - enc);
  const donutSegs = [
    { label: "Terminé / mis en prod", v: term, top: C.goldLt, side: "#8A6E37", lc: C.navy },
    { label: "En cours", v: enc, top: C.indigo, side: "#322A63", lc: "#fff" },
    { label: "À faire / en attente", v: reste, top: C.navy, side: "#231F4A", lc: "#fff" },
  ].filter((s) => s.v > 0);
  const donutHtml = donutSegs.length ? donut3d(donutSegs, `${suiv} tickets suivis`) : "";
  const idType = (data.type || "CR").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const docId = `ARMONIE-${(data.client || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}-${idType}-${d.replace(/-/g, "-")} · Confidentiel`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${fontFaces()}
@page{size:A4;margin:16mm 15mm 18mm;
  @bottom-center{content:"Armonie Group · Confidentiel";font-family:'Inter',sans-serif;font-size:8pt;color:${C.grey};}
  @bottom-right{content:"" counter(page) " / " counter(pages);font-family:'Inter',sans-serif;font-size:8pt;color:${C.grey};}}
@page:first{margin:0;@bottom-center{content:none;}@bottom-right{content:none;}}
*{box-sizing:border-box;}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;color:${C.ink};font-size:10.5pt;line-height:1.5;margin:0;}
h1,h2,h3,.pf,.sec-t,.enbref-t{font-family:'Poppins',sans-serif;}
.muted{color:${C.grey};font-size:9.5pt;}
/* ---- Couverture ---- */
.cover{position:relative;height:297mm;padding:0 22mm;}
.bar{position:absolute;top:0;left:0;right:0;height:4mm;background:linear-gradient(90deg,${C.navy},${C.indigo} 55%,${C.gold});}
.cv-top{display:flex;justify-content:space-between;align-items:center;padding-top:26mm;}
.cv-kick{font-family:'Inter';font-weight:700;font-size:9pt;letter-spacing:.22em;text-transform:uppercase;color:${C.gold};}
.cv-mid{margin-top:70mm;text-align:center;}
.cv-eyebrow{font-family:'Inter';font-weight:700;font-size:9.5pt;letter-spacing:.2em;text-transform:uppercase;color:${C.gold};}
.cv-title{font-family:'Poppins';font-weight:800;font-size:27pt;color:${C.navy};margin:6mm 0 0;line-height:1.15;}
.cv-rule{width:96px;height:4px;background:${C.gold};margin:7mm auto 0;border-radius:2px;}
.cv-sub{color:${C.grey};font-size:11pt;margin-top:5mm;}
.pill{display:inline-block;margin-top:8mm;border:1px solid ${C.gold};color:${C.gold};font-weight:700;font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;border-radius:99px;padding:4px 16px;}
.enbref{margin:12mm auto 0;max-width:120mm;background:${C.lav};border-left:3px solid ${C.gold};border-radius:10px;padding:6mm 8mm;text-align:left;}
.enbref-t{font-family:'Poppins';font-weight:800;font-size:11pt;color:${C.navy};margin-bottom:3mm;}
.enbref-tb{width:100%;border-collapse:collapse;}
.enbref-tb td{padding:2.2mm 0;font-size:10pt;border-bottom:1px solid #E7E2F2;}
.enbref-tb td.k{color:${C.grey};}
.enbref-tb td.v{text-align:right;font-family:'Poppins';font-weight:600;color:${C.navy};}
.cv-foot{position:absolute;bottom:22mm;left:22mm;right:22mm;text-align:center;color:${C.grey};font-size:9pt;}
.cv-foot b{color:${C.ink};font-family:'Poppins';font-weight:600;}
.cv-id{position:absolute;bottom:12mm;left:0;right:0;text-align:center;color:${C.grey};font-size:7.5pt;letter-spacing:.04em;}
/* ---- Sections ---- */
.sec{margin:9mm 0 4mm;}
.sec .sqr{display:inline-block;width:9px;height:9px;background:${C.gold};border-radius:2px;vertical-align:middle;}
.sec .kick{font-family:'Inter';font-weight:700;font-size:8.5pt;letter-spacing:.18em;text-transform:uppercase;color:${C.gold};margin-left:7px;vertical-align:middle;}
.sec-t{font-size:15pt;font-weight:800;color:${C.navy};margin-top:2mm;}
.sec-s{color:${C.grey};font-size:9.5pt;margin-top:1mm;}
/* tableaux */
.dt{width:100%;border-collapse:separate;border-spacing:0;border:1px solid ${C.line};border-radius:12px;overflow:hidden;margin-top:2mm;}
.dt thead th{background:${C.navy};color:#fff;font-family:'Poppins';font-weight:600;font-size:9.5pt;text-align:left;padding:8px 14px;}
.dt th.num,.dt td.num{text-align:right;}
.dt tbody td{padding:8px 14px;font-size:10pt;border-top:1px solid ${C.line};}
.dt tbody tr.alt td{background:${C.lav};}
.dt tbody tr.tot td{background:#EDE9F8;font-family:'Poppins';font-weight:700;color:${C.navy};}
/* blocs attention */
.blk{margin-top:4mm;}
.blk-h{font-family:'Poppins';font-weight:600;font-size:10.5pt;color:${C.navy};margin-bottom:1.5mm;}
.ul{margin:0;padding-left:5mm;}
.ul li{font-size:10pt;margin:1.2mm 0;}
.tag{display:inline-block;font-size:8pt;font-weight:700;color:${C.grey};background:${C.lav};border-radius:6px;padding:1px 7px;margin-left:4px;}
.tag-r{color:#fff;background:${C.orange};}
.esc{background:${C.lav};border-left:3px solid ${C.gold};border-radius:8px;padding:4mm 6mm;margin-top:3mm;font-size:10pt;}
.esc-l{font-family:'Poppins';font-weight:700;color:${C.gold};font-size:9pt;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1.5mm;}
/* frise */
.tl{margin-top:2mm;}
.tl-i{display:flex;align-items:center;gap:9px;padding:2mm 0;border-bottom:1px solid ${C.line};}
.tl-d{font-family:'Poppins';font-weight:700;font-size:9pt;width:38mm;}
.tl-m{width:9px;height:9px;border-radius:50%;flex:none;}
.tl-l{font-size:10pt;}
/* risque */
.risk{display:flex;gap:6mm;align-items:flex-start;margin-top:3mm;}
.risk-badge{color:#fff;font-family:'Poppins';font-weight:800;font-size:20pt;border-radius:12px;padding:4mm 6mm;min-width:26mm;text-align:center;}
.risk-badge small{font-size:9pt;font-weight:600;opacity:.85;}
.risk-n{font-family:'Poppins';font-weight:700;color:${C.navy};font-size:11pt;text-transform:capitalize;margin-bottom:1mm;}
.note{margin-top:9mm;border-top:1px solid ${C.line};padding-top:3mm;color:${C.grey};font-size:8.5pt;font-style:italic;}
/* donut 3D + légende (charte) */
.syn{display:flex;gap:9mm;align-items:center;margin-top:2mm;}
.syn-l{flex:none;} .syn-r{flex:1 1 auto;}
.donut{text-align:center;}
.donut svg{display:inline-block;}
.ptot{font-family:'Poppins';font-weight:600;font-size:8pt;color:${C.grey};margin-top:3px;}
.leg{margin:9px auto 0;font-size:9.2pt;color:${C.ink};border-collapse:collapse;}
.leg td{padding:3px 0;}
.leg .lc{font-weight:600;padding-right:16px;white-space:nowrap;}
.leg .lv{font-weight:700;color:${C.navy};text-align:right;padding-right:12px;font-family:'Poppins';}
.leg .lp{color:${C.grey};text-align:right;white-space:nowrap;}
.leg .sw{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:7px;vertical-align:-1px;}
/* frise verticale (charte) */
.flow{text-align:center;max-width:82mm;margin:2mm auto 0;}
.nd{display:block;background:${C.lav};border:1px solid ${C.line};border-left:3px solid ${C.gold};border-radius:10px;padding:5px 12px;font-family:'Poppins';font-weight:600;font-size:9.5pt;color:${C.navy};}
.nd.key{background:${C.navy};color:#fff;border-left-color:${C.goldLt};}
.cn{height:11px;position:relative;}
.cn::before{content:"";position:absolute;left:50%;top:0;width:2px;height:5px;background:${C.goldLt};margin-left:-1px;}
.cn::after{content:"";position:absolute;left:50%;top:4px;margin-left:-4px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${C.gold};}
</style></head><body>

<section class="cover">
  <div class="bar"></div>
  <div class="cv-top">${logo()}<span class="cv-kick">${esc(data.client || "")} · ${esc(data.typeLabel || data.type || "Compte rendu")}</span></div>
  <div class="cv-mid">
    <div class="cv-eyebrow">${esc(data.typeLabel || "Compte rendu")}</div>
    <h1 class="cv-title">${esc(data.titre || `${data.typeLabel || "Compte rendu"} — ${data.client || ""}`)}</h1>
    <div class="cv-rule"></div>
    <div class="cv-sub">Situation au ${esc(d)} · établi à partir des données Jira du portefeuille.</div>
    <span class="pill">Document de travail</span>
    ${coverEnBref(data)}
  </div>
  <div class="cv-foot"><b>Établi par Nicolas Durand — Chef de projet (MOE)</b><br>Armonie Group · ${esc(data.client || "")}</div>
  <div class="cv-id">${esc(docId)}</div>
</section>

<section>
  ${secHead("Synthèse", "Avancement du portefeuille", `Répartition des tickets suivis pour ${data.client || "le dossier"}.`)}
  <div class="syn">
    ${donutHtml ? `<div class="syn-l">${donutHtml}</div>` : ""}
    <div class="syn-r">${tableCats(data.categories)}</div>
  </div>
</section>

${data.cycle && data.cycle.length ? `<section>${secHead("Flux", "Cycle des tickets", "Où se concentre le portefeuille dans le cycle de traitement.")}${flowFrise(data.cycle)}</section>` : ""}

<section>
  ${secHead("Vigilance", "Points d'attention", "Ce qui appelle une décision ou un suivi rapproché.")}
  ${listAttention(data)}
</section>

${data.risk ? `<section>${secHead("Indicateur", "Score de risque du dossier", "Condensé des signaux, tracé à des faits réels.")}${riskBlock(data.risk)}</section>` : ""}

<section>
  ${secHead("Calendrier", "Échéances", "Ce qui a une date, en retard ou à venir.")}
  ${listEcheances(data.echeances)}
</section>

<div class="note">Document de travail généré par cp|WIRE le ${esc(d)} à partir des données Jira. Chaque chiffre est tracé à sa source ; en l'absence de donnée, la mention « — » est utilisée. Aucune valeur n'est estimée.</div>

</body></html>`;
}
