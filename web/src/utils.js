// utils.js — helpers partagés.
import { LOGO_DATA_URI } from "./logo.js";

export function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Impression via une iframe cachée : pas de nouvelle fenêtre/onglet « about:blank »,
// et l'app ne se fige plus (l'aperçu d'impression est isolé dans l'iframe).
export function printHtml(html) {
  try {
    const old = document.getElementById("cpwire-print-frame");
    if (old) old.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "cpwire-print-frame";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);

    let done = false;
    const cleanup = () => { setTimeout(() => { try { iframe.remove(); } catch { /* */ } }, 1500); };

    iframe.onload = () => {
      if (done) return; done = true;
      try {
        const w = iframe.contentWindow;
        try { w.document.title = " "; } catch { /* */ }
        w.focus();
        w.onafterprint = cleanup;
        w.print();
        setTimeout(cleanup, 60000); // filet de sécurité
      } catch (e) {
        cleanup();
        try { downloadHtml(html, "document.html"); } catch { /* */ }
      }
    };
    iframe.srcdoc = html;
    return true;
  } catch (e) {
    try { downloadHtml(html, "document.html"); } catch { /* */ }
    return false;
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
