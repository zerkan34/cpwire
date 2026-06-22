// Import de documents : lecture du fichier, analyse IA (proposition), validation + journal.
// SÛRETÉ : rien n'est appliqué silencieusement. `analyzeDocument` ne fait que PROPOSER ;
// `applyImport` n'enregistre qu'après validation explicite de l'utilisateur.
import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";
import { classifyImport } from "./ai.js";

const DIR = dataDir();
const FILE = path.join(DIR, "imports.json");

function load() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { items: [] }; } }
function save(d) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d)); return true; } catch (e) { console.error("imports save:", e.message); return false; } }

const TEXT_EXT = ["csv", "tsv", "txt", "json", "md", "log"];

// Lit le texte d'un buffer si le format est géré ; sinon null (binaire non traité pour l'instant).
export function bufferToText(buffer, filename) {
  const ext = String(filename || "").toLowerCase().split(".").pop();
  if (!TEXT_EXT.includes(ext)) return null;
  return buffer.toString("utf8");
}

function preview(text, maxLines = 30, maxChars = 4000) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, maxLines);
  return lines.join("\n").slice(0, maxChars);
}

// --- Découpe une ligne CSV en champs (gère les guillemets). ---
function splitCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Colonnes de statut du fichier d'arborescence MAX (indice → libellé).
const MAX_STATUS_COLS = [[9, "à modifier"], [10, "en cours"], [11, "terminé à valider"], [12, "sans modif attendue"], [13, "validé"]];

export function looksLikeMax(filename, text) {
  const f = String(filename || "").toLowerCase();
  if (/max/.test(f) && /(arbor|ecran|as400)/.test(f)) return true;
  return /ECRANS\s+MAX/i.test(text.slice(0, 400));
}

// Parse le CSV d'arborescence MAX → [{g2,g3,ecran,ordre,statut}] (même structure que edlMax.json).
export function parseMaxCsv(text) {
  const rows = [];
  let g2 = "", g3 = "";
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (/ECRANS\s+MAX/i.test(raw) && /PRIORITE/i.test(raw)) continue; // ligne d'en-tête / légende
    const c = splitCsvLine(raw).map((s) => String(s || "").replace(/^\uFEFF+/, "").trim());
    if (c[1]) g2 = c[1];
    if (c[3]) g3 = c[3];
    const ecran = c[4];
    if (!ecran) continue;
    let statut = "";
    for (const [idx, label] of MAX_STATUS_COLS) { if ((c[idx] || "").toLowerCase() === "x") { statut = label; break; } }
    if (!statut) continue;
    rows.push({ g2, g3, ecran, ordre: c[7] || "", statut });
  }
  return rows;
}

function maxStats(rows) {
  const by = (s) => rows.filter((r) => r.statut === s).length;
  const inscope = rows.filter((r) => r.statut !== "sans modif attendue").length;
  const val = by("validé");
  return { total: rows.length, valide: val, aValider: by("terminé à valider"), enCours: by("en cours"), aModifier: by("à modifier"), sansModif: by("sans modif attendue"), inscope, pct: inscope ? Math.round((100 * val) / inscope) : 0 };
}

// --- Datasets persistés (résultat d'un import validé, lu par les écrans concernés). ---
function datasetFile(name) { return path.join(DIR, `dataset_${String(name).replace(/[^a-z0-9_]/gi, "")}.json`); }
export function saveDataset(name, rows) {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(datasetFile(name), JSON.stringify({ at: new Date().toISOString(), rows })); return true; }
  catch (e) { console.error("saveDataset:", e.message); return false; }
}
export function getDataset(name) { try { return JSON.parse(fs.readFileSync(datasetFile(name), "utf8")); } catch { return null; } }

// --- Inventaire SharePoint « TMA » : parseur + moteur de diff (façon push Git). ---
export function looksLikeTma(filename, text) {
  const head = text.slice(0, 600);
  return /Chemin d'acc/i.test(head) && /(Type d'élément|État de validation)/i.test(head);
}

// Déduit le dossier/client depuis le chemin SharePoint (best-effort, pour le croisement Jira).
function dossierFromChemin(chemin) {
  const segs = String(chemin || "").split("/").map((s) => s.trim()).filter(Boolean);
  const i = segs.findIndex((s) => /^documents?$/i.test(s));
  return (i >= 0 && segs[i + 1]) ? segs[i + 1] : (segs[1] || "");
}

// Déduit le site SharePoint depuis le chemin (segment après "sites/").
function siteFromChemin(chemin) {
  const m = String(chemin || "").match(/sites\/([^/]+)/i);
  return m ? m[1].trim() : "";
}

export function parseTmaCsv(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let started = false;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const c = splitCsvLine(raw).map((s) => String(s || "").replace(/^\uFEFF+/, "").trim());
    if (!started) { // saute la ligne d'en-tête
      if (/Chemin d'acc/i.test(raw) || /^nom$/i.test(c[0])) { started = true; continue; }
    }
    if (!c[0]) continue;
    rows.push({ nom: c[0], modifie: c[1] || "", modifiePar: c[2] || "", etat: c[3] || "", type: c[4] || "", chemin: c[5] || "", site: siteFromChemin(c[5]), dossier: dossierFromChemin(c[5]) });
  }
  return rows;
}

// Diff entre deux versions : clé = chemin|nom, signature = modifié|état|modifié par.
function diffTma(prevRows, nextRows) {
  const key = (r) => `${r.chemin}|${r.nom}`;
  const sig = (r) => `${r.modifie}|${r.etat}|${r.modifiePar}`;
  const prev = new Map((prevRows || []).map((r) => [key(r), sig(r)]));
  const next = new Map(nextRows.map((r) => [key(r), r]));
  let added = 0, modified = 0; const sample = [];
  for (const [k, r] of next) {
    if (!prev.has(k)) { added++; if (sample.length < 15) sample.push({ kind: "ajout", nom: r.nom, dossier: r.dossier, modifie: r.modifie }); }
    else if (prev.get(k) !== sig(r)) { modified++; if (sample.length < 15) sample.push({ kind: "modif", nom: r.nom, dossier: r.dossier, modifie: r.modifie }); }
  }
  let removed = 0;
  for (const k of prev.keys()) if (!next.has(k)) removed++;
  return { total: nextRows.length, premiereFois: !prevRows, added, modified, removed, sample };
}

export async function analyzeDocument({ filename, buffer }) {
  const text = bufferToText(buffer, filename);
  if (text == null) return { ok: false, error: "Type de fichier non géré pour l'instant. Formats acceptés : CSV, TSV, TXT, JSON, MD." };
  // Type connu : arborescence écrans MAX (EDL) → on parse nous-mêmes, chiffres réels (pas d'IA).
  if (looksLikeMax(filename, text)) {
    const rows = parseMaxCsv(text);
    const s = maxStats(rows);
    return {
      ok: true, filename, chars: text.length, lignes: rows.length,
      apercu: rows.slice(0, 8).map((r) => `${r.ecran} — ${r.statut}`).join("\n"),
      dataset: { name: "edlmax", rows },
      proposal: {
        type: "Arborescence écrans MAX",
        client: "EDL",
        cible: "Met à jour l'écran « Refonte MAX » de la fiche client EDL",
        resume: `${s.total} écrans : ${s.valide} validés, ${s.aValider} à valider, ${s.enCours} en cours, ${s.aModifier} à modifier, ${s.sansModif} sans modif attendue. Avancement ${s.pct}% sur les ${s.inscope} écrans concernés.`,
        details: [
          `${s.valide} validés / ${s.inscope} concernés (${s.pct}%)`,
          `${s.enCours} en cours · ${s.aValider} terminés à valider · ${s.aModifier} à modifier`,
        ],
        confiance: "haute",
      },
    };
  }
  // Type connu : inventaire SharePoint TMA → diff vs dernier import (on ne réécrit que ce qui a bougé).
  if (looksLikeTma(filename, text)) {
    const rows = parseTmaCsv(text);
    const prev = getDataset("sharepoint");
    const diff = diffTma(prev ? prev.rows : null, rows);
    saveDataset("sharepoint__pending", rows); // stocké côté serveur ; promu seulement à la validation
    const chg = diff.premiereFois
      ? `${diff.total} éléments importés (premier dépôt — référence initiale).`
      : `${diff.added} ajouté${diff.added > 1 ? "s" : ""}, ${diff.modified} modifié${diff.modified > 1 ? "s" : ""}, ${diff.removed} supprimé${diff.removed > 1 ? "s" : ""} depuis le dernier import (${diff.total} éléments au total).`;
    const sites = [...new Set(rows.map((r) => r.site).filter(Boolean))];
    return {
      ok: true, filename, chars: text.length, lignes: rows.length,
      apercu: diff.sample.map((s) => `${s.kind === "ajout" ? "+ " : "~ "}${s.nom}${s.dossier ? ` · ${s.dossier}` : ""}`).join("\n") || "Aucun changement détecté.",
      dataset: { name: "sharepoint", promoteFrom: "sharepoint__pending", count: rows.length },
      diff,
      proposal: {
        type: "Inventaire SharePoint",
        client: sites.length === 1 ? sites[0] : "Tous sites",
        cible: "Met à jour les données croisées SharePoint × Jira (diff incrémental)",
        resume: chg,
        details: diff.premiereFois ? [`${diff.total} éléments enregistrés comme référence.`] : [`${diff.added} ajout(s) · ${diff.modified} modif(s) · ${diff.removed} suppression(s)`, `Total courant : ${diff.total} éléments.`],
        confiance: "haute",
      },
    };
  }
  const sample = preview(text);
  const lignes = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const proposal = await classifyImport(filename, sample);
  return { ok: true, filename, chars: text.length, lignes, apercu: sample.slice(0, 1500), proposal };
}

export function applyImport({ filename, proposal, apercu, dataset, diff, by }) {
  const store = load();
  const entry = {
    id: Date.now().toString(36),
    at: new Date().toISOString(),
    by: by || "",
    filename: filename || "document",
    proposal: proposal || {},
    apercu: (apercu || "").slice(0, 1500),
    dataset: dataset && dataset.name ? { name: dataset.name, count: dataset.count || (Array.isArray(dataset.rows) ? dataset.rows.length : 0) } : null,
    diff: diff ? { added: diff.added || 0, modified: diff.modified || 0, removed: diff.removed || 0, total: diff.total || 0 } : null,
  };
  store.items = [entry, ...(store.items || [])].slice(0, 100);
  save(store);
  // Promotion d'un dataset préparé côté serveur (gros volumes : pas de rows dans la requête).
  if (dataset && dataset.promoteFrom) {
    const pend = getDataset(dataset.promoteFrom);
    if (pend && Array.isArray(pend.rows)) saveDataset(dataset.name, pend.rows);
  } else if (dataset && dataset.name && Array.isArray(dataset.rows) && dataset.rows.length) {
    // Type connu de petit volume : on déverse directement les lignes.
    saveDataset(dataset.name, dataset.rows);
  }
  return entry;
}

export function listImports() { return load().items || []; }
