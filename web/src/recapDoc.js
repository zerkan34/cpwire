// ============================================================================
//  recapDoc.js — GÉNÉRATEUR UNIQUE DU RÉCAP.
//  Une seule source de chiffres : computeFacts(issues) — la fonction même que
//  lit le point du soir. Donc les chiffres du récap sont, par construction,
//  STRICTEMENT identiques à ceux du point du soir. Aucune IA, aucun recalcul,
//  aucune invention : on lit cats[] et on l'affiche, dans la charte.
// ============================================================================
import { esc } from "./utils.js";
import { cover, section, chapter, kpiBand, charterDoc, C } from "./charter.js";
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

// Compte les catégories à partir d'une liste de tickets (i.categorie), pour ventiler
// SANS jamais mélanger TMA et Projet : on recompte sur le sous-ensemble concerné.
const catsOf = (items) => {
  const c = {};
  for (const i of (items || [])) c[i.categorie] = (c[i.categorie] || 0) + 1;
  return c;
};
const trackedCount = (items) => (items || []).filter((i) => TRACKED.includes(i.categorie)).length;

function statusTableHtml(cats) {
  return `<table><thead><tr><th>Statut</th><th class="num">Tickets</th></tr></thead><tbody>`
    + ROWS.map(([k, label]) => `<tr><td>${label}</td><td class="num">${cats[k] || 0}</td></tr>`).join("")
    + `</tbody></table>`;
}
function detailHtml(cats, items) {
  return ROWS.filter(([k]) => (cats[k] || 0) > 0).map(([k, label]) => {
    const its = (items || []).filter((i) => i.categorie === k);
    return `<details><summary><span>${label}</span><span class="n">${its.length}</span></summary>${ticketTable(its)}</details>`;
  }).join("");
}
function horsHtml(cats) {
  const hors = (cats.afaire || 0) + (cats.annule || 0) + (cats.retourProd || 0);
  return hors ? `<p class="hors">Hors point du soir : ${hors} ticket(s) — à faire (${cats.afaire || 0}), retour prod (${cats.retourProd || 0}), annulés (${cats.annule || 0}).</p>` : "";
}

// Section d'UN dossier. Si le dossier mêle TMA et Projet, on présente les DEUX
// SÉPARÉMENT (tableaux et détails distincts) : aucun chiffre n'est mélangé.
function blockHtml(dossier, b) {
  const items = b.items || [];
  const tma = items.filter((i) => i.engagement === "TMA");
  const proj = items.filter((i) => i.engagement === "Projet");
  const other = items.filter((i) => i.engagement !== "TMA" && i.engagement !== "Projet");
  const groups = [];
  if (tma.length) groups.push({ label: "Maintenance courante (TMA)", noun: "en TMA", items: tma });
  if (proj.length) groups.push({ label: "Projet", noun: "en projet", items: proj });
  if (other.length) groups.push({ label: "Autres engagements", noun: "autre", items: other });

  const totalTracked = trackedCount(items);
  const split = groups.length > 1;
  const ventil = split ? ` : ${groups.map((g) => `<b>${trackedCount(g.items)}</b> ${g.noun}`).join(", ")}` : "";
  const synth = `<p class="lede"><span class="rk-client">${esc(dossier)}</span> — <b>${totalTracked}</b> ticket${totalTracked > 1 ? "s" : ""} suivi${totalTracked > 1 ? "s" : ""}${ventil}`
    + `${b.enRetard ? ` · <b>${b.enRetard}</b> en retard` : ""}.</p>`;

  let inner;
  if (!split) {
    const cats = groups.length ? catsOf(items) : b.cats;
    const d = detailHtml(cats, items);
    inner = synth + statusTableHtml(cats) + (d ? `<h3 class="rk-h3">Détail par statut</h3>${d}` : "") + horsHtml(cats);
  } else {
    inner = synth + groups.map((g) => {
      const cats = catsOf(g.items);
      const d = detailHtml(cats, g.items);
      const n = trackedCount(g.items);
      return `<div class="rk-grp"><div class="rk-grp-h"><span class="rk-grp-t">${esc(g.label)}</span><span class="rk-grp-n">${n} suivi${n > 1 ? "s" : ""}</span></div>`
        + statusTableHtml(cats)
        + (d ? `<h4 class="rk-h4">Détail par statut</h4>${d}` : "")
        + horsHtml(cats)
        + `</div>`;
    }).join("");
  }
  return { inner, tracked: totalTracked };
}

// Document complet. scope = nom d'un dossier, ou "Tous" / "Tous dossiers".
export function buildRecapDoc({ issues = [], scope = "Tous", meName = "Nicolas Durand", engagement = "all" } = {}) {
  // Périmètre d'engagement : TMA seul, Projet seul, ou les deux ("all").
  const eng = engagement === "TMA" || engagement === "Projet" ? engagement : "all";
  const ENG_SHORT = { all: "TMA & Projets", TMA: "TMA", Projet: "Projet" };
  const engShort = ENG_SHORT[eng];
  const srcIssues = eng === "all" ? issues : issues.filter((i) => i.engagement === eng);
  const facts = computeFacts(srcIssues);
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const todayShort = new Date().toLocaleDateString("fr-FR"); // 25/06/2026 — affiché à côté du titre
  const all = scope === "Tous" || scope === "Tous dossiers" || !scope;
  const etabli = meName || "Nicolas Durand";

  let perim, clients;
  if (all) {
    clients = Object.keys(facts.byDossier).filter((d) => d && d !== "—").sort((a, b) => a.localeCompare(b));
    perim = "Tous les clients";
  } else {
    clients = [scope];
    perim = scope;
  }

  let totalTracked = 0, totalRetard = 0;
  const body = clients.map((d) => {
    const b = facts.get(d);
    const { inner, tracked } = blockHtml(d, b);
    totalTracked += tracked; totalRetard += (b.enRetard || 0);
    const over = `Dossier${modeOf(b.items) ? " · " + modeOf(b.items) : ""}`;
    return section({ over, name: d, inner });
  }).join("");

  const coverHtml = cover({
    kicker: `Armonie Group · Récapitulatif${eng !== "all" ? " · " + engShort : ""}`,
    title: "Récapitulatif",
    titleNote: todayShort,
    subtitle: all ? `Portefeuille ${engShort} — tous les clients` : `Dossier ${perim}${eng !== "all" ? " · " + engShort : ""}`,
    meta: "",
    pill: "Document de travail interne",
    enBref: `Photo du portefeuille au ${today}. ${totalTracked} ticket${totalTracked > 1 ? "s" : ""} suivi${totalTracked > 1 ? "s" : ""} sur ${clients.length} dossier${clients.length > 1 ? "s" : ""}. Périmètre : ${engShort}. Chiffres strictement alignés sur le point du soir (Jira), sans recalcul ni invention.`,
    callout: totalRetard ? { value: totalRetard, label: "en retard", hint: "échéance dépassée — à arbitrer" } : null,
    etabliPar: etabli,
  });

  const synth = chapter({ over: "Synthèse", title: "Vue d'ensemble", lead: `Récapitulatif par dossier des tickets suivis au point du soir. Périmètre : ${engShort}. ${clients.length} dossier${clients.length > 1 ? "s" : ""} · ${totalTracked} ticket${totalTracked > 1 ? "s" : ""} suivi${totalTracked > 1 ? "s" : ""}.` })
    + kpiBand([
      { value: totalTracked, label: "tickets suivis" },
      { value: totalRetard, label: "en retard", tone: "cri" },
      { value: clients.length, label: "dossiers", tone: "idg" },
    ]);

  const docTitle = `Récapitulatif — ${perim}${eng !== "all" ? ` (${engShort})` : ""}`;
  const html = charterDoc({
    docTitle,
    extraCss: RECAP_CSS,
    coverHtml,
    bodyHtml: synth + (body || `<p class="muted">Aucun ticket sur ce périmètre.</p>`),
    footerText: `Récapitulatif du jour · ${today} · Confidentiel`,
  });

  const iso = new Date().toISOString().slice(0, 10);
  const engTag = eng === "all" ? "complet" : eng;
  const filename = `Recap_${String(perim).replace(/[^\w-]+/g, "_")}_${engTag}_${iso}.html`;
  return { title: docTitle, html, filename };
}

// Styles propres au récap (tables de statut, accordéons, etc.) — par-dessus la charte.
const RECAP_CSS = `
  .lede{font-size:12.5px;line-height:1.55;color:${C.ink};margin:0 0 12px}.lede b{color:${C.navy}}
  table.rk,table{font-size:12px}
  .ch-sec table th{background:${C.navy};color:#fff;text-transform:uppercase;font-size:9px;letter-spacing:.05em;padding:7px 10px;border:0}
  .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:${C.navy};width:1%;white-space:nowrap}
  .rk-h3{font-family:Poppins,Inter,sans-serif;font-size:13px;color:${C.indigo};margin:16px 0 6px}
  details{border:1px solid ${C.line};border-radius:10px;margin:8px 0;overflow:hidden}
  details>summary{cursor:pointer;list-style:none;padding:8px 13px;font-weight:600;color:${C.navy};background:${C.soft};display:flex;justify-content:space-between;align-items:center;font-size:12px}
  details>summary::-webkit-details-marker{display:none}
  summary .n{font-weight:700;color:${C.indigo};background:#fff;border:1px solid ${C.line};border-radius:99px;padding:1px 9px;font-size:11px}
  details table{margin:0}
  .rk-k{font-weight:700;color:${C.indigo};white-space:nowrap;width:1%}
  .rk-a{color:${C.muted};white-space:nowrap;width:1%;text-align:right}
  .hors{font-size:11px;color:${C.muted};margin:6px 0 4px}
  .rk-client{font-weight:800;color:${C.gold}}
  .rk-grp{margin:14px 0 6px;padding:2px 0 2px 14px;border-left:3px solid ${C.line}}
  .rk-grp-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 7px}
  .rk-grp-t{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:14px;color:${C.indigo}}
  .rk-grp-n{font-size:11px;font-weight:700;color:${C.gold};white-space:nowrap}
  .rk-h4{font-family:Poppins,Inter,sans-serif;font-size:11px;color:${C.muted};margin:12px 0 5px;text-transform:uppercase;letter-spacing:.05em}
  .muted{color:${C.muted}}`;

// ZIP « un fichier par client » (remplace buildDailyCrFiles, même forme de retour).
export function buildRecapFiles(issues = [], { meName = "Nicolas Durand", engagement = "all" } = {}) {
  const eng = engagement === "TMA" || engagement === "Projet" ? engagement : "all";
  const srcIssues = eng === "all" ? issues : issues.filter((i) => i.engagement === eng);
  const facts = computeFacts(srcIssues);
  const engTag = eng === "all" ? "complet" : eng;
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const human = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const clients = Object.keys(facts.byDossier).filter((d) => d && d !== "—").sort((a, b) => a.localeCompare(b));
  const files = clients.map((d) => {
    const { html } = buildRecapDoc({ issues, scope: d, meName, engagement: eng });
    return { dossier: d, count: facts.get(d).total, name: `Recap ${String(d).replace(/[^\w-]+/g, "_")} ${engTag} ${iso}.html`, html };
  });
  return { iso, human, heure, fileBase: `Recap du ${iso} (${engTag})`, files };
}
