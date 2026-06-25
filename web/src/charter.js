// ============================================================================
//  charter.js — CHARTE GRAPHIQUE UNIQUE pour TOUS les exports PDF de cp|WIRE.
//  Calquée sur le document de référence « Points bloquants » :
//   couverture (lockup logo · sur-titre espacé · titre géant Poppins · pastille ·
//   EN BREF · gros chiffre en exergue · ÉTABLI PAR · pied confidentiel),
//   bandeaux capitales espacées, bandeau KPI, sections par dossier, tableau,
//   pied de page courant. Navy / indigo / or.
//  Tout export DOIT passer par charterDoc() pour rester identique partout.
// ============================================================================

export const C = { navy: "#2E2A5D", indigo: "#4B3F8F", gold: "#A8884E", ink: "#1F1B33", muted: "#6E6A86", soft: "#F5F2FC", line: "#E7E5F1", red: "#C0392B", amber: "#C2691A" };

// Trame « papier vergé » très subtile (fines vergeures verticales + chaînettes
// horizontales espacées), mélangée au blanc. À poser sur toute surface blanche.
export const VERGE = "repeating-linear-gradient(90deg, rgba(46,42,93,.020) 0, rgba(46,42,93,.020) .6px, transparent .6px, transparent 4px), repeating-linear-gradient(0deg, rgba(46,42,93,.011) 0, rgba(46,42,93,.011) .6px, transparent .6px, transparent 26px)";

export function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Lockup logo « armo·n·ie / notos phl·soft » (texte fidèle : le « n » et « phl » en or).
export function logoLockup({ light = false } = {}) {
  const main = light ? "#fff" : C.navy;
  const sub = light ? "rgba(255,255,255,.85)" : C.navy;
  const gold = light ? "#E9D9A8" : C.gold;
  return `<div class="ch-logo">`
    + `<span class="ch-logo-main" style="color:${main}">armo<span style="color:${gold}">n</span>ie</span>`
    + `<span class="ch-logo-sub" style="color:${sub}">notos <span style="color:${gold}">phl</span>soft</span></div>`;
}

// Bandeau « capitales espacées » — la signature typographique.
export function eyebrow(text) { return `<div class="ch-eyebrow">${esc(text)}</div>`; }

// Bandeau KPI : grands nombres + petits libellés capitales.
export function kpiBand(items) {
  return `<div class="ch-kpi">` + items.map((k) => `<div class="ch-kpi-i ${k.tone || ""}"><b>${esc(String(k.value))}</b><span>${esc(k.label)}</span></div>`).join("") + `</div>`;
}

// Page de couverture pleine.
//  title peut contenir un <br> ; callout = { value, label, hint } (gros chiffre).
export function cover({ kicker, title, subtitle = "", meta = "", pill = "", enBref = "", callout = null, etabliPar = "", confidential = "Armonie Group · Confidentiel", web = "armonie.group" }) {
  return `<section class="ch-cover">
    <div class="ch-cover-top">${logoLockup({ light: false })}<div class="ch-kicker">${esc(kicker || "")}</div></div>
    <div class="ch-cover-mid">
      <h1 class="ch-cover-title">${title}</h1>
      ${subtitle ? `<div class="ch-cover-sub">${esc(subtitle)}</div>` : ""}
      ${meta ? `<div class="ch-cover-meta">${esc(meta)}</div>` : ""}
      <div class="ch-cover-rule"></div>
      ${pill ? `<span class="ch-pill">${esc(pill)}</span>` : ""}
      <div class="ch-cover-cols">
        ${enBref ? `<div class="ch-enbref"><div class="ch-enbref-l">En bref</div><p>${enBref}</p></div>` : ""}
        ${callout ? `<div class="ch-callout"><b>${esc(String(callout.value))}</b><span class="ch-callout-l">${esc(callout.label)}</span>${callout.hint ? `<span class="ch-callout-h">${esc(callout.hint)}</span>` : ""}</div>` : ""}
      </div>
      <div class="ch-estab">${etabliPar ? `<span class="ch-estab-l">Établi par</span><span class="ch-estab-n">${esc(etabliPar)}</span><span class="ch-estab-r">Chef de projet (MOE) — Armonie Group</span>` : ""}</div>
    </div>
    <div class="ch-cover-foot">
      <div class="ch-cover-legal"><span>${esc(confidential)}</span><span>${esc(web)}</span></div>
    </div>
  </section>`;
}

// Section « par dossier » : sur-titre espacé + nom client en grand + contenu.
export function section({ over, name, intro = "", inner = "" }) {
  return `<section class="ch-sec">
    ${over ? eyebrow(over) : ""}
    <h2 class="ch-sec-name">${esc(name)}</h2>
    ${intro ? `<p class="ch-sec-intro">${intro}</p>` : ""}
    ${inner}
  </section>`;
}

// Bloc « titre de chapitre » (Synthèse, etc.) : sur-titre + titre.
export function chapter({ over, title, lead = "" }) {
  return `<div class="ch-chap">${eyebrow(over)}<h2 class="ch-chap-t">${esc(title)}</h2>${lead ? `<p class="ch-lead">${lead}</p>` : ""}</div>`;
}

// Le CSS commun. Médium = impression navigateur → pied courant via position:fixed
// (répété sur chaque page ; la numérotation n/total exige un rendu serveur).
export function charterCss() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
  @page { size: A4 portrait; margin: 16mm 15mm 18mm; }
  *{box-sizing:border-box} html,body{margin:0}
  body{font-family:Inter,Segoe UI,Arial,sans-serif;color:${C.ink};font-size:11.5px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;background-color:#fff;background-image:${VERGE}}
  h1,h2,h3,.ch-cover-title,.ch-sec-name,.ch-chap-t,.ch-kpi-i b,.ch-callout b,.ch-logo-main{font-family:Poppins,Inter,sans-serif}

  /* Signature : sur-titre capitales espacées */
  .ch-eyebrow{font-size:9.5px;letter-spacing:.28em;text-transform:uppercase;color:${C.gold};font-weight:700;margin-bottom:8px}

  /* Lockup logo */
  .ch-logo{display:flex;flex-direction:column;line-height:1}
  .ch-logo-main{font-size:21px;font-weight:800;letter-spacing:.5px}
  .ch-logo-sub{font-size:8px;letter-spacing:.18em;text-transform:uppercase;margin-top:3px}

  /* ---------- COUVERTURE (fond blanc, éléments centrés) ---------- */
  .ch-cover{position:relative;min-height:255mm;display:flex;flex-direction:column;
    background:#fff;background-image:${VERGE};color:${C.ink};
    margin:0;padding:16mm 12mm 14mm;page-break-after:always}
  .ch-cover::before{content:"";position:absolute;top:0;left:0;right:0;height:5mm;
    background:linear-gradient(90deg,${C.navy},${C.indigo} 55%,${C.gold})}
  .ch-cover-top{display:flex;justify-content:space-between;align-items:flex-start}
  .ch-kicker{font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;color:${C.gold};font-weight:700;text-align:right;max-width:60mm}
  .ch-cover-mid{margin:auto 0;text-align:center}
  .ch-cover-title{font-size:54px;font-weight:800;letter-spacing:.5px;margin:0;line-height:1.02;color:${C.navy}}
  .ch-cover-sub{font-size:15px;color:${C.muted};margin-top:26px;font-weight:500}
  .ch-cover-meta{font-size:12.5px;color:${C.muted};margin-top:7px;text-transform:capitalize}
  .ch-cover-rule{width:96px;height:4px;background:${C.gold};border-radius:3px;margin:26px auto}
  .ch-pill{display:inline-block;border:1px solid ${C.gold};color:${C.gold};font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;padding:6px 13px;border-radius:20px}
  .ch-cover-cols{display:flex;gap:24px;margin:28px auto 0;align-items:stretch;justify-content:center;max-width:150mm;text-align:left}
  .ch-enbref{flex:1;background:${C.soft};border-left:3px solid ${C.gold};border-radius:0 8px 8px 0;padding:16px 20px}
  .ch-enbref-l{font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:${C.indigo};font-weight:700}
  .ch-enbref p{margin:8px 0 0;font-size:12px;line-height:1.6;color:${C.ink}}
  .ch-callout{width:52mm;background:${C.navy};border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;justify-content:center}
  .ch-callout b{font-size:46px;font-weight:800;line-height:.95;color:#fff}
  .ch-callout-l{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.gold};font-weight:700;margin-top:4px}
  .ch-callout-h{font-size:10px;color:rgba(255,255,255,.82);margin-top:6px;line-height:1.4}
  /* « Établi par » remonté dans le bloc central (plus collé au bas de page) */
  .ch-estab{margin-top:34px;text-align:center}
  .ch-estab-l{display:block;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:${C.gold};font-weight:700;margin-bottom:5px}
  .ch-estab-n{display:block;font-size:13px;font-weight:600;color:${C.navy}}
  .ch-estab-r{display:block;font-size:10.5px;color:${C.muted};margin-top:2px}
  .ch-cover-foot{margin-top:auto;padding-top:18px}
  .ch-cover-legal{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted}}

  /* ---------- CHAPITRE / SYNTHÈSE ---------- */
  .ch-chap{margin:34px 0 14px}
  .ch-chap-t{font-size:20px;color:${C.navy};margin:0;font-weight:700}
  .ch-lead{color:${C.muted};font-size:11.5px;margin:8px 0 18px;line-height:1.6}

  /* Bandeau KPI */
  .ch-kpi{display:flex;flex-wrap:wrap;gap:30px;padding:16px 4px 16px;border-top:2px solid ${C.gold};border-bottom:1px solid ${C.line};margin:0 0 16px}
  .ch-kpi-i{font-size:9.5px;color:${C.muted};text-transform:uppercase;letter-spacing:.08em;font-weight:600}
  .ch-kpi-i b{display:block;font-size:30px;font-weight:800;line-height:1;margin-bottom:4px;color:${C.navy}}
  .ch-kpi-i.cri b{color:${C.red}} .ch-kpi-i.maj b{color:${C.amber}} .ch-kpi-i.idg b{color:${C.indigo}}

  /* Légende */
  .ch-legend{background:${C.soft};border:1px solid ${C.line};border-radius:9px;padding:12px 16px;margin:0 0 18px}
  .ch-legend .lt{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.indigo};font-weight:700;margin-bottom:7px}
  .ch-legend .row{display:flex;gap:9px;align-items:baseline;font-size:10.5px;color:${C.ink};margin:4px 0}
  .ch-legend .k{display:inline-block;min-width:64px;font-weight:800;font-size:8px;letter-spacing:.5px;color:#fff;padding:3px 7px;border-radius:5px;text-align:center}
  .ch-legend .k.c{background:${C.red}} .ch-legend .k.m{background:${C.amber}} .ch-legend .k.d{background:${C.indigo}}

  /* ---------- SECTION DOSSIER ---------- */
  .ch-sec{margin:30px 0 24px;break-inside:avoid;page-break-inside:avoid}
  .ch-sec-name{font-size:22px;color:${C.navy};margin:0;font-weight:700;letter-spacing:.2px}
  .ch-sec-intro{margin:9px 0 14px;color:${C.muted};font-size:11px}

  /* Tableaux */
  table{width:100%;border-collapse:separate;border-spacing:0}
  thead{display:table-header-group}
  th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};padding:6px 9px;border-bottom:1.5px solid ${C.gold}}
  td{padding:10px 9px;border-bottom:1px solid ${C.line};vertical-align:top}
  tr{break-inside:avoid}

  /* Pied de page courant (répété à chaque page imprimée) */
  .ch-runfoot{position:fixed;left:0;right:0;bottom:6mm;display:flex;justify-content:space-between;
    padding:0 14mm;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:${C.muted}}
  .ch-runfoot b{color:${C.navy};font-weight:700}

  /* ----- RENDU ÉCRAN (fichiers cliquables ouverts dans un navigateur) -----
     Le @page ne s'applique qu'à l'impression : sans cela, le contenu — pensé
     pour une page A4 — s'étalait sur toute la largeur de l'écran (effet
     « paysage élargi, sans marges »). On reconstitue ici une feuille A4
     portrait centrée, avec marges et ombre, pour un rendu identique au PDF. */
  @media screen {
    html{background:#e9eaf0}
    body{background:#e9eaf0;background-image:none;padding:28px 14px}
    .ch-cover,.ch-body{width:210mm;max-width:100%;margin:0 auto 22px;box-sizing:border-box;
      background:#fff;box-shadow:0 10px 40px rgba(31,27,51,.14);border-radius:3px}
    .ch-cover{min-height:297mm}
    .ch-body{min-height:297mm;padding:16mm 15mm 18mm}
    .ch-runfoot{display:none}
  }
  `;
}

// Assemble le document complet. footerText = ligne du pied courant.
export function charterDoc({ lang = "fr", docTitle = "", extraCss = "", coverHtml = "", bodyHtml = "", footerText = "" }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
  <style>${charterCss()}${extraCss}</style></head><body>
  ${coverHtml}
  ${footerText ? `<div class="ch-runfoot"><span>${footerText}</span><span>Armonie Group</span></div>` : ""}
  <div class="ch-body">${bodyHtml}</div>
  </body></html>`;
}
