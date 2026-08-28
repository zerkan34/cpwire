// recapChiffres.js — RÉCAP DU JOUR = MOUVEMENTS DU JOUR. 100 % déterministe, AUCUNE IA.
// On lit les VRAIES transitions de statut Jira de la journée. Chaque ticket qui a bougé apparaît
// UNE SEULE FOIS, classé là où il a ATTERRI, avec DEUX informations distinctes et transparentes :
//   - QUI A BASCULÉ le ticket (acteur de la transition Jira = qui a cliqué le changement de statut) ;
//   - LE DÉVELOPPEUR D'ORIGINE (assigné du ticket = qui a fait le travail).
// Important : « basculé » ≠ « développé ». Un recetteur qui pousse 20 tickets en recette n'a pas
// développé 20 tickets. Le récap distingue donc clairement les transferts des développements.
// Pas de stock, pas de totaux de périmètre, pas de « à recetter par le client ».

import { buildDoc } from "./docgen.js";
import { categoryFromStatus, CATEGORY_LABEL } from "./config.js";

// Échappement d'ATTRIBUT : contrairement à escHtml() du socle partagé, celui-ci
// échappe aussi les guillemets, indispensable pour insérer une valeur dans un
// attribut HTML. Ce n'est donc pas un doublon : il fait strictement plus.
const escAttr = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const devOf = (iss) => {
  const d = iss.dev && iss.dev !== "Non assigné" ? iss.dev : "";
  const a = iss.assigne && iss.assigne !== "Non assigné" ? iss.assigne : "";
  return d || a || "";
};

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

// Mention « qui a fait quoi » sur une ligne de ticket : basculé par X · dév. Y.
const credit = (m) => {
  if (m.dev && m.dev === m.who) return `réalisé et basculé par <span class="who">${escAttr(m.who)}</span>`;
  const base = `basculé par <span class="who">${escAttr(m.who)}</span>`;
  return m.dev ? `${base} · <span class="cr-meta">dév. ${escAttr(m.dev)}</span>` : base;
};

export function buildRecapChiffres(issues, trItems = [], opts = {}) {
  const day = opts.dateISO ? new Date(opts.dateISO) : new Date();
  const dayFR = day.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const byKey = {};
  for (const i of (issues || [])) byKey[i.cle] = i;

  // 1) Atterrissage du jour, par ticket (dernière transition de statut de la journée).
  const moved = []; // { cle, dossier, resume, who, dev, toCat, flagged, enRetard }
  for (const it of (trItems || [])) {
    const trs = (it.transitions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!trs.length) continue;
    const last = trs[trs.length - 1];
    const iss = byKey[it.cle] || {};
    moved.push({
      cle: it.cle,
      dossier: iss.dossier || "Autre",
      resume: iss.resume || "",
      who: (last.who && last.who !== "—") ? last.who : "Inconnu",
      dev: devOf(iss),
      toCat: categoryFromStatus(last.to),
      flagged: !!iss.flagged,
      enRetard: !!iss.enRetard,
    });
  }

  if (!moved.length) {
    const body = `<p class="cr-none">Aucun mouvement de ticket enregistré dans Jira pour le ${escAttr(dayFR)}.</p>`;
    return buildDoc({
      kicker: "Récap du jour", title: "Récap du jour — mouvements",
      subtitle: `Activité Jira du ${dayFR}`, cartouche: [["Date", dayFR], ["Établi par", "Nicolas Durand"]],
      bodyHtml: body, etabliPar: "Nicolas Durand",
    });
  }

  // 2a) QUI A TRANSFÉRÉ (acteur des transitions) — tickets distincts, détail recette/clôture.
  const perWho = {};
  for (const m of moved) {
    const a = (perWho[m.who] ||= { who: m.who, n: 0, recC: 0, recA: 0, term: 0 });
    a.n++;
    if (m.toCat === "recetteClient") a.recC++;
    else if (m.toCat === "recetteArmonie") a.recA++;
    else if (m.toCat === "termine" || m.toCat === "miseEnProd") a.term++;
  }
  const transferRows = Object.values(perWho).sort((x, y) => y.n - x.n).map((a) => {
    const bits = [];
    if (a.term) bits.push(`${a.term} clôturé${a.term > 1 ? "s" : ""}`);
    if (a.recC) bits.push(`${a.recC} en recette client`);
    if (a.recA) bits.push(`${a.recA} en recette Armonie`);
    const detail = bits.length ? ` <span class="cr-meta">(${bits.join(", ")})</span>` : "";
    return `<li><span class="who">${escAttr(a.who)}</span> — ${a.n} ticket${a.n > 1 ? "s" : ""} basculé${a.n > 1 ? "s" : ""}${detail}</li>`;
  }).join("");

  // 2b) DÉVELOPPEURS CONCERNÉS (dev d'origine des tickets ayant bougé) — le travail réel.
  const perDev = {};
  for (const m of moved) { if (!m.dev) continue; (perDev[m.dev] ||= { dev: m.dev, n: 0 }).n++; }
  const devRows = Object.values(perDev).sort((x, y) => y.n - x.n).map((a) =>
    `<li><span class="who">${escAttr(a.dev)}</span> — ${a.n} ticket${a.n > 1 ? "s" : ""} concerné${a.n > 1 ? "s" : ""} par un mouvement</li>`
  ).join("");
  const devBlock = devRows
    ? `<h2>Développeurs concernés</h2><p class="cr-scope">Auteur d'origine des tickets ayant bougé (le travail réalisé, indépendamment de qui a effectué la transition).</p><ul class="cr-list">${devRows}</ul>`
    : "";

  // 3) Mouvements par dossier (recettes en tête), un ticket = une ligne, avec basculeur + dév.
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
        `<li><span class="tk">${escAttr(m.cle)}</span> ${escAttr(m.resume)} — ${credit(m)}${m.flagged ? ' <span class="pill block">🚩</span>' : ""}</li>`
      ).join("");
      inner += `<h3 class="cr-perim">${LAND_LABEL[cat]} (${arr.length})</h3><ul class="cr-list">${lis}</ul>`;
    }
    const reste = openByD[d] || 0;
    return `<h2>${escAttr(d)} — ${movedCount} mouvement${movedCount > 1 ? "s" : ""}</h2>${inner}` +
      `<p class="cr-meta" style="margin-top:6px">Reste ouvert sur le dossier : ${reste} ticket${reste > 1 ? "s" : ""}.</p>`;
  }).join("");

  // 4) Points d'attention : tickets ayant bougé qui sont flaggés ou en retard.
  const attention = moved.filter((m) => m.flagged || m.enRetard);
  const attHtml = attention.length
    ? `<ul class="cr-list">${attention.map((m) =>
        `<li><span class="tk">${escAttr(m.cle)}</span> ${escAttr(m.resume)} — ${m.flagged ? "🚩 signalé" : ""}${m.flagged && m.enRetard ? " · " : ""}${m.enRetard ? "⏰ en retard" : ""} <span class="cr-meta">(${escAttr(m.dossier)}${m.dev ? " · dév. " + escAttr(m.dev) : ""})</span></li>`
      ).join("")}</ul>`
    : `<p class="cr-none">Aucun ticket signalé ou en retard parmi les mouvements du jour.</p>`;

  const nbTransf = Object.keys(perWho).length;
  const summary = `<p class="cr-scope">${moved.length} ticket${moved.length > 1 ? "s ont" : " a"} bougé le ${escAttr(dayFR)}.${opts.capped ? " (volume élevé : liste plafonnée aux tickets les plus récents)" : ""}</p>`;

  const body =
    summary +
    `<h2>Qui a transféré les tickets</h2>` +
    `<p class="cr-scope">Personne ayant effectué la transition de statut dans Jira (le geste de bascule, p. ex. mise en recette). Ce n'est pas nécessairement l'auteur du développement.</p>` +
    `<ul class="cr-list">${transferRows}</ul>` +
    devBlock +
    `<div class="eyebrow">Mouvements par dossier</div>` + dossierBlocks +
    `<h2>Points d'attention</h2>${attHtml}` +
    `<div class="indic" style="margin-top:20px"><span class="hint">Mouvements = transitions de statut Jira datées du ${escAttr(dayFR)}. Chaque ticket est compté une fois, là où il a atterri. « Basculé par » = qui a fait la transition ; « dév. » = développeur d'origine (assigné). Aucune interprétation.</span></div>`;

  return buildDoc({
    kicker: "Récap du jour",
    title: "Récap du jour — mouvements",
    subtitle: `Qui a fait quoi · ${dayFR}`,
    cartouche: [["Date", dayFR], ["Tickets ayant bougé", String(moved.length)], ["Établi par", "Nicolas Durand"]],
    bodyHtml: body,
    etabliPar: "Nicolas Durand",
  });
}
