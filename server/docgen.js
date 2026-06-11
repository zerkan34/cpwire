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
  .pill{display:inline-block;font-weight:600;font-size:11px;padding:2px 9px;border-radius:99px;}
  .pill.done{background:#e2f3ea;color:#1f8a5f;} .pill.prog{background:#e6effb;color:#2f5fa8;}
  .pill.todo{background:#fbf0e2;color:#b07423;} .pill.block{background:#fbe6e3;color:#c0392b;}
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
  @page{margin:14mm 13mm;}
  @media print{.page{padding:0;max-width:none;}}
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
