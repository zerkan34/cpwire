// docgen.js — habille un contenu (fragment HTML) dans la charte Armonie,
// pour un rendu propre à l'écran (aperçu) et au téléchargement / impression PDF.

import { LOGO_DATA_URI } from "./logo.js";

const CSS = `
  *{box-sizing:border-box;}
  body{margin:0;font-family:'Inter',system-ui,sans-serif;color:#3d3b4d;background:#fff;line-height:1.55;font-size:14px;}
  .page{max-width:820px;margin:0 auto;padding:40px 46px;}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c7a14a;padding-bottom:16px;margin-bottom:8px;}
  .brand{font-family:'Poppins',sans-serif;font-weight:800;font-size:20px;color:#3a3658;}
  .brand b{color:#a9842f;}
  .brand img{height:46px;width:auto;display:block;}
  .conf{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#74718a;text-align:right;}
  .who{font-weight:700;color:#6e5cc4;}
  .indic{background:#f4f2fb;border-left:3px solid #6e5cc4;padding:10px 14px;border-radius:8px;color:#41406a;}
  .indic .hint{color:#74718a;font-size:12px;}
  .eyebrow{font-weight:700;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a9842f;margin-top:22px;}
  h1{font-family:'Poppins',sans-serif;font-weight:800;font-size:30px;color:#2c2945;margin:6px 0 4px;line-height:1.1;}
  .sub{color:#74718a;font-size:14px;margin-bottom:18px;}
  .cartouche{width:100%;border-collapse:collapse;margin:14px 0 24px;font-size:12.5px;}
  .cartouche td{border:1px solid #e7e5f1;padding:7px 11px;}
  .cartouche td:first-child{background:#f6f5fb;font-weight:600;color:#3a3658;width:150px;}
  h2{font-family:'Poppins',sans-serif;font-weight:700;font-size:17px;color:#2c2945;margin:26px 0 10px;padding-left:12px;border-left:5px solid #6e5cc4;}
  h3{font-size:14px;color:#3a3658;margin:16px 0 6px;}
  p{margin:8px 0;}
  ul{margin:8px 0 8px 4px;padding-left:18px;} li{margin:4px 0;}
  table.data{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0;}
  table.data th{background:#3a3658;color:#fff;text-align:left;padding:8px 10px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;}
  table.data td{border-bottom:1px solid #f0eef7;padding:8px 10px;}
  .pill{display:inline-block;font-weight:600;font-size:11px;padding:2px 9px;border-radius:99px;white-space:nowrap;}
  .pill.done{background:#e2f3ea;color:#1f8a5f;} .pill.prog{background:#e6effb;color:#2f5fa8;}
  .pill.todo{background:#fbf0e2;color:#b07423;} .pill.block{background:#fbe6e3;color:#c0392b;}
  .tk{font-family:monospace;font-weight:700;color:#5a48b0;font-size:12px;}
  .opt{border:1px solid #e7e5f1;border-radius:10px;padding:10px 13px;margin:8px 0;}
  .opt .ot{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;color:#6e5cc4;}
  .kpi-row{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0;}
  .kpi{flex:1;min-width:90px;border:1px solid #e7e5f1;border-radius:10px;padding:10px 12px;}
  .kpi .v{font-family:'Poppins';font-weight:800;font-size:24px;color:#2c2945;}
  .kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#74718a;}
  .foot{margin-top:34px;border-top:1px solid #e7e5f1;padding-top:12px;display:flex;justify-content:space-between;font-size:10.5px;color:#74718a;}
  .editable{outline:none;}
  details.cr-tk{border:1px solid #e7e5f1;border-radius:10px;margin:8px 0;overflow:hidden;background:#fff;}
  details.cr-tk[open]{box-shadow:0 2px 10px rgba(40,30,80,.06);}
  details.cr-tk>summary{cursor:pointer;list-style:none;padding:10px 13px;font-size:13px;display:flex;align-items:center;gap:9px;background:#faf9fe;}
  details.cr-tk>summary::-webkit-details-marker{display:none;}
  details.cr-tk>summary:before{content:"\\25B8";color:#6e5cc4;font-size:11px;}
  details.cr-tk[open]>summary:before{content:"\\25BE";}
  details.cr-tk>summary .cr-tk-k{font-family:monospace;font-weight:700;color:#5a48b0;font-size:12px;}
  details.cr-tk>summary .cr-tk-st{margin-left:auto;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:#74718a;font-weight:700;white-space:nowrap;}
  .cr-tk-bd{padding:11px 14px 13px;border-top:1px solid #f0eef7;}
  .cr-row{margin:8px 0;font-size:13px;}
  .cr-lbl{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6e5cc4;font-weight:800;margin-bottom:2px;}
  .cr-works{margin:3px 0 0 0;padding-left:16px;} .cr-works li{margin:3px 0;}
  .cr-meta{color:#74718a;font-size:11px;}
  .cr-from{color:#74718a;text-decoration:line-through;} .cr-to{font-weight:700;color:#5a48b0;}
  .cr-none{color:#74718a;font-style:italic;}
  .cr-scope{color:#74718a;font-size:11.5px;margin:2px 0 4px;}
  .cr-list{margin:4px 0 10px;padding-left:18px;}
  .cr-list li{font-size:12.5px;line-height:1.5;margin:2px 0;color:#2c2945;}
  .cr-list li .who{color:#5a48b0;font-weight:600;}
  .cr-tk-who{font-size:11px;color:#74718a;font-weight:600;}
  .cr-prog{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#7a6a00;background:#fbf3cf;border:1px solid #f0e3a8;border-radius:5px;padding:0 5px;white-space:nowrap;}
  table.tk-tbl{width:100%;border-collapse:collapse;table-layout:fixed;margin:4px 0 10px;}
  table.tk-tbl td{padding:6px 9px;border-bottom:1px solid #f0eef7;vertical-align:top;line-height:1.35;font-size:12px;overflow-wrap:anywhere;}
  table.tk-tbl .tk-k{white-space:nowrap;} table.tk-tbl .tk-k b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#3a3658;}
  table.tk-tbl .tk-res{color:#2c2945;} table.tk-tbl .tk-who .who{color:#5a48b0;font-weight:600;}
  table.tk-tbl .tk-st{text-align:right;white-space:nowrap;font-weight:700;color:#2c2945;font-size:11px;}
  details.cr-more{margin:-4px 0 14px;}
  details.cr-more>summary{cursor:pointer;list-style:none;font-size:12px;font-weight:700;color:#6e5cc4;padding:4px 0;display:inline-block;}
  details.cr-more>summary::-webkit-details-marker{display:none;}
  details.cr-more>summary:before{content:"\\002B ";font-weight:800;}
  details.cr-more[open]>summary:before{content:"\\2212 ";}
  /* PDF/impression : on déplie les listes pour ne rien cacher dans le document figé */
  @media print{details.cr-more>summary{display:none;} details.cr-more>ul,details.cr-more>table{display:revert !important;}}
  @page{margin:14mm 13mm;}
  @media print{.page{padding:0;max-width:none;}}
  /* === MOBILE UNIQUEMENT (iframe étroite < 480px) : fond violet cp|WIRE, écriture blanche === */
  @media (max-width:480px){
    body{background:linear-gradient(160deg,#2c2945 0%,#3a3658 100%);color:#eef1f8;}
    .page{padding:22px 16px;}
    .conf{color:#c8c4e0;}
    .eyebrow{color:#d8b765;}                                   /* doré cp|WIRE */
    h1{color:#ffffff;}
    .sub{color:#c8c4e0;}
    h2{color:#ffffff;font-weight:800;border-left-color:#c7a14a;} /* "Ce qui avance" : blanc gras, accent doré */
    h3{color:#ffffff;}
    p,li{color:#e4e8f3;}
    .cartouche td{border-color:rgba(255,255,255,.16);color:#e4e8f3;}
    .cartouche td:first-child{background:rgba(255,255,255,.08);color:#ffffff;}
    table.data td{border-bottom-color:rgba(255,255,255,.12);color:#e4e8f3;}
    table.data th{background:#6e5cc4;}
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

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

// Construit un document complet et autonome.
export function buildDoc({ kicker, title, subtitle, cartouche = [], bodyHtml, etabliPar = "" }) {
  const cart = cartouche.length
    ? `<table class="cartouche">${cartouche.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`
    : "";
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${FONTS}<style>${CSS}</style><title>${title}</title></head>
<body><div class="page">
  <div class="top"><div class="brand"><img src="${LOGO_DATA_URI}" alt="Armonie"></div><div class="conf">Armonie Group · Confidentiel<br>${date}</div></div>
  <div class="eyebrow">${kicker}</div>
  <h1>${title}</h1>
  <div class="sub">${subtitle || ""}</div>
  ${cart}
  ${bodyHtml}
  <div class="foot"><span>${etabliPar ? "Établi par " + etabliPar : "Armonie Group"}</span><span>Document de travail · à valider</span></div>
</div></body></html>`;
}
