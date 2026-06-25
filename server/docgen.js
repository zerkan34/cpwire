// docgen.js — habille un contenu (fragment HTML) dans la charte Armonie,
// pour un rendu propre à l'écran (aperçu) et au téléchargement / impression PDF.

import { LOGO_DATA_URI } from "./logo.js";

// Logo cp|WIRE (SVG autonome + mot-symbole).
const CW_LOGO = `<span class="cpwire-logo"><svg class="cw-mark" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="cwg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E2A5D"/><stop offset="1" stop-color="#4B3F8F"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#cwg)"/><circle cx="7.5" cy="8" r="2" fill="#A8884E"/><circle cx="16.5" cy="16" r="2" fill="#A8884E"/><path d="M7.5 8L16.5 16" stroke="#F5F2FC" stroke-width="1.6" stroke-linecap="round"/></svg><span class="cw-cp">cp</span><span class="cw-bar">|</span><span class="cw-wire">WIRE</span></span>`;

const CSS = `
  *{box-sizing:border-box;}
  body{margin:0;font-family:'Inter',system-ui,sans-serif;color:#4a4763;background:#e9e7ef;line-height:1.55;font-size:14px;}
  .page{max-width:880px;margin:0 auto;background:#fff;border-radius:6px;box-shadow:0 18px 50px rgba(46,42,93,.14);overflow:hidden;}
  .bar{height:8px;background:linear-gradient(90deg,#2E2A5D 0%,#4B3F8F 52%,#A8884E 100%);}
  .inner{padding:46px 56px 36px;}
  .rule{width:120px;height:5px;border-radius:3px;background:linear-gradient(90deg,#A8884E,#4B3F8F);margin:18px 0 22px;}
  .cpwire-logo{font-family:'Poppins',sans-serif;font-weight:800;font-size:22px;letter-spacing:-.01em;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}
  .cpwire-logo .cw-cp{color:#4B3F8F;}.cpwire-logo .cw-bar{color:#A8884E;margin:0 1px;}.cpwire-logo .cw-wire{color:#2E2A5D;letter-spacing:.05em;}
  .cw-mark{width:26px;height:26px;flex:none;}
  .tagline{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#6b6488;}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;}
  .brand{display:flex;align-items:center;gap:12px;}
  .brand-logo{height:42px;width:auto;display:block;}
  .brand-arm{font-family:'Poppins',sans-serif;font-weight:800;font-size:26px;color:#2E2A5D;line-height:1;letter-spacing:-.01em;}
  .brand-arm .g{color:#A8884E;}
  .brand-arm small{display:block;font-size:9px;font-weight:700;letter-spacing:.03em;color:#2E2A5D;margin-top:3px;}
  .lede{font-size:15px;line-height:1.6;color:#3f3d57;margin:0 0 18px;}
  .lede b{color:#2E2A5D;}
  .conf{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#74718a;text-align:right;}
  .who{font-weight:700;color:#4B3F8F;}
  .indic{background:#F5F2FC;border-left:3px solid #4B3F8F;padding:10px 14px;border-radius:8px;color:#41406a;}
  .indic .hint{color:#74718a;font-size:12px;}
  .eyebrow{font-weight:700;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#A8884E;}
  h1{font-family:'Poppins',sans-serif;font-weight:800;font-size:34px;color:#2E2A5D;margin:10px 0 4px;line-height:1.06;letter-spacing:-.015em;}
  .sub{font-family:'Poppins',sans-serif;color:#4B3F8F;font-weight:700;font-size:18px;margin-bottom:4px;}
  .cartouche{width:100%;border-collapse:collapse;margin:0 0 22px;font-size:12.5px;background:#F5F2FC;border-radius:14px;overflow:hidden;border-left:4px solid #A8884E;}
  .cartouche td{border:none;border-bottom:1px solid #ece9f3;padding:9px 14px;}
  .cartouche tr:last-child td{border-bottom:none;}
  .cartouche td:first-child{background:transparent;font-weight:700;color:#6b6488;width:160px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;}
  h2{font-family:'Poppins',sans-serif;font-weight:700;font-size:17px;color:#2E2A5D;margin:32px 0 12px;padding-left:12px;border-left:5px solid #4B3F8F;}
  h3{font-size:14px;color:#2E2A5D;margin:22px 0 8px;}
  p{margin:8px 0;}
  ul{margin:8px 0 8px 4px;padding-left:18px;} li{margin:4px 0;}
  table.data{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;margin:12px 0;border:1px solid #e9e5f3;border-radius:12px;overflow:hidden;}
  table.data th{background:#2E2A5D;color:#fff;text-align:left;padding:9px 12px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;}
  table.data td{border-top:1px solid #f0eef7;padding:9px 12px;}
  table.data tr:nth-child(2) td{border-top:0;}
  table.data tr:nth-child(even) td{background:#faf9fd;}
  .pill{display:inline-block;font-weight:600;font-size:11px;padding:2px 9px;border-radius:99px;white-space:nowrap;}
  .pill.done{background:#e2f3ea;color:#1f8a5f;} .pill.prog{background:#e6effb;color:#2f5fa8;}
  .pill.todo{background:#fbf0e2;color:#b07423;} .pill.block{background:#fbe6e3;color:#c0392b;}
  .tk{font-family:monospace;font-weight:700;color:#4B3F8F;font-size:12px;}
  .opt{border:1px solid #e7e5f1;border-radius:10px;padding:10px 13px;margin:8px 0;}
  .opt .ot{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;color:#4B3F8F;}
  .kpi-row{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0;}
  .kpi{flex:1;min-width:90px;border:1px solid #e7e5f1;border-radius:10px;padding:10px 12px;}
  .kpi .v{font-family:'Poppins';font-weight:800;font-size:24px;color:#2E2A5D;}
  .kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#74718a;}
  .foot{margin-top:34px;border-top:1px solid #e7e5f1;padding-top:12px;display:flex;justify-content:space-between;font-size:10.5px;color:#74718a;}
  .editable{outline:none;}
  details.cr-tk{border:1px solid #e7e5f1;border-left:3px solid #4B3F8F;border-radius:10px;margin:8px 0;overflow:hidden;background:#fff;}
  details.cr-tk[open]{box-shadow:0 4px 16px rgba(46,42,93,.10);border-left-color:#A8884E;}
  details.cr-tk>summary{cursor:pointer;list-style:none;padding:10px 13px;font-size:13px;display:flex;align-items:center;gap:9px;background:#F5F2FC;}
  details.cr-tk[open]>summary{background:linear-gradient(90deg,#ece5fb,#F5F2FC);border-bottom:1px solid #e3daf5;}
  details.cr-tk>summary::-webkit-details-marker{display:none;}
  details.cr-tk>summary:before{content:"\\25B8";color:#4B3F8F;font-size:11px;}
  details.cr-tk[open]>summary:before{content:"\\25BE";}
  details.cr-tk>summary .cr-tk-k{font-family:monospace;font-weight:700;color:#4B3F8F;font-size:12px;flex:0 0 auto;white-space:nowrap;}
  details.cr-tk>summary .cr-tk-res{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  details.cr-tk>summary .cr-prog-cell{flex:0 0 132px;overflow:hidden;white-space:nowrap;}
  details.cr-tk>summary .cr-tk-who{flex:0 0 130px;text-align:right;font-size:11px;color:#74718a;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  details.cr-tk>summary .cr-tk-st{flex:0 0 auto;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#4B3F8F;font-weight:800;white-space:nowrap;background:#ece5fb;padding:3px 9px;border-radius:999px;}
  @media (max-width:560px){ details.cr-tk>summary{flex-wrap:wrap;} details.cr-tk>summary .cr-tk-res{flex:1 1 100%;} details.cr-tk>summary .cr-prog-cell,details.cr-tk>summary .cr-tk-who,details.cr-tk>summary .cr-tk-st{flex:0 0 auto;text-align:left;} }
  .cr-tk-bd{padding:11px 14px 13px;border-top:1px solid #f0eef7;}
  .cr-row{margin:8px 0;font-size:13px;}
  .cr-lbl{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#4B3F8F;font-weight:800;margin-bottom:2px;}
  .cr-works{margin:3px 0 0 0;padding-left:16px;} .cr-works li{margin:3px 0;}
  .cr-meta{color:#74718a;font-size:11px;}
  .cr-from{color:#74718a;text-decoration:line-through;} .cr-to{font-weight:700;color:#4B3F8F;}
  .cr-none{color:#74718a;font-style:italic;}
  .cr-scope{color:#74718a;font-size:11.5px;margin:2px 0 4px;}
  .cr-list{margin:4px 0 10px;padding-left:18px;}
  .cr-list li{font-size:12.5px;line-height:1.5;margin:2px 0;color:#2E2A5D;}
  .cr-list li .who{color:#4B3F8F;font-weight:600;}
  .cr-tk-who{font-size:11px;color:#74718a;font-weight:600;}
  .cr-prog{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#7a6a00;background:#fbf3cf;border:1px solid #f0e3a8;border-radius:5px;padding:0 5px;white-space:nowrap;}
  table.tk-tbl{width:100%;border-collapse:collapse;table-layout:fixed;margin:4px 0 10px;}
  table.tk-tbl td{padding:6px 9px;border-bottom:1px solid #f0eef7;vertical-align:top;line-height:1.35;font-size:12px;overflow-wrap:anywhere;}
  table.tk-tbl .tk-k{white-space:nowrap;} table.tk-tbl .tk-k b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#2E2A5D;}
  table.tk-tbl .tk-res{color:#2E2A5D;} table.tk-tbl .tk-who .who{color:#4B3F8F;font-weight:600;}
  table.tk-tbl .tk-prog{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  table.tk-tbl .tk-st{text-align:right;white-space:nowrap;font-weight:700;color:#2E2A5D;font-size:11px;}
  table.data td.r,table.data th.r{text-align:right;}
  table.act-tbl{font-size:11.5px;}
  table.act-tbl td:first-child,table.act-tbl th:first-child{text-align:left;}
  table.act-tbl tr.act-tot td{border-top:2px solid #d9d4ee;background:#F5F2FC;}
  h3.cr-perim,h4.cr-perim{color:#2E2A5D;border-left:3px solid #A8884E;padding-left:8px;margin:14px 0 6px;font-size:13px;}
  h4.cr-perim{font-size:12px;color:#4B3F8F;border-left-color:#4B3F8F;margin:10px 0 4px;}
  details.cr-more{margin:-4px 0 14px;}
  details.cr-more>summary{cursor:pointer;list-style:none;font-size:12px;font-weight:700;color:#4B3F8F;padding:4px 0;display:inline-block;}
  details.cr-more>summary::-webkit-details-marker{display:none;}
  details.cr-more>summary:before{content:"\\002B ";font-weight:800;}
  details.cr-more[open]>summary:before{content:"\\2212 ";}
  /* PDF/impression : on déplie les listes pour ne rien cacher dans le document figé */
  @media print{details.cr-more>summary{display:none;} details.cr-more>ul,details.cr-more>table{display:revert !important;}}
  @page{margin:14mm 13mm;}
  @media print{.page{padding:0;max-width:none;}}
  /* === MOBILE UNIQUEMENT (iframe étroite < 480px) : fond sombre, écriture claire === */
  @media (max-width:480px){
    body{background:linear-gradient(160deg,#2E2A5D 0%,#2E2A5D 100%);color:#eef1f8;}
    .page{padding:0;}
    .inner{padding:22px 16px;}
    .cpwire-logo .cw-wire{color:#fff;} .cpwire-logo .cw-cp{color:#b9a9f0;} .tagline{color:#c8c4e0;}
    .conf{color:#c8c4e0;}
    .eyebrow{color:#d8b765;}                                   /* doré */
    h1{color:#ffffff;}
    .sub{color:#c8c4e0;}
    h2{color:#ffffff;font-weight:800;border-left-color:#A8884E;} /* "Ce qui avance" : blanc gras, accent doré */
    h3{color:#ffffff;}
    p,li{color:#e4e8f3;}
    .cartouche td{border-color:rgba(255,255,255,.16);color:#e4e8f3;}
    .cartouche td:first-child{background:rgba(255,255,255,.08);color:#ffffff;}
    table.data td{border-bottom-color:rgba(255,255,255,.12);color:#e4e8f3;}
    table.data th{background:#4B3F8F;}
    .kpi{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);}
    .kpi .v{color:#ffffff;} .kpi .l{color:#c8c4e0;}
    .indic{background:rgba(110,92,196,.22);border-left-color:#8b7ce0;color:#eef1f8;}
    .indic .hint{color:#c8c4e0;}
    .opt{border-color:rgba(255,255,255,.16);} .opt .ot{color:#b9a9f0;}
    .who,.tk,.cr-to,.cr-tk-k,.cr-lbl,.opt .ot{color:#b9a9f0;}
    .cr-list li{color:#e4e8f3;} .cr-list li .who{color:#b9a9f0;}
    table.tk-tbl td{border-bottom-color:rgba(255,255,255,.12);} table.tk-tbl .tk-res,table.tk-tbl .tk-st{color:#e4e8f3;} table.tk-tbl .tk-k b{color:#b9a9f0;} table.tk-tbl .tk-who .who{color:#b9a9f0;}
    details.cr-more>summary{color:#b9a9f0;} .cr-scope,.cr-tk-who{color:#c8c4e0;}
    .cr-prog{color:#e8d27a;background:rgba(232,210,122,.12);border-color:rgba(232,210,122,.32);}
    details.cr-tk{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14);}
    details.cr-tk>summary{background:rgba(255,255,255,.07);}
    details.cr-tk>summary:before,details.cr-tk[open]>summary:before{color:#b9a9f0;}
    .cr-tk-bd{border-top-color:rgba(255,255,255,.12);}
    .cr-meta,.cr-tk-st,.foot{color:#c8c4e0;}
    .cr-from{color:#9a96b5;} .cr-none{color:#c8c4e0;}
    .foot{border-top-color:rgba(255,255,255,.16);}
  }
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

// Construit un document complet et autonome.
export function buildDoc({ kicker, title, subtitle, cartouche = [], bodyHtml, etabliPar = "" }) {
  const cart = cartouche.length
    ? `<table class="cartouche">${cartouche.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`
    : "";
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const sign = String(etabliPar || "").replace(/\s+(\S+)$/, (m, p) => " " + p.toUpperCase());
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${FONTS}<style>${CSS}</style><title>${title}</title></head>
<body><div class="page"><div class="bar"></div><div class="inner">
  <div class="top"><div class="brand"><div class="brand-arm">armo<span class="g">n</span>ie<small>notos <span class="g">phl</span>soft</small></div></div><div class="conf">Armonie Group · Confidentiel<br>${date}</div></div>
  <div class="eyebrow">${kicker || ""}</div>
  <h1>${title}</h1>
  ${subtitle ? `<div class="sub">${subtitle}</div>` : ""}
  <div class="rule"></div>
  ${cart}
  ${bodyHtml}
  <div class="foot"><span>${sign ? "Établi par " + sign : "Armonie Group"}</span><span>Armonie Group · Confidentiel</span></div>
</div></div></body></html>`;
}
