// utils.js — helpers partagés.
export function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  // Titre vide -> l'en-tête d'impression du navigateur n'affiche plus le nom du document.
  try { w.document.title = " "; } catch { /* ignore */ }
  w.focus();
  setTimeout(() => { try { w.document.title = " "; } catch { /* */ } w.print(); }, 400);
}

export function frDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fr-FR"); } catch { return iso; }
}

// Échappe le HTML (pour insérer du texte utilisateur dans un document).
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}

// Construit un document autonome (charte légère cp|WIRE) à imprimer / télécharger.
// bodyHtml : fragment HTML déjà constitué (titres <h2>, <table>, <p>…).
export function buildSimpleDoc({ title, subtitle = "", bodyHtml = "" }) {
  const date = new Date().toLocaleString("fr-FR");
  const css = `*{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#2a2937;font-size:13px;margin:0;padding:30px;line-height:1.5}
    h1{font-size:20px;color:#2c2945;margin:0 0 2px}
    .sub{color:#6b6880;margin:0 0 16px;font-size:13px}
    h2{font-size:14px;color:#2c2945;border-left:4px solid #6e5cc4;padding-left:10px;margin:20px 0 8px}
    table{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:12px}
    th{background:#f5f4fb;text-align:left;padding:7px 9px;border:1px solid #e6e3f2;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#5a5870}
    td{padding:7px 9px;border:1px solid #efedf7;vertical-align:top}
    tr{break-inside:avoid}
    .pill{display:inline-block;font-weight:600;font-size:11px;padding:2px 9px;border-radius:99px;background:#eef;color:#3a3a6a}
    .muted{color:#8a8799}
    .foot{margin-top:26px;border-top:1px solid #e6e3f2;padding-top:10px;color:#9b98ad;font-size:10.5px;display:flex;justify-content:space-between}
    @page{margin:14mm 13mm}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title> </title><style>${css}</style></head><body>
    <h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
    ${bodyHtml}
    <div class="foot"><span>cp|WIRE — Armonie Group · document de travail</span><span>${esc(date)}</span></div>
  </body></html>`;
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
