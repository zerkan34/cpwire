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
// En navigateur : window.open (avec repli sur la navigation directe si bloqué).
// Dans Tauri : utilise l'opener exposé (plugin opener v2, shell v1, ou invoke).
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

// Construit un document autonome à la CHARTE ARMONIE (logo, filet doré, Poppins,
// cartouche, titres à liseré violet, tableaux à en-tête sombre, pied de page).
// Mêmes codes que les CR -> tous les PDF de l'app sont homogènes.
// Champs : kicker (eyebrow), title, subtitle, cartouche [[clé,val]…], bodyHtml, etabliPar.
export function buildSimpleDoc({ kicker = "", title, subtitle = "", cartouche = [], bodyHtml = "", etabliPar = "Nicolas Durand" }) {
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;
  const css = `*{box-sizing:border-box}
    body{margin:0;font-family:'Inter',system-ui,Arial,sans-serif;color:#3d3b4d;background:#fff;line-height:1.55;font-size:13.5px}
    .page{max-width:820px;margin:0 auto;padding:38px 44px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c7a14a;padding-bottom:15px;margin-bottom:6px}
    .brand img{height:44px;width:auto;display:block}
    .conf{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#74718a;text-align:right}
    .eyebrow{font-weight:700;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a9842f;margin-top:20px}
    h1{font-family:'Poppins',sans-serif;font-weight:800;font-size:25px;color:#2c2945;margin:5px 0 4px;line-height:1.12}
    .sub{color:#74718a;font-size:13.5px;margin-bottom:16px}
    .cartouche{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:12.5px}
    .cartouche td{border:1px solid #e7e5f1;padding:7px 11px}
    .cartouche td:first-child{background:#f6f5fb;font-weight:600;color:#3a3658;width:165px}
    h2{font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#2c2945;margin:22px 0 8px;padding-left:12px;border-left:5px solid #6e5cc4}
    h3{font-size:13.5px;color:#3a3658;background:#f4f2fb;border-left:4px solid #c7a14a;padding:6px 10px;margin:14px 0 5px}
    p{margin:8px 0}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 12px}
    table th{background:#3a3658;color:#fff;text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}
    table td{border-bottom:1px solid #f0eef7;padding:8px 10px;vertical-align:top}
    tr{break-inside:avoid}
    .pill{display:inline-block;font-weight:600;font-size:11px;padding:2px 9px;border-radius:99px;background:#eef;color:#3a3a6a}
    .pill.done{background:#e2f3ea;color:#1f8a5f}.pill.prog{background:#e6effb;color:#2f5fa8}
    .pill.todo{background:#fbf0e2;color:#b07423}.pill.block{background:#fbe6e3;color:#c0392b}
    .muted{color:#8a8799}
    .foot{margin-top:28px;border-top:1px solid #e7e5f1;padding-top:12px;display:flex;justify-content:space-between;font-size:10.5px;color:#74718a}
    @page{margin:13mm 12mm}
    @media print{.page{padding:0;max-width:none}}`;
  const cart = (cartouche && cartouche.length)
    ? `<table class="cartouche">${cartouche.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`
    : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">${fonts}<title> </title><style>${css}</style></head>
  <body><div class="page">
    <div class="top"><div class="brand"><img src="${LOGO_DATA_URI}" alt="Armonie"></div><div class="conf">Armonie Group · Confidentiel<br>${esc(date)}</div></div>
    ${kicker ? `<div class="eyebrow">${esc(kicker)}</div>` : ""}
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
    ${cart}
    ${bodyHtml}
    <div class="foot"><span>${etabliPar ? "Établi par " + esc(etabliPar) : "Armonie Group"}</span><span>cp|WIRE · document de travail · à valider</span></div>
  </div></body></html>`;
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
