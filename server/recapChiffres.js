// recapChiffres.js — RÉCAP DU JOUR = MOUVEMENTS DU JOUR. 100 % déterministe, AUCUNE IA.
// Principe : on lit les VRAIES transitions de statut Jira de la journée. Chaque ticket qui a
// bougé apparaît UNE SEULE FOIS, classé là où il a ATTERRI en fin de journée, crédité à la
// personne qui a effectué la transition (le « qui a fait quoi »). Pas de stock, pas de totaux
// de périmètre, pas de « à recetter par le client ». Juste : qui a fait quoi, où ça en est,
// ce qui reste (en une ligne), et les points d'attention — séparés.

import { buildDoc } from "./docgen.js";
import { categoryFromStatus, CATEGORY_LABEL } from "./config.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Catégories d'atterrissage, dans l'ordre d'importance pour un comité (recettes en tête).
const LAND = [
  ["termine",        "✅ Clôturés / terminés"],
  ["miseEnProd",     "✅ Mis en production"],
  ["recetteClient",  "→ Passés en recette client"],
  ["recetteArmonie", "→ Passés en recette Armonie"],
  ["attenteClient",  "⏸ Passés en attente client"],
  ["encours",        "↻ Repris / mis en cours"],
  ["retourTest",     "↩ Retour test"],
  ["retourProd",     "↩ Retour production"],
  ["afaire",         "↺ Replacés à faire"],
  ["annule",         "✖ Annulés"],
];
const LAND_ORDER = LAND.map((x) => x[0]);
const LAND_LABEL = Object.fromEntries(LAND);
const isOpen = (c) => c !== "termine" && c !== "miseEnProd" && c !== "annule";

export function buildRecapChiffres(issues, trItems = [], opts = {}) {
  const day = opts.dateISO ? new Date(opts.dateISO) : new Date();
  const dayFR = day.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const byKey = {};
  for (const i of (issues || [])) byKey[i.cle] = i;

  // 1) Atterrissage du jour, par ticket (dernière transition de statut de la journée).
  const moved = []; // { cle, dossier, resume, who, toCat, flagged, enRetard }
  for (const it of (trItems || [])) {
    const trs = (it.transitions || []).filter((t) => t.field === undefined || t.field === "status" || t.to)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!trs.length) continue;
    const last = trs[trs.length - 1];
    const toCat = categoryFromStatus(last.to);
    const iss = byKey[it.cle] || {};
    moved.push({
      cle: it.cle,
      dossier: iss.dossier || "Autre",
      resume: iss.resume || "",
      who: (last.who && last.who !== "—") ? last.who : "Inconnu",
      toCat,
      flagged: !!iss.flagged,
      enRetard: !!iss.enRetard,
    });
  }

  if (!moved.length) {
    const body = `<p class="cr-none">Aucun mouvement de ticket enregistré dans Jira pour le ${esc(dayFR)}.</p>`;
    return buildDoc({
      kicker: "Récap du jour", title: "Récap du jour — mouvements",
      subtitle: `Activité Jira du ${dayFR}`, cartouche: [["Date", dayFR]],
      bodyHtml: body, etabliPar: "cp|WIRE (données Jira)",
    });
  }

  // 2) Synthèse « qui a fait quoi » (par personne, tickets distincts).
  const perWho = {};
  for (const m of moved) {
    const a = (perWho[m.who] ||= { who: m.who, n: 0, recC: 0, recA: 0, term: 0 });
    a.n++;
    if (m.toCat === "recetteClient") a.recC++;
    else if (m.toCat === "recetteArmonie") a.recA++;
    else if (m.toCat === "termine" || m.toCat === "miseEnProd") a.term++;
  }
  const whoRows = Object.values(perWho).sort((x, y) => y.n - x.n).map((a) => {
    const bits = [];
    if (a.term) bits.push(`${a.term} clôturé${a.term > 1 ? "s" : ""}`);
    if (a.recC) bits.push(`${a.recC} en recette client`);
    if (a.recA) bits.push(`${a.recA} en recette Armonie`);
    const detail = bits.length ? ` <span class="cr-meta">(${bits.join(", ")})</span>` : "";
    return `<li><span class="who">${esc(a.who)}</span> — ${a.n} ticket${a.n > 1 ? "s" : ""} fait${a.n > 1 ? "s" : ""} avancer${detail}</li>`;
  }).join("");

  // 3) Mouvements par dossier (recettes en tête), un ticket = une ligne.
  const byD = {};
  for (const m of moved) { ((byD[m.dossier] ||= {})[m.toCat] ||= []).push(m); }
  const dossiers = Object.keys(byD).sort((a, b) => a.localeCompare(b, "fr"));
  const openByD = {};
  for (const i of (issues || [])) { if (i.categorie !== "annule" && isOpen(i.categorie)) openByD[i.dossier || "Autre"] = (openByD[i.dossier || "Autre"] || 0) + 1; }

  const dossierBlocks = dossiers.map((d) => {
    const groups = byD[d];
    const movedCount = Object.values(groups).reduce((s, arr) => s + arr.length, 0);
    let inner = "";
    for (const cat of LAND_ORDER) {
      const arr = groups[cat];
      if (!arr || !arr.length) continue;
      const lis = arr.map((m) =>
        `<li><span class="tk">${esc(m.cle)}</span> ${esc(m.resume)} — <span class="who">${esc(m.who)}</span>${m.flagged ? ' <span class="pill block">🚩</span>' : ""}</li>`
      ).join("");
      inner += `<h3 class="cr-perim">${LAND_LABEL[cat]} (${arr.length})</h3><ul class="cr-list">${lis}</ul>`;
    }
    const reste = openByD[d] || 0;
    return `<h2>${esc(d)} — ${movedCount} mouvement${movedCount > 1 ? "s" : ""}</h2>${inner}` +
      `<p class="cr-meta" style="margin-top:6px">Reste ouvert sur le dossier : ${reste} ticket${reste > 1 ? "s" : ""}.</p>`;
  }).join("");

  // 4) Points d'attention : tickets ayant bougé aujourd'hui qui sont flaggés ou en retard.
  const attention = moved.filter((m) => m.flagged || m.enRetard);
  const attHtml = attention.length
    ? `<ul class="cr-list">${attention.map((m) =>
        `<li><span class="tk">${esc(m.cle)}</span> ${esc(m.resume)} — ${m.flagged ? "🚩 signalé" : ""}${m.flagged && m.enRetard ? " · " : ""}${m.enRetard ? "⏰ en retard" : ""} <span class="cr-meta">(${esc(m.dossier)})</span></li>`
      ).join("")}</ul>`
    : `<p class="cr-none">Aucun ticket signalé ou en retard parmi les mouvements du jour.</p>`;

  const summary = `<p class="cr-scope">${moved.length} ticket${moved.length > 1 ? "s ont" : " a"} bougé le ${esc(dayFR)}, par ${Object.keys(perWho).length} personne${Object.keys(perWho).length > 1 ? "s" : ""}.${opts.capped ? " (volume élevé : liste plafonnée aux tickets les plus récents)" : ""}</p>`;

  const body =
    summary +
    `<h2>Qui a fait quoi</h2><ul class="cr-list">${whoRows}</ul>` +
    `<div class="eyebrow">Mouvements par dossier</div>` + dossierBlocks +
    `<h2>Points d'attention</h2>${attHtml}` +
    `<div class="indic" style="margin-top:20px"><span class="hint">Mouvements = transitions de statut Jira datées du ${esc(dayFR)}. Chaque ticket est compté une fois, là où il a atterri, crédité à la personne ayant effectué la transition. Aucune interprétation.</span></div>`;

  return buildDoc({
    kicker: "Récap du jour",
    title: "Récap du jour — mouvements",
    subtitle: `Qui a fait quoi · ${dayFR}`,
    cartouche: [["Date", dayFR], ["Tickets ayant bougé", String(moved.length)], ["Établi par", "cp|WIRE — transitions Jira"]],
    bodyHtml: body,
    etabliPar: "cp|WIRE (transitions Jira)",
  });
}
