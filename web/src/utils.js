// utils.js — helpers partagés.
import { LOGO_DATA_URI } from "./logo.js";

export async function downloadHtml(html, filename = "Document.html") {
  const name = /\.html?$/i.test(filename) ? filename : `${String(filename).replace(/\.[a-z0-9]+$/i, "")}.html`;
  const veil = pdfVeil(name);
  try {
    veil.status("Préparation du fichier…");
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    veil.status("Fichier prêt — choisissez l'emplacement d'enregistrement…");
    try {
      await saveBlobAs(blob, name, { description: "Page web", mime: "text/html", ext: ".html" });
      veil.success("Enregistré sur votre ordinateur.");
      await new Promise((r) => setTimeout(r, 1300)); // laisse voir le rond vert
      return true;
    } catch (e) {
      if (e && e.name === "AbortError") return false; // annulation volontaire
      return false;
    }
  } finally {
    veil.remove();
  }
}

// ---------------------------------------------------------------------------
//  Export PDF cp|WIRE :
//   - VOILE de progression à la charte Armonie (barre animée, fermable) ;
//   - CHOIX du dossier de téléchargement (File System Access API) si dispo,
//     sinon téléchargement classique ;
//   - VRAI PDF : serveur WeasyPrint (texte sélectionnable) sinon navigateur
//     html2pdf (portrait A4, marges). Plus jamais d'onglet HTML « paysage ».
// ---------------------------------------------------------------------------

let _veilCssInjected = false;
function ensureVeilCss() {
  if (_veilCssInjected) return;
  _veilCssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
  @keyframes cpwVeilIn{from{opacity:0}to{opacity:1}}
  @keyframes cpwBar{0%{left:-42%}100%{left:100%}}
  @keyframes cpwCir{to{stroke-dashoffset:0}}
  @keyframes cpwChk{to{stroke-dashoffset:0}}
  @keyframes cpwPop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
  .cpw-veil{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
    background:rgba(31,27,51,.55);backdrop-filter:blur(3px);animation:cpwVeilIn .18s ease}
  .cpw-veil-card{width:min(430px,88vw);background:#fff;border-radius:16px;overflow:hidden;position:relative;
    box-shadow:0 24px 70px rgba(31,27,51,.42);font-family:Inter,system-ui,Arial,sans-serif;color:#1F1B33}
  .cpw-veil-top{height:5px;background:linear-gradient(90deg,#2E2A5D,#4B3F8F 55%,#A8884E)}
  .cpw-veil-hd{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 12px;border-bottom:1px solid #efedf6}
  .cpw-veil-logo{font-family:Poppins,Inter,sans-serif;font-weight:800;font-size:18px;letter-spacing:.4px;color:#2E2A5D;line-height:1}
  .cpw-veil-logo i{color:#A8884E;font-style:normal}
  .cpw-veil-logo small{display:block;font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:#6E6A86;font-weight:700;margin-top:4px}
  .cpw-veil-x{width:26px;height:26px;border:0;border-radius:8px;background:#F5F2FC;color:#6E6A86;font-size:16px;line-height:1;cursor:pointer;flex:none}
  .cpw-veil-x:hover{background:#ece9f3;color:#2E2A5D}
  .cpw-veil-bd{padding:20px 22px 22px}
  .cpw-veil-check{width:56px;height:56px;margin:0 auto 12px;display:none}
  .cpw-veil-card.done .cpw-veil-check{display:block;animation:cpwPop .4s ease}
  .cpw-veil-check circle{fill:none;stroke:#1f8a5f;stroke-width:3;stroke-dasharray:151;stroke-dashoffset:151;animation:cpwCir .5s ease forwards}
  .cpw-veil-check path{fill:none;stroke:#1f8a5f;stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:cpwChk .34s .44s ease forwards}
  .cpw-veil-t{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:16px;color:#2E2A5D;margin:0 0 4px;text-align:center}
  .cpw-veil-s{font-size:12px;color:#6E6A86;margin:0 0 16px;min-height:16px;text-align:center}
  .cpw-veil-track{position:relative;height:7px;border-radius:99px;background:#ece9f3;overflow:hidden}
  .cpw-veil-card.done .cpw-veil-track{display:none}
  .cpw-veil-track .ind{position:absolute;top:0;bottom:0;width:42%;border-radius:99px;
    background:linear-gradient(90deg,#4B3F8F,#A8884E);animation:cpwBar 1.1s ease-in-out infinite}
  .cpw-veil-hint{font-size:10.5px;color:#9b97b3;margin:14px 0 0;word-break:break-all;text-align:center}
  `;
  document.head.appendChild(s);
}

// Voile de progression. Renvoie { remove, status, done }. La croix masque le voile
// sans annuler la génération (le sélecteur d'emplacement s'ouvrira quand même).
function pdfVeil(name) {
  ensureVeilCss();
  const el = document.createElement("div");
  el.className = "cpw-veil";
  el.innerHTML = `<div class="cpw-veil-card">
    <div class="cpw-veil-top"></div>
    <div class="cpw-veil-hd">
      <div class="cpw-veil-logo">armo<i>n</i>ie<small>notos <i>phl</i>soft</small></div>
      <button class="cpw-veil-x" title="Fermer" aria-label="Fermer">×</button>
    </div>
    <div class="cpw-veil-bd">
      <div class="cpw-veil-check"><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="24"/><path d="M17 29 l7 7 l15 -16"/></svg></div>
      <div class="cpw-veil-t">Génération du PDF…</div>
      <div class="cpw-veil-s">Mise en forme du document — un instant.</div>
      <div class="cpw-veil-track"><div class="ind"></div></div>
      <div class="cpw-veil-hint">${esc(name)}</div>
    </div>
  </div>`;
  const remove = () => { try { el.remove(); } catch { /* déjà retiré */ } };
  el.querySelector(".cpw-veil-x").addEventListener("click", remove);
  document.body.appendChild(el);
  const status = (txt) => { const n = el.querySelector(".cpw-veil-s"); if (n) n.textContent = txt; };
  const setTitle = (txt) => { const n = el.querySelector(".cpw-veil-t"); if (n) n.textContent = txt; };
  const done = () => {
    const card = el.querySelector(".cpw-veil-card"); if (card) card.classList.add("done");
    setTitle("Document prêt");
    status("Choisissez l'emplacement d'enregistrement.");
  };
  // État de SUCCÈS : affiché APRÈS l'enregistrement réel du fichier (rond vert coché).
  const success = (msg) => {
    const card = el.querySelector(".cpw-veil-card"); if (card) card.classList.add("done");
    setTitle("Enregistré");
    status(msg || "Fichier enregistré sur votre ordinateur.");
  };
  return { remove, status, title: setTitle, done, success };
}

// Enregistre un blob en laissant l'utilisateur CHOISIR l'emplacement (File System
// Access API), pour N'IMPORTE QUEL type. Si l'API est absente (Firefox/Safari) →
// téléchargement classique. Lève AbortError si l'utilisateur annule le sélecteur.
export async function saveBlobAs(blob, suggestedName, opts = {}) {
  const description = opts.description || "Fichier";
  const mime = opts.mime || blob.type || "application/octet-stream";
  const ext = opts.ext || ("." + (suggestedName.split(".").pop() || "bin"));
  if (typeof window !== "undefined" && window.showSaveFilePicker) {
    let handle = null;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [mime]: [ext] } }],
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;   // annulation volontaire : ne pas re-télécharger
      handle = null;                                // API refusée (iframe, permission) → repli
    }
    if (handle) {
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    }
  }
  // Repli : téléchargement classique (dossier par défaut du navigateur).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = suggestedName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// Spécialisation PDF (conserve l'ancienne signature interne).
async function saveBlob(blob, suggestedName) {
  return saveBlobAs(blob, suggestedName, { description: "Document PDF", mime: "application/pdf", ext: ".pdf" });
}

// Génère le PDF côté navigateur et renvoie un Blob (sans télécharger).
// html2canvas exige un élément en FLUX NORMAL (static) : le holder est en flux,
// masqué par le voile (z-index max) le temps du rendu.
async function clientPdfBlob(html) {
  const html2pdf = (await import("html2pdf.js")).default;
  const inner = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  const sm = html.match(/<style>[\s\S]*?<\/style>/i);
  let css = sm ? sm[0] : "";
  // Neutralise les règles globales (sinon elles affecteraient l'app) + le @page.
  css = css.replace(/@page[^}]*}/gi, "")
           .replace(/(^|})\s*body\s*\{/gi, "$1 .cpw-pdf-root{")
           .replace(/(^|})\s*\*\s*\{/gi, "$1 .cpw-pdf-root *{");
  const holder = document.createElement("div");
  holder.className = "cpw-pdf-root";
  holder.style.cssText = "width:794px;background:#fff;";
  holder.innerHTML = css + inner;
  holder.querySelectorAll(".ch-runfoot").forEach((n) => n.remove());
  document.body.appendChild(holder);
  try {
    return await html2pdf().set({
      margin: [10, 10, 12, 10],
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff", windowWidth: 794, width: 794, scrollX: 0, scrollY: 0, x: 0, y: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    }).from(holder).outputPdf("blob");
  } finally {
    holder.remove();
  }
}

export async function printHtml(html, filename = "Document.pdf") {
  const name = /\.pdf$/i.test(filename) ? filename : `${String(filename).replace(/\.html?$/i, "")}.pdf`;
  const veil = pdfVeil(name);
  try {
    let blob = null;
    // 1) PDF serveur (WeasyPrint) — qualité max, texte sélectionnable.
    try {
      veil.status("Rendu haute qualité (serveur)…");
      const { renderHtmlPdfBlob } = await import("./api.js");
      blob = await renderHtmlPdfBlob(html, name);
    } catch (e) { /* moteur serveur absent → PDF navigateur */ }
    // 2) PDF côté navigateur (portrait A4 avec marges), sans Docker.
    if (!blob) {
      try { veil.status("Génération du PDF (navigateur)…"); blob = await clientPdfBlob(html); }
      catch (e) { /* échec rare → dernier recours */ }
    }
    if (blob) {
      veil.status("Document prêt — choisissez l'emplacement d'enregistrement…");
      try {
        await saveBlob(blob, name);
        veil.success("Enregistré sur votre ordinateur.");
        await new Promise((r) => setTimeout(r, 1300)); // laisse voir le rond vert
        return true;
      } catch (e) {
        if (e && e.name === "AbortError") return false; // annulation volontaire du sélecteur
        /* autre échec d'enregistrement → repli HTML ci-dessous */
      }
    }
    // 3) Dernier recours : enregistrer la version web (même voile, même sélecteur d'emplacement).
    veil.status("PDF indisponible — enregistrement de la version web…");
    try {
      const hblob = new Blob([html], { type: "text/html;charset=utf-8" });
      await saveBlobAs(hblob, name.replace(/\.pdf$/i, ".html"), { description: "Page web", mime: "text/html", ext: ".html" });
      veil.success("Enregistré (version web).");
      await new Promise((r) => setTimeout(r, 1300));
    } catch { /* annulation ou échec : on referme simplement */ }
    return false;
  } finally {
    veil.remove();
  }
}

// Ouvre une URL externe de façon fiable, en navigateur ET dans l'app desktop (Tauri).
export function openExternal(url) {
  if (!url) return;
  try {
    const t = typeof window !== "undefined" ? window.__TAURI__ : null;
    if (t) {
      if (t.opener && typeof t.opener.openUrl === "function") { t.opener.openUrl(url); return; }
      if (t.shell && typeof t.shell.open === "function") { t.shell.open(url); return; }
      if (t.core && typeof t.core.invoke === "function") {
        t.core.invoke("plugin:opener|open_url", { url }).catch(() => window.open(url, "_blank", "noopener,noreferrer"));
        return;
      }
    }
  } catch { /* repli navigateur ci-dessous */ }
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) { try { window.location.assign(url); } catch { /* rien de plus à faire */ } }
}

export function frDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fr-FR"); } catch { return iso; }
}

// Échappe le HTML (pour insérer du texte utilisateur dans un document).
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}

// Logo cp|WIRE (SVG autonome + mot-symbole) — réutilisé dans tous les documents.
const CW_LOGO = `<span class="cpwire-logo"><svg class="cw-mark" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="cwg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E2A5D"/><stop offset="1" stop-color="#4B3F8F"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#cwg)"/><circle cx="7.5" cy="8" r="2" fill="#A8884E"/><circle cx="16.5" cy="16" r="2" fill="#A8884E"/><path d="M7.5 8L16.5 16" stroke="#F5F2FC" stroke-width="1.6" stroke-linecap="round"/></svg><span class="cw-cp">cp</span><span class="cw-bar">|</span><span class="cw-wire">WIRE</span></span>`;

// Construit un document autonome à la CHARTE cp|WIRE (logo, filet or→indigo, Poppins,
// panneau lavande, titres navy/indigo, tableaux à en-tête navy, pied signé).
// Mêmes codes que le récap journalier -> tous les PDF de l'app sont homogènes.
// Champs : kicker (eyebrow), title, subtitle, cartouche [[clé,val]…], bodyHtml, etabliPar.
export function buildSimpleDoc({ kicker = "", title, subtitle = "", cartouche = [], bodyHtml = "", etabliPar = "Nicolas Durand" }) {
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;
  const sign = esc(String(etabliPar || "").replace(/\s+(\S+)$/, (m, p) => " " + p.toUpperCase()));
  const css = `*{box-sizing:border-box}
    :root{--navy:#2E2A5D;--indigo:#4B3F8F;--gold:#A8884E;--lavande:#F5F2FC;--body:#4a4763;--muted:#6b6488;--line:#ece9f3;--serif:'Poppins','Segoe UI',system-ui,sans-serif;--sans:'Inter',system-ui,Arial,sans-serif}
    body{margin:0;font-family:var(--sans);color:var(--body);background:#e9e7ef;line-height:1.6;font-size:13.5px}
    .page{max-width:880px;margin:0 auto;background:#fff;border-radius:6px;box-shadow:0 18px 50px rgba(46,42,93,.14);overflow:hidden}
    .bar{height:8px;background:linear-gradient(90deg,var(--navy) 0%,var(--indigo) 52%,var(--gold) 100%)}
    .inner{padding:46px 56px 36px}
    .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
    .brand{display:flex;align-items:center;gap:12px}
    .cpwire-logo{font-family:var(--serif);font-weight:800;font-size:22px;letter-spacing:-.01em;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
    .cpwire-logo .cw-cp{color:var(--indigo)}.cpwire-logo .cw-bar{color:var(--gold);margin:0 1px}.cpwire-logo .cw-wire{color:var(--navy);letter-spacing:.05em}
    .cw-mark{width:26px;height:26px;flex:none}
    .brand-logo{height:42px;width:auto;display:block}
    .lede{font-size:15px;line-height:1.6;color:#3f3d57;margin:0 0 18px}.lede b{color:var(--navy)}
    .tagline{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
    .conf{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-align:right;line-height:1.5}
    .eyebrow{font-weight:700;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
    h1{font-family:var(--serif);font-weight:800;font-size:34px;color:var(--navy);margin:10px 0 4px;line-height:1.06;letter-spacing:-.015em}
    .sub{font-family:var(--serif);color:var(--indigo);font-weight:700;font-size:18px;margin-bottom:4px}
    .rule{width:120px;height:5px;border-radius:3px;background:linear-gradient(90deg,var(--gold),var(--indigo));margin:18px 0 22px}
    .meta{background:var(--lavande);border-left:4px solid var(--gold);border-radius:14px;padding:18px 22px;margin:0 0 22px;display:grid;grid-template-columns:165px 1fr;row-gap:10px;column-gap:16px}
    .meta dt{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);align-self:center}
    .meta dd{margin:0;font-size:13.5px;color:#3f3d57;font-weight:500}
    .body h2{font-family:var(--serif);font-weight:700;font-size:18px;color:var(--navy);margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--lavande)}
    .body h3{font-family:var(--serif);font-size:14px;color:var(--indigo);margin:16px 0 6px}
    .body p{margin:8px 0}
    .body ul,.body ol{margin:8px 0;padding-left:20px}.body li{margin:4px 0}
    table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0 14px}
    table th{background:var(--navy);color:#fff;text-align:left;padding:9px 12px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}
    table td{border-bottom:1px solid var(--line);padding:9px 12px;vertical-align:top}
    table tr:nth-child(even) td{background:#faf9fd}
    tr{break-inside:avoid}
    .pill{display:inline-block;font-weight:700;font-size:11px;padding:2px 9px;border-radius:99px;background:var(--lavande);color:var(--indigo)}
    .pill.done{background:#e7f3ec;color:#2f7d4f}.pill.prog{background:#eef0fb;color:#4B3F8F}
    .pill.todo{background:#faf2ea;color:#a9531f}.pill.block{background:#fbe6e3;color:#c0392b}
    .muted{color:var(--muted)}
    details{border:1px solid var(--line);border-radius:10px;margin:8px 0;overflow:hidden}
    details>summary{cursor:pointer;list-style:none;padding:9px 14px;font-weight:600;color:var(--navy);background:#faf9fd;display:flex;justify-content:space-between;align-items:center;font-size:12.5px}
    details>summary::-webkit-details-marker{display:none}
    details[open]>summary{background:var(--lavande);border-bottom:1px solid var(--line)}
    summary .n{font-weight:700;color:var(--indigo);background:#fff;border:1px solid var(--line);border-radius:99px;padding:1px 9px;font-size:11px}
    details table{margin:0}details table tr:first-child td{border-top:0}
    .rk-k{font-weight:700;color:var(--indigo);white-space:nowrap;width:1%}
    .rk-a{color:var(--muted);white-space:nowrap;width:1%;text-align:right}
    .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--navy);width:1%;white-space:nowrap}
    .hors{font-size:12px;color:var(--muted);margin:6px 0 4px}
    .rsec{margin:0 0 30px}
    .foot{margin-top:36px;border-top:1px solid var(--line);padding-top:14px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);letter-spacing:.04em}
    @page{margin:13mm 12mm}
    @media print{body{background:#fff}.page{box-shadow:none;border-radius:0;max-width:none}.inner{padding:14mm 16mm}}`;
  const cart = (cartouche && cartouche.length)
    ? `<dl class="meta">${cartouche.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${fonts}<title> </title><style>${css}</style></head>
  <body><div class="page"><div class="bar"></div><div class="inner">
    <div class="top"><div class="brand"><img class="brand-logo" src="${LOGO_DATA_URI}" alt="Armonie"></div><div class="conf">Armonie Group · Confidentiel<br>${esc(date)}</div></div>
    ${kicker ? `<div class="eyebrow">${esc(kicker)}</div>` : ""}
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
    <div class="rule"></div>
    ${cart}
    <div class="body">${bodyHtml}</div>
    <div class="foot"><span>${sign ? "Établi par " + sign : "Armonie Group"}</span><span>Armonie Group · Confidentiel</span></div>
  </div></div></body></html>`;
}

// Extrait un texte lisible d'un fragment/Document HTML (pour copier / e-mail).
export function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

// Copie un texte dans le presse-papiers (renvoie true/false).
export async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { return false; }
}

// Ouvre le client mail avec un brouillon pré-rempli.
export function mailDraft(subject, bodyText) {
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(bodyText || "");
  window.location.href = `mailto:?subject=${s}&body=${b}`;
}
