// Suivi de projets : la couche commerciale (projets.json) enrichie EN TEMPS RÉEL
// par les données Jira (activité, recette, retards) et, pour Tafanel, par le
// référentiel de recette. L'outil "pense comme le CP" mais reste honnête : les
// chiffres d'avancement/santé sont confrontés à la réalité des tickets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { crossReferentiel } from "./referentiel.js";
import { buildDoc } from "./docgen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const P_PATH = path.join(__dirname, "projets.json");

export function loadProjets() {
  try { return JSON.parse(fs.readFileSync(P_PATH, "utf8")); }
  catch { return { projets: [] }; }
}

const ACTIVE = ["encours", "retourTest", "retourProd"];
const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];
const DONE = ["termine", "miseEnProd"];
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

    return { client, type: items[0].type, cdp: items[0].cdp || "", finances: fin, jira: pulse, recette, santeData: sante, projets: projetsOut };
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

// Export Excel (SheetJS) : feuille Synthèse + feuille Suivi détaillée.
export function projetsWorkbookBuffer(issues) {
  const d = buildProjets(issues);
  const wb = XLSX.utils.book_new();

  // Synthèse
  const syn = [
    ["SUIVI DE PROJETS — Synthèse", ""],
    ["Généré le", new Date().toLocaleString("fr-FR")],
    [],
    ["Indicateur", "Valeur"],
    ["Budget total (€)", d.kpis.budgete],
    ["Facturé (€)", d.kpis.facture],
    ["Reste à facturer (€)", d.kpis.reste],
    ["J/H vendus", d.kpis.jh],
    ["Projets actifs", d.kpis.actifs],
    ["Clients", d.kpis.nbClients],
    [],
    ["Pipeline", "Nb", "Montant (€)"],
    ...d.pipeline.map((p) => [p.etat, p.n, p.montant]),
    [],
    ["Ce qui demande attention", "Client", "Projet", "Détail"],
    ...d.recap.alertes.map((a) => [a.type, a.client, `${a.projet}${a.perimetre ? " — " + a.perimetre : ""}`, a.detail]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(syn), "Synthèse");

  // Suivi détaillé
  const head = ["Client", "Type", "Projet", "Périmètre / Phase", "État", "Météo", "N° projet", "Début", "Fin", "J/H", "Budgété (€)", "Facturé (€)", "Reste à fact. (€)", "Avancement %", "Points d'attention", "Reste à faire", "Commentaire"];
  const rows = [head];
  for (const c of d.clients) for (const p of c.projets) {
    rows.push([c.client, p.type, p.nom, p.perimetre || "", p.etat, p.meteo, p.num || "", p.debut || "", p.fin || "",
      p.jh ?? "", p.budgete ?? "", p.facture ?? "", p.reste ?? "", p.avancement != null ? Math.round(p.avancement * 100) : "",
      (p.attention || []).join(" • "), (p.raf || []).join(" • "), p.comment || ""]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [12, 8, 26, 28, 14, 8, 13, 11, 11, 6, 12, 12, 13, 11, 40, 34, 22].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Suivi");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Document PDF/HTML à la charte Armonie (réutilise docgen.buildDoc -> identique aux CR).
export function projetsDocHtml(issues) {
  const d = buildProjets(issues);
  const eur = (n) => (n == null ? "—" : new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " €");
  const PILL = { "Terminé": "done", "Mise en prod": "done", "En cours": "prog", "Signé": "prog", "Propal envoyée": "todo", "AVV Pipe": "todo" };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const meteoDot = (m) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${({ vert: "#1f8a5f", orange: "#e0600f", rouge: "#c0392b" }[m]) || "#c7c4d6"};vertical-align:middle"></span>`;

  const kpis = [["Budget total", eur(d.kpis.budgete)], ["Facturé", eur(d.kpis.facture)], ["Reste à facturer", eur(d.kpis.reste)],
    ["J/H vendus", d.kpis.jh], ["Projets actifs", d.kpis.actifs], ["Clients", d.kpis.nbClients]];
  const kpiRow = `<div class="kpi-row">${kpis.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}</div>`;

  const alertes = d.recap.alertes.length
    ? `<ul class="pp-al">${d.recap.alertes.map((a) => `<li><span class="pill ${a.niveau === "rouge" ? "block" : "todo"}">${esc(a.type)}</span> <b>${esc(a.client)}</b> — ${esc(a.projet)}${a.perimetre ? " · " + esc(a.perimetre) : ""} <span class="pp-det">${esc(a.detail)}</span></li>`).join("")}</ul>`
    : `<p class="pp-ok">Rien d'urgent — portefeuille sous contrôle.</p>`;

  const pipe = `<table class="pp-tbl"><thead><tr><th>Étape</th><th class="r">Affaires</th><th class="r">Montant</th></tr></thead><tbody>${d.pipeline.map((p) => `<tr><td>${esc(p.etat)}</td><td class="r">${p.n}</td><td class="r">${p.montant ? eur(p.montant) : "—"}</td></tr>`).join("")}</tbody></table>`;

  const clientsHtml = d.clients.map((c) => {
    const rows = c.projets.map((p) => `<tr>
      <td><b>${esc(p.nom)}</b>${p.perimetre ? `<br><span class="pp-sub">${esc(p.perimetre)}</span>` : ""}</td>
      <td>${meteoDot(p.meteo)} <span class="pill ${PILL[p.etat] || "todo"}">${esc(p.etat)}</span></td>
      <td class="mono">${esc(p.num)}</td>
      <td class="r">${p.jh ?? "—"}</td>
      <td class="r">${eur(p.budgete)}</td>
      <td class="r">${eur(p.facture)}</td>
      <td class="r ${p.reste < 0 ? "neg" : ""}">${eur(p.reste)}</td>
      <td class="r">${p.avancement != null ? Math.round(p.avancement * 100) + " %" : "—"}</td>
      <td>${(p.attention || []).map(esc).join(" • ") || "—"}</td>
    </tr>`).join("");
    const rec = c.recette ? ` · recette ${c.recette.pct} % (${c.recette.nbProgrammes} prog.)` : "";
    return `<h2>${esc(c.client)} <span class="pp-cdp">CDP ${esc(c.cdp || "—")} · ${esc(c.type)}${rec}</span></h2>
    <table class="pp-tbl"><thead><tr><th>Projet</th><th>État</th><th>N° projet</th><th class="r">J/H</th><th class="r">Budgété</th><th class="r">Facturé</th><th class="r">Reste</th><th class="r">Av.</th><th>Points d'attention</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");

  const style = `<style>
    .pp-tbl{width:100%;border-collapse:collapse;margin:6px 0 18px;font-size:11.5px;}
    .pp-tbl th{background:#f6f5fb;color:#3a3658;text-align:left;font-weight:700;padding:7px 9px;border-bottom:2px solid #c7a14a;font-size:10px;text-transform:uppercase;letter-spacing:.03em;}
    .pp-tbl th.r{text-align:right;} .pp-tbl td{padding:7px 9px;border-bottom:1px solid #eceaf4;vertical-align:top;}
    .pp-tbl td.r{text-align:right;white-space:nowrap;} .pp-tbl td.mono{font-family:ui-monospace,monospace;font-size:10.5px;color:#74718a;}
    .pp-tbl td.neg{color:#c0392b;font-weight:700;} .pp-sub{color:#74718a;font-size:10.5px;} .pp-cdp{font-size:12px;font-weight:500;color:#74718a;}
    .pp-al{list-style:none;padding:0;margin:6px 0 16px;} .pp-al li{padding:6px 0;border-bottom:1px solid #f0eef7;font-size:12.5px;}
    .pp-det{color:#74718a;} .pp-ok{color:#1f8a5f;font-size:13px;} h2 .pp-cdp{margin-left:6px;}
  </style>`;

  const body = `${style}${kpiRow}
    <h2>Ce qui demande l'attention</h2>${alertes}
    <h2>Pipeline commercial</h2>${pipe}
    ${clientsHtml}`;

  return buildDoc({
    kicker: "Portefeuille de projets",
    title: "Suivi de projets",
    subtitle: "Vue chef de projet — couche commerciale confrontée aux tickets Jira en direct.",
    cartouche: [["Date", new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })],
      ["Budget total", eur(d.kpis.budgete)], ["Facturé", eur(d.kpis.facture)], ["Reste à facturer", eur(d.kpis.reste)],
      ["Projets actifs", String(d.kpis.actifs)], ["Source", d.majSource || "Jira"]],
    bodyHtml: body,
    etabliPar: "cp|WIRE",
  });
}
