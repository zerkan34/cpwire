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
