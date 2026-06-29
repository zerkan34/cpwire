// planning.js — ingestion « intelligente » d'un planning fourni (CSV, même mal structuré :
// lignes vides, en-têtes décalés, cellules multi-lignes, marqueurs DATE IMPÉRATIVE / Go-noGo / KO / NOGO).
// Produit une liste d'items normalisés que l'app affiche à sa charte.

// --- Parseur CSV robuste (gère guillemets, virgules internes, sauts de ligne, \r\n, BOM) ---
export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, "");
  const rows = []; let row = []; let cur = ""; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* ignore, géré par \n */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const DATE_RE = /^\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/;
const isDate = (v) => DATE_RE.test(String(v || "").trim());
const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const isEmptyRow = (r) => r.every((c) => !clean(c));

// Déduit le statut d'une ligne à partir des colonnes d'état (non commencé / en cours / terminé / validé)
// et des marqueurs libres (KO, NOGO, GO, « fait, à contrôler »…).
function deriveStatus(cells) {
  const joined = cells.slice(5).map(clean).join(" ").toUpperCase();
  if (/NOGO|NO-GO|NO GO/.test(joined)) return { label: "No-Go", kind: "block" };
  if (/\bKO\b/.test(joined)) return { label: "KO", kind: "block" };
  if (/\bGO\b/.test(joined)) return { label: "Go", kind: "done" };
  const c5 = clean(cells[5]), c6 = clean(cells[6]), c7 = clean(cells[7]), c8 = clean(cells[8]);
  if (c8) return { label: "Validé", kind: "done" };
  if (c7) return { label: /contr/i.test(c7) ? "Fait, à contrôler" : "Terminé, à valider", kind: "rec" };
  if (c6) return { label: "En cours", kind: "prog" };
  if (c5) return { label: "Non commencé", kind: "todo" };
  return null;
}

export function parsePlanning(text) {
  const rows = parseCsv(text);
  let title = "Planning";
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const joined = rows[i].map(clean).join(" ");
    if (/^PLANNING/i.test(joined) && headerIdx < 0 && !/date pr/i.test(joined)) title = clean(rows[i][0]) || title;
    if (/date pr[ée]vue/i.test(joined)) { headerIdx = i; break; }
  }
  const start = headerIdx >= 0 ? headerIdx + 1 : 1;

  const items = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (isEmptyRow(r)) continue;
    const c0 = clean(r[0]), c1 = clean(r[1]), c2 = clean(r[2]), c3 = clean(r[3]), c4 = clean(r[4]);

    // Ligne « note » : pas de date ni de titre principal → rattachée à l'item précédent
    const hasDate = isDate(c0);
    const titleMain = c3 || c4;
    const status = deriveStatus(r);

    // ligne « date seule » en col1 (ex: ,17/08,,,) → glissement de l'item précédent
    if (!hasDate && !titleMain && !status && isDate(c1) && items.length) {
      const prev = items[items.length - 1];
      prev.newDate = c1; prev.slip = true; prev.notes.push("Reporté au " + c1);
      continue;
    }

    // ligne purement annotation (ex: "14h", ou détails "écrans AS400…") → on l'accroche au précédent
    if (!hasDate && !status && (c0 || titleMain) && items.length) {
      const extra = [c0, c3, c4].filter(Boolean).join(" — ");
      if (extra) items[items.length - 1].notes.push(extra);
      continue;
    }

    const imperative = /imp[ée]rative/i.test(c1);
    const gate = /go\s*\/?\s*nogo|go\/nogo/i.test(c1) || /go.?no.?go/i.test(titleMain);
    const newDate = isDate(c1) ? c1 : "";          // retard → nouvelle date
    const slip = !!newDate;

    items.push({
      datePrevue: hasDate ? c0 : "",
      timeNote: !hasDate && /h$/i.test(c0) ? c0 : "",
      newDate,
      dateEffective: isDate(c2) ? c2 : "",
      title: titleMain || (imperative ? "Jalon impératif" : gate ? "Go / No-Go" : ""),
      detail: c3 && c4 ? c4 : "",
      status: status ? status.label : "",
      statusKind: status ? status.kind : "",
      imperative,
      gate,
      slip,
      notes: [],
    });
  }
  // Heuristique glissement global : une ligne « ,17/08,,, » seule après la mise en prod → reporte la date
  return { title, items: items.filter((it) => it.title || it.datePrevue) };
}
