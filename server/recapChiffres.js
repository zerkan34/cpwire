// recapChiffres.js — RÉCAP CHIFFRÉ DU JOUR, PAR DOSSIER. 100 % déterministe, AUCUNE IA.
// Objet : un document « boss-ready » avec des chiffres vérifiables, sans interprétation.
// On distingue explicitement :
//   - ÉTAT (stock) : combien de tickets sont ACTUELLEMENT dans chaque catégorie (snapshot Jira) ;
//   - ACTIVITÉ DU JOUR (flux) : tickets RÉSOLUS le jour même (date de résolution Jira).
// Aucune phrase rédigée, aucun « passage » ambigu : on compte des tickets, point.

import { buildDoc } from "./docgen.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Regroupements lisibles pour un comité de direction.
const isAfaire = (c) => c === "afaire";
const isEnCours = (c) => c === "encours" || c === "retourTest" || c === "retourProd";
const isRecArm = (c) => c === "recetteArmonie";
const isRecCli = (c) => c === "recetteClient";
const isAttCli = (c) => c === "attenteClient";
const isClos = (c) => c === "termine" || c === "miseEnProd";
const isOuvert = (c) => c !== "termine" && c !== "miseEnProd" && c !== "annule";

function countsFor(items, dayISO) {
  const k = { afaire: 0, encours: 0, recArm: 0, recCli: 0, attCli: 0, ouverts: 0, retard: 0, closJour: 0, closJourKeys: [] };
  for (const i of items) {
    const c = i.categorie;
    if (isAfaire(c)) k.afaire++;
    else if (isEnCours(c)) k.encours++;
    else if (isRecArm(c)) k.recArm++;
    else if (isRecCli(c)) k.recCli++;
    else if (isAttCli(c)) k.attCli++;
    if (isOuvert(c)) { k.ouverts++; if (i.enRetard) k.retard++; }
    if ((i.resolu || "").slice(0, 10) === dayISO) { k.closJour++; k.closJourKeys.push(i.cle); }
  }
  return k;
}

export function buildRecapChiffres(issues, opts = {}) {
  const day = opts.dateISO ? new Date(opts.dateISO) : new Date();
  const dayISO = day.toISOString().slice(0, 10);
  const dayFR = day.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  // On ignore les tickets annulés (hors périmètre de pilotage).
  const live = (issues || []).filter((i) => i.categorie !== "annule");

  const byD = {};
  for (const i of live) { (byD[i.dossier || "Autre"] ||= []).push(i); }
  const dossiers = Object.keys(byD).sort((a, b) => a.localeCompare(b, "fr"));

  // Lignes du tableau + totaux.
  const tot = { afaire: 0, encours: 0, recArm: 0, recCli: 0, attCli: 0, ouverts: 0, retard: 0, closJour: 0 };
  const rows = dossiers.map((d) => {
    const k = countsFor(byD[d], dayISO);
    for (const key of Object.keys(tot)) tot[key] += k[key];
    return { d, k };
  });

  const cell = (v) => `<td class="r">${v || "0"}</td>`;
  const bodyRows = rows.map(({ d, k }) =>
    `<tr><td><b>${esc(d)}</b></td>${cell(k.afaire)}${cell(k.encours)}${cell(k.recArm)}${cell(k.recCli)}${cell(k.attCli)}` +
    `<td class="r">${k.retard ? `<span class="pill block">${k.retard}</span>` : "0"}</td>` +
    `<td class="r"><b>${k.ouverts}</b></td>${cell(k.closJour)}</tr>`
  ).join("");

  const totRow =
    `<tr class="act-tot"><td><b>Total</b></td>` +
    `<td class="r"><b>${tot.afaire}</b></td><td class="r"><b>${tot.encours}</b></td><td class="r"><b>${tot.recArm}</b></td>` +
    `<td class="r"><b>${tot.recCli}</b></td><td class="r"><b>${tot.attCli}</b></td><td class="r"><b>${tot.retard}</b></td>` +
    `<td class="r"><b>${tot.ouverts}</b></td><td class="r"><b>${tot.closJour}</b></td></tr>`;

  const table =
    `<table class="data act-tbl"><thead><tr>` +
    `<th>Dossier</th><th class="r">À faire</th><th class="r">En cours</th><th class="r">Rec. Armonie</th>` +
    `<th class="r">Rec. client</th><th class="r">Att. client</th><th class="r">En retard</th>` +
    `<th class="r">Ouverts</th><th class="r">Clos le jour</th>` +
    `</tr></thead><tbody>${bodyRows}${totRow}</tbody></table>`;

  // KPI globaux.
  const kpi =
    `<div class="kpi-row">` +
    `<div class="kpi"><div class="v">${dossiers.length}</div><div class="l">Dossiers</div></div>` +
    `<div class="kpi"><div class="v">${tot.ouverts}</div><div class="l">Tickets ouverts</div></div>` +
    `<div class="kpi"><div class="v">${tot.retard}</div><div class="l">En retard</div></div>` +
    `<div class="kpi"><div class="v">${tot.closJour}</div><div class="l">Clos le ${day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</div></div>` +
    `</div>`;

  // Activité du jour : seulement les dossiers ayant clos au moins un ticket ce jour-là.
  const closLines = rows
    .filter(({ k }) => k.closJour > 0)
    .map(({ d, k }) => `<li><b>${esc(d)}</b> — ${k.closJour} clos : ${k.closJourKeys.map((c) => `<span class="tk">${esc(c)}</span>`).join(", ")}</li>`)
    .join("");
  const closBlock = closLines
    ? `<h2>Activité du jour — tickets clos le ${esc(dayFR)}</h2><ul class="cr-list">${closLines}</ul>`
    : `<h2>Activité du jour — tickets clos le ${esc(dayFR)}</h2><p class="cr-none">Aucun ticket clos ce jour.</p>`;

  const note =
    `<div class="indic" style="margin-top:22px"><b>Lecture des chiffres.</b> ` +
    `« Ouverts » = tickets non terminés et non annulés à l'instant de l'extraction Jira (état/stock). ` +
    `« En cours » regroupe les tickets en traitement et les retours test/production. ` +
    `« En retard » = échéance dépassée, parmi les ouverts. ` +
    `« Clos le jour » = tickets dont la date de résolution Jira est le ${esc(dayFR)} (activité/flux). ` +
    `<span class="hint">Chiffres calculés directement depuis Jira, sans interprétation.</span></div>`;

  const body = kpi + `<div class="eyebrow">État du périmètre par dossier</div>` + table + closBlock + note;

  return buildDoc({
    kicker: "Récap chiffré du jour",
    title: "Récap du jour — par dossier",
    subtitle: `Chiffres déterministes au ${dayFR} · tous dossiers`,
    cartouche: [
      ["Date", dayFR],
      ["Périmètre", `${dossiers.length} dossier(s)`],
      ["Établi par", "cp|WIRE — extraction Jira"],
    ],
    bodyHtml: body,
    etabliPar: "cp|WIRE (données Jira)",
  });
}
