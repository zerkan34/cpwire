// utils.js — helpers partagés.
import { charterDoc, logoLockup, eyebrow, kpiBand, C } from "./charter.js";

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
export function frDateFromIso(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ""); }

export function buildSimpleDoc({ kicker = "", title, subtitle = "", cartouche = [], bodyHtml = "", etabliPar = "Nicolas Durand", kpis = null }) {
  const dateLong = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const dateNum = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sign = esc(String(etabliPar || "Nicolas Durand").replace(/\s+(\S+)$/, (m, p) => " " + p.toUpperCase()));
  const cleanTitle = esc(String(title == null ? "" : title).replace(/\s+[\u2014\u2013-]\s+/g, " "));
  const meta = (cartouche && cartouche.length)
    ? `<dl class="sd-meta">${cartouche.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
    : "";
  const head = `<div class="sd-head">${logoLockup()}<div class="ch-kicker">${esc(kicker || "Armonie Group")} \u00b7 ${esc(dateNum)}</div></div>`;
  const titleBlock = `<div class="sd-titleblock">${kicker ? eyebrow(kicker) : ""}<h1 class="sd-title">${cleanTitle}</h1>${subtitle ? `<p class="ch-lead">${esc(subtitle)}</p>` : ""}<div class="sd-rule"></div></div>`;
  const kpiHtml = (kpis && kpis.length) ? kpiBand(kpis) : "";
  const estab = `<div class="sd-estab"><span class="ch-estab-l">\u00c9tabli par</span> <b>${sign}</b> \u00b7 Chef de projet (MOE) \u2014 Armonie Group</div>`;
  const extraCss = `
    .sd-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid ${C.line};padding-bottom:14px;margin-bottom:16px}
    .sd-head .ch-kicker{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.gold};font-weight:700;text-align:right;max-width:62mm}
    .sd-title{font-family:Poppins,Inter,sans-serif;font-size:30px;font-weight:800;color:${C.navy};margin:2px 0 0;line-height:1.05;letter-spacing:.2px}
    .sd-rule{width:96px;height:4px;background:${C.gold};border-radius:3px;margin:14px 0 4px}
    .sd-meta{background:${C.soft};border-left:3px solid ${C.gold};border-radius:0 8px 8px 0;padding:14px 18px;margin:18px 0;display:grid;grid-template-columns:155px 1fr;row-gap:8px;column-gap:14px}
    .sd-meta dt{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.indigo};align-self:center}
    .sd-meta dd{margin:0;font-size:12px;color:${C.ink};font-weight:500}
    .ch-body table td{font-size:12px}
    .ch-body .pill{display:inline-block;font-weight:700;font-size:11px;padding:2px 9px;border-radius:99px;background:${C.soft};color:${C.indigo}}
    .ch-body .pill.done{background:#e7f3ec;color:#2f7d4f}
    .ch-body .pill.prog{background:#eef0fb;color:${C.indigo}}
    .ch-body .pill.todo,.ch-body .pill.rec{background:#faf2ea;color:#a9531f}
    .ch-body .pill.block{background:#fbe6e3;color:${C.red}}
    .ch-body td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:${C.navy};width:1%;white-space:nowrap}
    .ch-body th.num{text-align:right;color:#fff}
    .sd-content h2{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:16px;color:${C.navy};margin:22px 0 8px}
    .sd-content h3{font-family:Poppins,Inter,sans-serif;font-size:13px;color:${C.indigo};margin:14px 0 6px}
    .sd-estab{margin-top:26px;border-top:1px solid ${C.line};padding-top:12px;font-size:10.5px;color:${C.muted}}
    .sd-estab .ch-estab-l{display:inline;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${C.gold};font-weight:700}
    .sd-estab b{color:${C.navy};font-weight:800}
  `;
  const footerText = `${cleanTitle} \u00b7 ${esc(dateLong)} \u00b7 Confidentiel`;
  return charterDoc({
    docTitle: String(title || "Document"),
    extraCss,
    bodyHtml: head + titleBlock + kpiHtml + meta + `<div class="sd-content">${bodyHtml}</div>` + estab,
    footerText,
  });
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
