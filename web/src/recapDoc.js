// ============================================================================
//  recapDoc.js — GÉNÉRATEUR UNIQUE DU RÉCAP.
//  Une seule source de chiffres : computeFacts(issues) — la fonction même que
//  lit le point du soir. Donc les chiffres du récap sont, par construction,
//  STRICTEMENT identiques à ceux du point du soir. Aucune IA, aucun recalcul,
//  aucune invention : on lit cats[] et on l'affiche, dans la charte.
// ============================================================================
import { buildSimpleDoc, esc } from "./utils.js";
import { progResume } from "./ticket.js";
import { computeFacts } from "./facts.js";
import { ACTIFS, RETOUR, RECETTE } from "./groups.js";

// Les 7 statuts du point du soir — MÊME ordre, MÊMES libellés.
const ROWS = [
  ["miseEnProd", "Mise en production"],
  ["termine", "Terminé"],
  ["recetteClient", "Recette client"],
  ["recetteArmonie", "Recette Armonie"],
  ["encours", "En cours"],
  ["retourTest", "Retour de test"],
  ["attenteClient", "En attente client"],
];
const TRACKED = ROWS.map(([k]) => k);
const sum = (cats, keys) => keys.reduce((n, k) => n + (cats[k] || 0), 0);

function modeOf(items) {
  const engs = [...new Set((items || []).map((i) => i.engagement).filter((e) => e && e !== "—"))];
  if (engs.length === 0) return "";
  if (engs.length === 1) return engs[0] === "Projet" ? "mode projet" : engs[0] === "TMA" ? "mode TMA" : engs[0];
  return "TMA + Projet";
}

function ticketTable(items) {
  if (!items.length) return `<p class="muted" style="padding:8px 14px;margin:0">—</p>`;
  const rows = items
    .slice()
    .sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")))
    .map((i) => `<tr><td class="rk-k">${esc(i.cle)}</td><td>${esc(progResume(i))}</td><td class="rk-a">${esc(i.assigne || "non assigné")}</td></tr>`)
    .join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

// Section d'UN dossier, à partir de son bloc computeFacts (b.cats / b.items / b.enRetard).
function blockHtml(dossier, b) {
  const cats = b.cats;
  const mode = modeOf(b.items);
  const tracked = sum(cats, TRACKED);
  const actifs = sum(cats, ACTIFS), retours = sum(cats, RETOUR), recette = sum(cats, RECETTE);
  const hors = (cats.afaire || 0) + (cats.annule || 0) + (cats.retourProd || 0);

  const synth = `<p class="lede"><b>${esc(dossier)}</b>${mode ? ` · ${esc(mode)}` : ""} — <b>${tracked}</b> ticket${tracked > 1 ? "s" : ""} suivi${tracked > 1 ? "s" : ""} : `
    + `<b>${actifs}</b> actif${actifs > 1 ? "s" : ""} (en cours + retours), <b>${recette}</b> en recette/validation`
    + `${b.enRetard ? `, <b>${b.enRetard}</b> en retard` : ""}.</p>`;

  const statusTable = `<table><thead><tr><th>Statut</th><th class="num">Tickets</th></tr></thead><tbody>`
    + ROWS.map(([k, label]) => `<tr><td>${label}</td><td class="num">${cats[k] || 0}</td></tr>`).join("")
    + `</tbody></table>`;

  const detail = ROWS
    .filter(([k]) => (cats[k] || 0) > 0)
    .map(([k, label]) => {
      const its = (b.items || []).filter((i) => i.categorie === k);
      return `<details><summary><span>${label}</span><span class="n">${its.length}</span></summary>${ticketTable(its)}</details>`;
    })
    .join("");

  return `<section class="rsec"><h2>${esc(dossier)}</h2>${synth}${statusTable}`
    + (detail ? `<h3>Détail par statut</h3>${detail}` : "")
    + (hors ? `<p class="hors">Hors point du soir : ${hors} ticket(s) — à faire (${cats.afaire || 0}), retour prod (${cats.retourProd || 0}), annulés (${cats.annule || 0}).</p>` : "")
    + `</section>`;
}

// Document complet. scope = nom d'un dossier, ou "Tous" / "Tous dossiers".
export function buildRecapDoc({ issues = [], scope = "Tous", meName = "Nicolas Durand" } = {}) {
  const facts = computeFacts(issues);
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const all = scope === "Tous" || scope === "Tous dossiers" || !scope;

  let subtitle, body, perim;
  if (all) {
    const clients = Object.keys(facts.byDossier).filter((d) => d && d !== "—").sort((a, b) => a.localeCompare(b));
    perim = "Tous les clients";
    subtitle = "Tous les clients";
    body = clients.map((d) => blockHtml(d, facts.get(d))).join("");
  } else {
    const b = facts.get(scope);
    perim = scope;
    subtitle = `${scope}${modeOf(b.items) ? " · " + modeOf(b.items) : ""}`;
    body = blockHtml(scope, b);
  }

  const html = buildSimpleDoc({
    kicker: "Armonie Group",
    title: "Récapitulatif de la journée",
    subtitle,
    cartouche: [
      ["Périmètre", perim],
      ["Chef de projet", meName],
      ["Date", today],
      ["Source", "Jira — chiffres du point du soir"],
    ],
    bodyHtml: body || `<p class="muted">Aucun ticket sur ce périmètre.</p>`,
    etabliPar: meName,
  });

  const iso = new Date().toISOString().slice(0, 10);
  const filename = `Recap_${String(perim).replace(/[^\w-]+/g, "_")}_${iso}.html`;
  return { title: `Récapitulatif — ${perim}`, html, filename };
}

// ZIP « un fichier par client » (remplace buildDailyCrFiles, même forme de retour).
export function buildRecapFiles(issues = [], { meName = "Nicolas Durand" } = {}) {
  const facts = computeFacts(issues);
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const human = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const clients = Object.keys(facts.byDossier).filter((d) => d && d !== "—").sort((a, b) => a.localeCompare(b));
  const files = clients.map((d) => {
    const { html } = buildRecapDoc({ issues, scope: d, meName });
    return { dossier: d, count: facts.get(d).total, name: `Recap ${String(d).replace(/[^\w-]+/g, "_")} ${iso}.html`, html };
  });
  return { iso, human, heure, fileBase: `Recap du ${iso}`, files };
}
