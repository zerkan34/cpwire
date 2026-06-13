// cra-xlsx.js — construit un CRA à partir d'un fichier Excel/CSV importé.
// Produit EXACTEMENT la même structure que le CRA Jira (byProject / byPerson),
// pour que l'affichage et les exports existants fonctionnent sans changement.
import * as XLSX from "xlsx";

const fmtSeconds = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return m ? `${h}h ${String(m).padStart(2, "0")}` : `${h}h`;
};
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Trouve l'en-tête dont le nom contient l'un des candidats (par ordre de préférence).
function pickCol(headers, cands) {
  for (const c of cands) { const h = headers.find((x) => norm(x).includes(c)); if (h) return h; }
  return null;
}

// Convertit une valeur de durée en heures décimales. Gère : nombre, "2,5", "1:30",
// "1h30", "90m", "1j 2h" (jour = base heures). Renvoie un nombre d'heures.
function parseHours(v, unit, basis) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return unit === "days" ? v * basis : v;
  let s = String(v).trim().toLowerCase().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(s)) { const n = parseFloat(s); return unit === "days" ? n * basis : n; }
  const hm = s.match(/^(\d+):(\d{1,2})$/); if (hm) return parseInt(hm[1], 10) + parseInt(hm[2], 10) / 60;
  const hmm = s.match(/(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})\b/); if (hmm) return parseFloat(hmm[1]) + parseInt(hmm[2], 10) / 60;
  let total = 0, found = false;
  const dd = s.match(/(\d+(?:\.\d+)?)\s*(?:j|d)\b/); if (dd) { total += parseFloat(dd[1]) * basis; found = true; }
  const hh = s.match(/(\d+(?:\.\d+)?)\s*h/); if (hh) { total += parseFloat(hh[1]); found = true; }
  const mm = s.match(/(\d+(?:\.\d+)?)\s*m(?:in)?\b/); if (mm) { total += parseFloat(mm[1]) / 60; found = true; }
  return found ? total : 0;
}

// Déduit un statut normalisé + done à partir d'un libellé libre.
function statutFrom(raw) {
  const n = norm(raw);
  if (!n) return { statut: "À faire", done: false, statutJira: "" };
  if (/(termin|fait|done|closed|resolu|clos|ferm|livr|fini|prod)/.test(n)) return { statut: "Terminé", done: true, statutJira: raw };
  if (/(bloqu|block|hold|attente|stand ?by)/.test(n)) return { statut: "Bloqué", done: false, statutJira: raw };
  if (/(cours|progress|doing|wip|dev|test|review|revue|recette)/.test(n)) return { statut: "En cours", done: false, statutJira: raw };
  return { statut: "À faire", done: false, statutJira: raw };
}

// Parseur CSV minimal et robuste (gère les guillemets et le séparateur fourni).
// Renvoie un tableau de lignes (chaque ligne = tableau de cellules, toutes en TEXTE).
function parseCsvText(text, delim) {
  const rows = []; let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export function parseCraXlsx(buffer, { basis = 7 } = {}) {
  // xlsx/xlsm = archive ZIP (« PK »). Sinon CSV/texte → on parse nous-mêmes (séparateur ; , tab ou |),
  // ce qui évite que le moteur tableur ré-interprète « 3,5 » en 35 ou « 2:30 » en date.
  const isZip = buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  let data, delimiter = null;
  if (isZip) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Le fichier ne contient aucune feuille lisible.");
    data = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }); // valeurs telles qu'affichées
  } else {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // enlève le BOM
    const line = text.split(/\r?\n/).find((l) => l.trim()) || "";
    const counts = { ";": (line.match(/;/g) || []).length, ",": (line.match(/,/g) || []).length, "\t": (line.match(/\t/g) || []).length, "|": (line.match(/\|/g) || []).length };
    delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const rows = parseCsvText(text, delimiter);
    if (rows.length < 2) throw new Error("Le fichier CSV semble vide ou ne contient qu'une ligne d'en-tête.");
    const heads = rows[0].map((h) => String(h).trim());
    data = rows.slice(1)
      .filter((r) => r.some((c) => String(c).trim() !== ""))
      .map((r) => { const o = {}; heads.forEach((h, i) => { o[h] = r[i] != null ? r[i] : ""; }); return o; });
  }
  if (!data.length) throw new Error("Aucune ligne de données trouvée dans le fichier.");

  const headers = Object.keys(data[0]);
  const cProj = pickCol(headers, ["projet", "dossier", "client", "project", "application", "appli"]);
  const cWho = pickCol(headers, ["intervenant", "collaborateur", "ressource", "personne", "developpeur", "developpe", "assign", "auteur", "author", "utilisateur", "membre", "consultant", "agent", "nom"]);
  const cKey = pickCol(headers, ["cle", "clef", "ticket", "issue", "key", "numero", "n°"]);
  const cSum = pickCol(headers, ["resume", "sujet", "libelle", "intitule", "titre", "description", "summary", "tache", "activite", "objet", "prestation", "commentaire"]);
  const cTime = pickCol(headers, ["temps", "heures", "heure", "duree", "hours", "time", "charge", "jours", "jour", "day"]);
  const cStat = pickCol(headers, ["statut", "status", "etat", "avancement"]);

  if (!cTime) {
    throw new Error(`Impossible de trouver une colonne de temps. Colonnes détectées : ${headers.join(", ")}. Ajoute une colonne « Temps » (ou « Heures », « Durée », « Jours »).`);
  }
  const unit = /jour|day|\bj\b/.test(norm(cTime)) && !/heure|temps|^h$/.test(norm(cTime)) ? "days" : "hours";

  const personMap = {}; // who -> { who, seconds, projects:{dossier:{dossier,seconds,tickets:{cle:{...}}}} }
  const projectMap = {}; // dossier -> { dossier, seconds, persons:{who:sec}, tickets:{cle:{...}} }
  let totalSeconds = 0, used = 0, ignored = 0;

  data.forEach((row, idx) => {
    const dossier = (cProj && String(row[cProj]).trim()) || "Sans projet";
    const who = (cWho && String(row[cWho]).trim()) || "Non précisé";
    // Ignore les lignes de total / sous-total / cumul d'un export tableur.
    if (/^(total|totaux|sous.?total|cumul|somme)\b/.test(norm(dossier)) || /^(total|totaux)\b/.test(norm(who))) return;
    const hours = parseHours(row[cTime], unit, basis);
    const seconds = Math.round(hours * 3600);
    const resume = (cSum && String(row[cSum]).trim()) || "";
    const cle = (cKey && String(row[cKey]).trim()) || (resume ? resume.slice(0, 40) : `Ligne ${idx + 2}`);
    const { statut, done, statutJira } = statutFrom(cStat ? row[cStat] : "");
    if (seconds <= 0) { ignored += 1; return; } // ligne sans temps valide (vide, titre, total…)
    used += 1;
    totalSeconds += seconds;

    const P = (personMap[who] ||= { who, seconds: 0, projects: {} });
    P.seconds += seconds;
    const PP = (P.projects[dossier] ||= { dossier, seconds: 0, tickets: {} });
    PP.seconds += seconds;
    const PT = (PP.tickets[cle] ||= { cle, resume, statut, statutJira, done, seconds: 0 });
    PT.seconds += seconds;

    const J = (projectMap[dossier] ||= { dossier, seconds: 0, persons: {}, tickets: {} });
    J.seconds += seconds;
    J.persons[who] = (J.persons[who] || 0) + seconds;
    const JT = (J.tickets[cle] ||= { cle, resume, statut, statutJira, done, seconds: 0, who: {} });
    JT.seconds += seconds;
    JT.who[who] = (JT.who[who] || 0) + seconds;
  });

  if (!used) throw new Error("Aucune ligne avec un temps valide n'a été trouvée. Vérifie la colonne des heures/jours.");

  const tList = (tk) => Object.values(tk).sort((a, b) => b.seconds - a.seconds)
    .map((t) => ({ ...t, time: fmtSeconds(t.seconds), who: t.who ? Object.keys(t.who) : undefined }));
  const byPerson = Object.values(personMap).map((p) => ({
    who: p.who, seconds: p.seconds, time: fmtSeconds(p.seconds),
    projects: Object.values(p.projects).sort((a, b) => b.seconds - a.seconds)
      .map((pr) => ({ dossier: pr.dossier, seconds: pr.seconds, time: fmtSeconds(pr.seconds), tickets: tList(pr.tickets) })),
  })).sort((a, b) => b.seconds - a.seconds);
  const byProject = Object.values(projectMap).map((pr) => ({
    dossier: pr.dossier, seconds: pr.seconds, time: fmtSeconds(pr.seconds),
    persons: Object.entries(pr.persons).map(([who, sec]) => ({ who, seconds: sec, time: fmtSeconds(sec) })).sort((a, b) => b.seconds - a.seconds),
    tickets: tList(pr.tickets),
  })).sort((a, b) => b.seconds - a.seconds);

  const warnings = [];
  if (!cProj) warnings.push("Aucune colonne « Projet / Dossier » détectée — tout est regroupé sous « Sans projet ».");
  if (!cWho) warnings.push("Aucune colonne « Intervenant » détectée — tout est regroupé sous « Non précisé ».");
  if (!cStat) warnings.push("Aucune colonne « Statut » détectée — les statuts ne sont pas affichés.");

  return {
    source: "excel", configured: true, totalSeconds, totalTime: fmtSeconds(totalSeconds),
    byPerson, byProject, scanned: used, total: used, ignored, capped: false,
    fileKind: isZip ? "xlsx" : "csv", delimiter,
    columns: { projet: cProj, personne: cWho, cle: cKey, resume: cSum, temps: cTime, statut: cStat, unite: unit },
    warnings,
  };
}
