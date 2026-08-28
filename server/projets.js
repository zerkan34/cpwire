// Suivi de projets : la couche commerciale (projets.json) enrichie EN TEMPS RÉEL
// par les données Jira (activité, recette, retards) et, pour Tafanel, par le
// référentiel de recette. L'outil "pense comme le CP" mais reste honnête : les
// chiffres d'avancement/santé sont confrontés à la réalité des tickets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { crossReferentiel } from "./referentiel.js";
import { buildDoc } from "./docgen.js";
import { ARMONIE_PALETTE as P } from "../shared/armonie-palette.js";
import { VALIDES as DONE } from "../shared/groupes.js";
import { escHtml } from "../shared/texte.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const P_PATH = path.join(__dirname, "projets.json");
const A_PATH = path.join(__dirname, "acces.json");

export function loadProjets() {
  try { return JSON.parse(fs.readFileSync(P_PATH, "utf8")); }
  catch { return { projets: [] }; }
}
export function loadAcces() {
  try { return JSON.parse(fs.readFileSync(A_PATH, "utf8")); }
  catch { return {}; }
}

const ACTIVE = ["encours", "retourTest", "retourProd"];
const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];
const RETOUR = ["retourTest", "retourProd"];
const ETATS = ["AVV Pipe", "Propal envoyée", "Signé", "En cours", "Terminé"];
const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);

// Pouls Jira d'un client (à partir des tickets de son dossier).
function jiraPulse(issues, client) {
  const cu = String(client).toUpperCase();
  const sub = (issues || []).filter((i) => String(i.dossier || "").toUpperCase() === cu);
  if (!sub.length) return { present: false, total: 0 };
  const cnt = (cats) => sub.filter((i) => cats.includes(i.categorie)).length;
  let last = null;
  for (const i of sub) { const d = i.maj ? new Date(i.maj) : null; if (d && (!last || d > last)) last = d; }
  return {
    present: true, total: sub.length,
    actifs: cnt(ACTIVE), recette: cnt(RECETTE), done: cnt(DONE),
    retours: cnt(RETOUR), retard: sub.filter((i) => i.enRetard).length,
    lastActivity: last ? last.toISOString() : null,
  };
}

export function buildProjets(issues) {
  const ref = loadProjets();
  const ACCES = loadAcces();
  const projets = ref.projets || [];

  // --- groupement par client (ordre d'apparition) ---
  const order = [];
  const byClient = {};
  for (const p of projets) {
    if (!byClient[p.client]) { byClient[p.client] = []; order.push(p.client); }
    byClient[p.client].push(p);
  }

  const clients = order.map((client) => {
    const items = byClient[client];
    const fin = items.reduce((a, p) => ({
      budgete: a.budgete + num(p.budgete), facture: a.facture + num(p.facture), jh: a.jh + num(p.jh),
    }), { budgete: 0, facture: 0, jh: 0 });
    const pulse = jiraPulse(issues, client);

    // Enrichissement recette réel (clients dotés d'un référentiel, ex. Tafanel)
    let recette = null;
    try {
      const cross = crossReferentiel(issues || [], client.charAt(0) + client.slice(1).toLowerCase()); // "TAFANEL" -> "Tafanel"
      if (cross && cross.domaines && cross.domaines.length) {
        let total = 0, done = 0, enRec = 0, retours = 0;
        for (const d of cross.domaines) for (const o of d.options) {
          total += o.total; done += o.done; enRec += o.enRecette; retours += o.retours;
        }
        recette = { nbOptions: cross.nbOptions, nbProgrammes: total, done, enRecette: enRec, retours,
          pct: total ? Math.round((done / total) * 100) : 0, majSource: cross.majSource || "" };
      }
    } catch { /* pas de référentiel pour ce client */ }

    const projetsOut = items.map((p) => {
      const reste = (p.budgete == null && p.facture == null) ? null : num(p.budgete) - num(p.facture);
      return { ...p, reste };
    });

    // santé "data" suggérée : rouge si retards/retours marqués, orange si quelques retours
    let sante = "neutre";
    if (pulse.present) {
      if (pulse.retard >= 3 || pulse.retours >= 5) sante = "rouge";
      else if (pulse.retard >= 1 || pulse.retours >= 1) sante = "orange";
      else sante = "vert";
    }

    return { client, type: items[0].type, cdp: items[0].cdp || "", finances: fin, jira: pulse, recette, santeData: sante, acces: ACCES[client] || null, projets: projetsOut };
  });

  // --- KPIs globaux ---
  const all = projets;
  const kpis = {
    budgete: all.reduce((s, p) => s + num(p.budgete), 0),
    facture: all.reduce((s, p) => s + num(p.facture), 0),
    jh: all.reduce((s, p) => s + num(p.jh), 0),
    nbProjets: all.length,
    actifs: all.filter((p) => p.etat === "En cours").length,
    nbClients: order.length,
  };
  kpis.reste = kpis.budgete - kpis.facture;

  // --- pipeline (funnel commercial) ---
  const pipeline = ETATS.map((etat) => {
    const sub = all.filter((p) => p.etat === etat);
    return { etat, n: sub.length, montant: sub.reduce((s, p) => s + num(p.budgete), 0) };
  });

  // --- récap : ce qui demande l'attention du CP ---
  const alertes = [];
  for (const c of clients) {
    for (const p of c.projets) {
      if (p.reste != null && p.reste < 0)
        alertes.push({ client: c.client, projet: p.nom, perimetre: p.perimetre, etat: p.etat, niveau: "orange", type: "Sur-facturation", detail: `Facturé dépasse le budget de ${Math.abs(p.reste).toLocaleString("fr-FR")} € (avenant à border)` });
      if (p.meteo === "rouge")
        alertes.push({ client: c.client, projet: p.nom, perimetre: p.perimetre, etat: p.etat, niveau: "rouge", type: "Météo rouge", detail: (p.attention || [])[0] || "Action corrective requise" });
      else if (p.meteo === "orange")
        alertes.push({ client: c.client, projet: p.nom, perimetre: p.perimetre, etat: p.etat, niveau: "orange", type: "Vigilance", detail: (p.attention || [])[0] || "Point de vigilance" });
    }
  }
  const niveauRank = { rouge: 0, orange: 1 };
  alertes.sort((a, b) => (niveauRank[a.niveau] - niveauRank[b.niveau]));
  const recap = {
    alertes,
    aSigner: all.filter((p) => p.etat === "Propal envoyée" || p.etat === "AVV Pipe").length,
    montantPipe: all.filter((p) => p.etat === "Propal envoyée" || p.etat === "AVV Pipe").reduce((s, p) => s + num(p.budgete), 0),
    enRetard: clients.reduce((s, c) => s + ((c.jira && c.jira.retard) || 0), 0),
  };

  return { majSource: ref.majSource || "", generatedAt: new Date().toISOString(), kpis, pipeline, recap, clients };
}

// Export Excel (exceljs) — calé sur le classeur de référence Armonie :
// en-tête indigo #4B3F8F, bande KPI lilas, fills d'état, météo, databar d'avancement.
const INDIGO = "FF4B3F8F", LILAS = "FFF5F2FC", ROWALT = "FFFBFAFE", MUTED = "FF74718A", INK = "FF2C2945", GOLD = "FFC7A14A", RED = "FFC0392B";
const ETAT_FILL = { "Terminé": "FFE4F4EA", "Mise en prod": "FFE4F4EA", "En cours": "FFE7EAFB", "Signé": "FFFBF2DC", "Propal envoyée": "FFFBE9D8", "AVV Pipe": "FFECEDF3" };
const ETAT_FONT = { "Terminé": "FF1F7A44", "Mise en prod": "FF1F7A44", "En cours": "FF3A3D9E", "Signé": "FF8A6A1E", "Propal envoyée": "FFB0581A", "AVV Pipe": "FF6B6880" };
const METEO_EMO = { vert: "🟢", orange: "🟠", rouge: "🔴", neutre: "⚪" };

export async function projetsWorkbookBuffer(issues) {
  const d = buildProjets(issues);
  const wb = new ExcelJS.Workbook();
  wb.creator = "cp|WIRE"; wb.created = new Date();

  // ---------- Feuille SUIVI ----------
  const ws = wb.addWorksheet("Suivi de projets", { views: [{ state: "frozen", ySplit: 8 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const COLS = [
    { h: "Client", w: 12 }, { h: "CDP", w: 11 }, { h: "Projet", w: 28 }, { h: "Périmètre / Phase", w: 26 },
    { h: "État", w: 15 }, { h: "Météo", w: 7 }, { h: "N° projet", w: 13 }, { h: "Début", w: 9 }, { h: "Fin", w: 9 },
    { h: "J/H", w: 6 }, { h: "Budgété", w: 12 }, { h: "Facturé", w: 12 }, { h: "Reste à fact.", w: 13 }, { h: "Avanc.", w: 12 },
    { h: "Points d'attention", w: 40 }, { h: "Reste à faire", w: 34 }, { h: "Commentaires", w: 24 },
  ];
  ws.columns = COLS.map((c) => ({ width: c.w }));
  const N = COLS.length, lastCol = String.fromCharCode(64 + N);

  // Bandeau titre
  ws.mergeCells(`A1:${lastCol}1`); ws.mergeCells(`A2:${lastCol}2`); ws.mergeCells(`A3:${lastCol}3`);
  const t = ws.getCell("A1"); t.value = "SUIVI DE PROJETS"; t.font = { name: "Poppins", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } }; t.alignment = { vertical: "middle", indent: 1 }; ws.getRow(1).height = 30;
  const st = ws.getCell("A2"); st.value = "Portefeuille Armonie — vue chef de projet · données confrontées à Jira";
  st.font = { name: "Inter", size: 10, color: { argb: "FFE4E2F2" } }; st.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } }; st.alignment = { indent: 1 };
  const dt = ws.getCell("A3"); dt.value = `Généré le ${new Date().toLocaleDateString("fr-FR")}`;
  dt.font = { name: "Inter", size: 9, color: { argb: "FFCFC9EC" } }; dt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } }; dt.alignment = { indent: 1 };

  // Bande KPI (ligne 5-6) : 6 cartes
  const kpis = [["Budget total", d.kpis.budgete, 1], ["Facturé", d.kpis.facture, 1], ["Reste à facturer", d.kpis.reste, 1],
    ["J/H vendus", d.kpis.jh, 0], ["Projets actifs", d.kpis.actifs, 0], ["Clients", d.kpis.nbClients, 0]];
  const span = Math.max(1, Math.floor(N / 6));
  kpis.forEach((k, i) => {
    const c0 = i * span + 1, c1 = i === 5 ? N : c0 + span - 1;
    const a = ws.getRow(5).getCell(c0), b = ws.getRow(6).getCell(c0);
    ws.mergeCells(5, c0, 5, c1); ws.mergeCells(6, c0, 6, c1);
    a.value = k[1]; if (k[2]) a.numFmt = '#,##0 "€"';
    a.font = { name: "Poppins", size: 15, bold: true, color: { argb: INDIGO } }; a.alignment = { indent: 1, vertical: "middle" };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LILAS } };
    b.value = k[0].toUpperCase(); b.font = { name: "Inter", size: 8, color: { argb: MUTED } }; b.alignment = { indent: 1 };
    b.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LILAS } };
  });
  ws.getRow(5).height = 24;

  // En-tête tableau (ligne 8)
  const hr = ws.getRow(8);
  COLS.forEach((c, i) => {
    const cell = hr.getCell(i + 1); cell.value = c.h;
    cell.font = { name: "Inter", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    cell.alignment = { vertical: "middle", horizontal: [10, 11, 12, 13, 14].includes(i) ? "right" : "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  });
  hr.height = 22;

  // Lignes projets
  let r = 9;
  for (const c of d.clients) for (const p of c.projets) {
    const row = ws.getRow(r);
    const vals = [c.client, c.cdp || "", p.nom, p.perimetre || "", p.etat, METEO_EMO[p.meteo] || "", p.num || "",
      p.debut || "", p.fin || "", p.jh ?? "", p.budgete ?? "", p.facture ?? "", p.reste ?? "",
      p.avancement != null ? p.avancement : "", (p.attention || []).join(" • "), (p.raf || []).join(" • "), p.comment || ""];
    vals.forEach((v, i) => { row.getCell(i + 1).value = v; });
    if (r % 2) for (let i = 1; i <= N; i++) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROWALT } };
    // styles colonnes
    row.getCell(1).font = { bold: true, color: { argb: INK } };
    row.getCell(3).font = { bold: true, color: { argb: INK } };
    row.getCell(7).font = { name: "Consolas", size: 9, color: { argb: MUTED } };
    const e = row.getCell(5); const ef = ETAT_FILL[p.etat];
    if (ef) { e.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ef } }; e.font = { bold: true, size: 9, color: { argb: ETAT_FONT[p.etat] || INK } }; e.alignment = { horizontal: "center" }; }
    row.getCell(6).alignment = { horizontal: "center" };
    [11, 12, 13].forEach((i) => { row.getCell(i).numFmt = '#,##0 "€"'; row.getCell(i).alignment = { horizontal: "right" }; });
    if (p.reste < 0) { row.getCell(13).font = { bold: true, color: { argb: RED } }; }
    const av = row.getCell(14); av.numFmt = "0 %"; av.alignment = { horizontal: "right" };
    row.getCell(10).alignment = { horizontal: "right" };
    [15, 16, 17].forEach((i) => { row.getCell(i).alignment = { wrapText: true, vertical: "top" }; row.getCell(i).font = { size: 9, color: { argb: "FF555168" } }; });
    row.getCell(8).alignment = { horizontal: "center" }; row.getCell(9).alignment = { horizontal: "center" };
    r++;
  }
  // databar d'avancement (colonne N)
  if (r > 9) ws.addConditionalFormatting({ ref: `N9:N${r - 1}`, rules: [{ type: "dataBar", cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: GOLD } }] });
  ws.autoFilter = `A8:${lastCol}8`;

  // ---------- Feuille SYNTHÈSE ----------
  const sy = wb.addWorksheet("Synthèse");
  sy.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 40 }];
  sy.mergeCells("A1:D1"); const st2 = sy.getCell("A1"); st2.value = "SYNTHÈSE DU PORTEFEUILLE";
  st2.font = { name: "Poppins", size: 15, bold: true, color: { argb: "FFFFFFFF" } }; st2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } }; sy.getRow(1).height = 26; st2.alignment = { vertical: "middle", indent: 1 };
  let rr = 3;
  const addHd = (txt) => { const cc = sy.getCell(`A${rr}`); cc.value = txt; cc.font = { name: "Poppins", bold: true, size: 11, color: { argb: INDIGO } }; sy.getCell(`A${rr}`).border = { bottom: { style: "medium", color: { argb: GOLD } } }; rr += 1; };
  addHd("Pipeline commercial");
  sy.getRow(rr).values = ["Étape", "Affaires", "Montant (€)"]; sy.getRow(rr).font = { bold: true, size: 9, color: { argb: MUTED } }; rr++;
  d.pipeline.forEach((p) => { sy.getRow(rr).values = [p.etat, p.n, p.montant || 0]; sy.getCell(`C${rr}`).numFmt = '#,##0 "€"'; rr++; });
  rr++; addHd("Ce qui demande l'attention");
  if (!d.recap.alertes.length) { sy.getCell(`A${rr}`).value = "Rien d'urgent."; rr++; }
  d.recap.alertes.forEach((a) => { sy.getRow(rr).values = [a.type, a.client, "", `${a.projet}${a.perimetre ? " — " + a.perimetre : ""} · ${a.detail}`]; sy.getCell(`A${rr}`).font = { bold: true, size: 9, color: { argb: a.niveau === "rouge" ? RED : "FFB0581A" } }; rr++; });

  // ---------- Feuille CLIENTS (pouls Jira + finances + recette par client) ----------
  const cl = wb.addWorksheet("Clients", { views: [{ state: "frozen", ySplit: 2 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const CCOLS = [
    { h: "Client", w: 14 }, { h: "Type", w: 13 }, { h: "CDP", w: 17 },
    { h: "Tickets", w: 9 }, { h: "Actifs", w: 8 }, { h: "En recette", w: 11 }, { h: "Retours", w: 9 }, { h: "En retard", w: 10 },
    { h: "Budgété", w: 13 }, { h: "Facturé", w: 13 }, { h: "Reste à fact.", w: 13 }, { h: "J/H", w: 7 },
    { h: "Recette %", w: 10 }, { h: "Options", w: 9 }, { h: "Programmes", w: 12 }, { h: "Santé", w: 13 },
  ];
  cl.columns = CCOLS.map((c) => ({ width: c.w }));
  const CN = CCOLS.length, clLast = String.fromCharCode(64 + CN);
  cl.mergeCells(`A1:${clLast}1`);
  const ct = cl.getCell("A1"); ct.value = "CLIENTS — POULS JIRA & FINANCES"; ct.font = { name: "Poppins", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  ct.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } }; ct.alignment = { vertical: "middle", indent: 1 }; cl.getRow(1).height = 26;
  const chr = cl.getRow(2);
  CCOLS.forEach((c, i) => {
    const cell = chr.getCell(i + 1); cell.value = c.h;
    cell.font = { name: "Inter", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } };
    cell.alignment = { vertical: "middle", horizontal: i >= 3 ? "right" : "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  });
  chr.height = 20;
  const SANTE_LBL = { vert: "🟢 OK", orange: "🟠 Vigilance", rouge: "🔴 Risque", neutre: "⚪ —" };
  let cr = 3;
  for (const c of d.clients) {
    const j = c.jira || {}; const f = c.finances || {}; const reste = num(f.budgete) - num(f.facture); const rec = c.recette;
    const row = cl.getRow(cr);
    const vals = [c.client, c.type || "", c.cdp || "",
      j.present ? j.total : "", j.present ? (j.actifs || 0) : "", j.present ? (j.recette || 0) : "", j.present ? (j.retours || 0) : "", j.present ? (j.retard || 0) : "",
      num(f.budgete), num(f.facture), reste, num(f.jh),
      rec ? rec.pct / 100 : "", rec ? rec.nbOptions : "", rec ? rec.nbProgrammes : "",
      SANTE_LBL[c.santeData] || "⚪ —"];
    vals.forEach((v, i) => { row.getCell(i + 1).value = v; });
    if (cr % 2) for (let i = 1; i <= CN; i++) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROWALT } };
    row.getCell(1).font = { bold: true, color: { argb: INK } };
    [9, 10, 11].forEach((i) => { row.getCell(i).numFmt = '#,##0 "€"'; });
    if (reste < 0) row.getCell(11).font = { bold: true, color: { argb: RED } };
    row.getCell(13).numFmt = "0 %";
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].forEach((i) => { row.getCell(i).alignment = { horizontal: "right" }; });
    cr++;
  }
  cl.autoFilter = `A2:${clLast}2`;

  // ---------- Feuille ACCÈS & CONTACTS ----------
  const ac = wb.addWorksheet("Accès & contacts", { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ac.columns = [{ width: 22 }, { width: 32 }, { width: 46 }];
  ac.mergeCells("A1:C1"); const at = ac.getCell("A1"); at.value = "ACCÈS & CONTACTS";
  at.font = { name: "Poppins", size: 15, bold: true, color: { argb: "FFFFFFFF" } }; at.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INDIGO } }; ac.getRow(1).height = 26; at.alignment = { vertical: "middle", indent: 1 };
  ac.mergeCells("A2:C2"); ac.getCell("A2").value = "Sans secret — identifiants et mots de passe restent dans le gestionnaire de mots de passe."; ac.getCell("A2").font = { name: "Inter", italic: true, size: 9, color: { argb: MUTED } };
  let ar = 4;
  const acLine = (label, value) => {
    const rw = ac.getRow(ar);
    rw.getCell(1).value = label; rw.getCell(1).font = { name: "Inter", size: 9, bold: true, color: { argb: MUTED } }; rw.getCell(1).alignment = { vertical: "top" };
    ac.mergeCells(ar, 2, ar, 3); rw.getCell(2).value = value; rw.getCell(2).alignment = { wrapText: true, vertical: "top" }; rw.getCell(2).font = { size: 10, color: { argb: INK } };
    ar++;
  };
  for (const c of d.clients) {
    const a = c.acces; if (!a) continue;
    ac.mergeCells(ar, 1, ar, 3);
    const h = ac.getRow(ar).getCell(1); h.value = `${c.client}${c.type ? "   ·   " + c.type : ""}${c.cdp ? "   ·   CDP " + c.cdp : ""}`;
    h.font = { name: "Poppins", bold: true, size: 12, color: { argb: INDIGO } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LILAS } }; ac.getRow(ar).height = 20; ar++;
    if (a.contexte) acLine("Contexte", a.contexte);
    if (a.portail && a.portail.nom) acLine("Portail", a.portail.nom + (a.portail.url ? `   (${a.portail.url})` : ""));
    if (a.sharepoint && a.sharepoint.nom) acLine("SharePoint", a.sharepoint.nom + (a.sharepoint.url ? `   (${a.sharepoint.url})` : ""));
    if (a.environnements && a.environnements.length) acLine("Environnements", a.environnements.join("  ·  "));
    if (a.connexion && a.connexion.length) acLine("Connexion", a.connexion.map((x, i) => `${i + 1}. ${x}`).join("\n"));
    const cc = a.contacts || [];
    const cli = cc.filter((x) => /client/i.test(x.cote || "")); const arm = cc.filter((x) => !/client/i.test(x.cote || ""));
    if (cli.length) acLine("Contacts client", cli.map((x) => `${x.nom}${x.role ? " — " + x.role : ""}`).join("\n"));
    if (arm.length) acLine("Contacts Armonie", arm.map((x) => `${x.nom}${x.role ? " — " + x.role : ""}`).join("\n"));
    ar++;
  }

  return await wb.xlsx.writeBuffer();
}

// Document PDF/HTML à la charte Armonie (réutilise docgen.buildDoc -> identique aux CR).
export function projetsDocHtml(issues) {
  const d = buildProjets(issues);
  const eur = (n) => (n == null || n === "" ? "—" : new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/\u202f/g, "\u00a0") + "\u00a0€");
  const PILL = { "Terminé": "done", "Mise en prod": "done", "En cours": "prog", "Signé": "prog", "Propal envoyée": "todo", "AVV Pipe": "todo" };
  const DOT = { vert: "#1f8a5f", orange: "#e0600f", rouge: "#c0392b", neutre: "#c7c4d6" };
  const fr = (s) => { if (!s) return "—"; const x = new Date(s); if (isNaN(x)) return s; return x.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); };
  const cdp = (d.clients[0] && d.clients[0].cdp) || "Nicolas Durand";

  const kpis = [["Budget total", eur(d.kpis.budgete)], ["Facturé", eur(d.kpis.facture)], ["Reste à facturer", eur(d.kpis.reste)],
    ["J/H vendus", String(d.kpis.jh)], ["Projets actifs", String(d.kpis.actifs)], ["Clients", String(d.kpis.nbClients)]];
  const kpiBand = `<div class="pp-kpis">${kpis.map(([l, v]) => `<div class="pp-kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}</div>`;

  const alertes = d.recap.alertes.length
    ? `<table class="pp-tbl"><tbody>${d.recap.alertes.map((a) => `<tr><td class="w-pill"><span class="pill ${a.niveau === "rouge" ? "block" : "todo"}">${escHtml(a.type)}</span></td><td class="w-cli"><b>${escHtml(a.client)}</b></td><td>${escHtml(a.projet)}${a.perimetre ? " · " + escHtml(a.perimetre) : ""}</td><td class="pp-det">${escHtml(a.detail)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="pp-ok">Rien d'urgent — portefeuille sous contrôle.</p>`;
  const pipe = `<table class="pp-tbl pp-pipe"><thead><tr><th>Étape</th><th class="r">Affaires</th><th class="r">Montant</th></tr></thead><tbody>${d.pipeline.map((p) => `<tr><td>${escHtml(p.etat)}</td><td class="r">${p.n}</td><td class="r">${p.montant ? eur(p.montant) : "—"}</td></tr>`).join("")}</tbody></table>`;

  let rows = "";
  for (const c of d.clients) {
    c.projets.forEach((p, i) => {
      rows += `<tr class="${i === 0 ? "grp" : ""}">
        <td class="pp-cli">${i === 0 ? escHtml(c.client) : ""}</td>
        <td class="pp-pj">${escHtml(p.nom)}${p.perimetre ? `<span class="pm">${escHtml(p.perimetre)}</span>` : ""}</td>
        <td><span class="dot" style="background:${DOT[p.meteo] || DOT.neutre}"></span><span class="pill ${PILL[p.etat] || "todo"}">${escHtml(p.etat)}</span></td>
        <td class="pp-num">${escHtml(p.num) || "—"}</td>
        <td class="ctr">${fr(p.debut)}</td>
        <td class="ctr">${fr(p.fin)}</td>
        <td class="r">${p.jh ?? "—"}</td>
        <td class="r">${eur(p.budgete)}</td>
        <td class="r">${eur(p.facture)}</td>
        <td class="r ${p.reste < 0 ? "pp-neg" : ""}">${eur(p.reste)}</td>
        <td class="r">${p.avancement != null ? Math.round(p.avancement * 100) + "\u00a0%" : "—"}</td>
        <td class="pp-att">${(p.attention || []).map(esc).join(" · ") || "—"}</td>
      </tr>`;
    });
  }
  const mainTable = `<table class="pp-main">
    <colgroup><col style="width:8%"><col style="width:18%"><col style="width:9%"><col style="width:9%"><col style="width:5.5%"><col style="width:5.5%"><col style="width:4%"><col style="width:8.5%"><col style="width:8.5%"><col style="width:8.5%"><col style="width:5%"><col style="width:14%"></colgroup>
    <thead><tr><th>Client</th><th>Projet</th><th>État</th><th>N° projet</th><th>Début</th><th>Fin</th><th class="r">J/H</th><th class="r">Budgété</th><th class="r">Facturé</th><th class="r">Reste</th><th class="r">Av.</th><th>Points d'attention</th></tr></thead>
    <tbody>${rows}</tbody></table>`;

  const style = `<style>
    @page{size:A4 landscape;margin:11mm;}
    .page{max-width:none;}
    .pp-kpis{display:flex;margin:14px 0 4px;border:1px solid #e7e5f1;border-radius:12px;overflow:hidden;border-bottom:2px solid ${P.gold};}
    .pp-kpi{flex:1;padding:11px 14px;background:#f8f7fc;border-right:1px solid #ece9f6;}
    .pp-kpi:last-child{border-right:0;}
    .pp-kpi .v{font-family:'Poppins',sans-serif;font-weight:800;font-size:18px;color:${P.navy};white-space:nowrap;}
    .pp-kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${P.muted};margin-top:3px;}
    .pp-main{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;margin:4px 0 14px;}
    .pp-main th{background:${P.navy};color:#fff;font-size:8.5px;text-transform:uppercase;letter-spacing:.02em;font-weight:700;padding:7px 7px;text-align:left;}
    .pp-main th.r{text-align:right;}
    .pp-main td{padding:7px 7px;border-bottom:1px solid #eceaf4;vertical-align:top;line-height:1.3;word-break:normal;overflow-wrap:break-word;}
    .pp-main td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
    .pp-main td.ctr{text-align:center;white-space:nowrap;}
    .pp-main tbody tr:nth-child(even) td{background:#FAF9FD;}
    .pp-main tr.grp td{border-top:2px solid #d8d3ec;}
    .pp-cli{font-family:'Poppins',sans-serif;font-weight:800;color:${P.navy};}
    .pp-pj{font-weight:700;color:${P.navy};} .pp-pj .pm{display:block;color:${P.muted};font-weight:400;font-size:9px;margin-top:1px;}
    .pp-num{font-family:ui-monospace,monospace;color:${P.muted};font-size:9px;white-space:nowrap;}
    .pp-neg{color:#c0392b;font-weight:700;}
    .pp-att{color:#555168;font-size:9.5px;}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle;}
    .pill{vertical-align:middle;}
    .pp-tbl{width:100%;border-collapse:collapse;margin:4px 0 16px;font-size:11px;}
    .pp-tbl th{background:#f6f5fb;color:${P.navy};text-align:left;font-weight:700;padding:6px 9px;border-bottom:2px solid ${P.gold};font-size:9.5px;text-transform:uppercase;}
    .pp-tbl th.r{text-align:right;} .pp-tbl td{padding:6px 9px;border-bottom:1px solid #f0eef7;vertical-align:top;}
    .pp-tbl td.r{text-align:right;white-space:nowrap;} .pp-tbl .w-pill{width:130px;} .pp-tbl .w-cli{width:90px;}
    .pp-pipe{max-width:360px;} .pp-det{color:${P.muted};} .pp-ok{color:#1f8a5f;}
    @media (max-width:480px){ body{background:#fff !important;color:#3d3b4d !important;} .page{padding:16px 12px !important;} h1{color:${P.navy} !important;} h2{color:${P.navy} !important;} h3{color:${P.navy} !important;} .sub,.conf{color:${P.muted} !important;} p,li,td{color:#3d3b4d !important;} .cartouche td:first-child{background:#f6f5fb !important;color:${P.navy} !important;} .pp-main th{background:${P.navy} !important;color:#fff !important;} }
  </style>`;

  const body = `${style}${kpiBand}
    ${mainTable}
    <h2>Ce qui demande l'attention</h2>${alertes}
    <h2>Pipeline commercial</h2>${pipe}`;

  return buildDoc({
    kicker: "Portefeuille de projets",
    title: "Suivi de projets",
    subtitle: "Vue chef de projet — couche commerciale confrontée aux tickets Jira en direct.",
    cartouche: [["Chef de projet", cdp], ["Date", new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })],
      ["Budget total", eur(d.kpis.budgete)], ["Facturé", eur(d.kpis.facture)], ["Reste à facturer", eur(d.kpis.reste)], ["Source", d.majSource || "Jira"]],
    bodyHtml: body,
    etabliPar: cdp,
  });
}
