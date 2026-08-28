// ============================================================================
//  engagementsDoc.js — le registre des engagements en document à la charte.
//
//  Aucune charte réinventée ici : on réutilise cover / chapter / section /
//  kpiBand / charterDoc de charter.js, comme le fait recapDoc.js. Le seul
//  ajout est une table propre au registre.
//
//  Zéro invention : on n'imprime que ce qui est dans le registre. Un
//  engagement sans échéance s'affiche « pas de date », jamais une date
//  supposée, et la phrase entendue en séance est reproduite telle quelle.
// ============================================================================

import { esc } from "./utils.js";
import { cover, chapter, section, kpiBand, charterDoc, C } from "./charter.js";
import { frDateCourte } from "./lib/commun.js";

const STATUT_TXT = { a_faire: "À faire", en_cours: "En cours", fait: "Fait", abandonne: "Abandonné" };

function ligne(e) {
  const quand = e.echeance
    ? frDateCourte(e.echeance)
    : e.note
      ? `<span class="eg-flou">pas de date (dit : « ${esc(e.note)} »)</span>`
      : `<span class="eg-flou">pas de date</span>`;
  const retard = e.urgence === "retard" ? ` <span class="eg-tag eg-retard">retard</span>` : "";
  return `<tr>
    <td>${esc(e.quoi)}${retard}</td>
    <td>${esc(e.qui || "—")}</td>
    <td>${esc(e.client || "—")}</td>
    <td class="eg-date">${quand}</td>
    <td>${esc(STATUT_TXT[e.statut] || e.statut || "—")}</td>
  </tr>`;
}

function tableau(titre, lignes, intro) {
  if (!lignes.length) return "";
  return section({
    over: "Engagements",
    name: titre,
    intro: intro || "",
    inner: `<table class="eg-tbl">
      <thead><tr><th>Engagement</th><th>Porteur</th><th>Dossier</th><th>Échéance</th><th>Statut</th></tr></thead>
      <tbody>${lignes.map(ligne).join("")}</tbody>
    </table>`,
  });
}

/**
 * @param {object} opts
 * @param {Array}  opts.engagements  liste déjà enrichie (urgence, clos…)
 * @param {string} opts.perimetre    « Tous » ou un client
 * @param {string} opts.etabliPar
 */
export function buildEngagementsDoc({ engagements = [], perimetre = "Tous", etabliPar = "Nicolas Durand" } = {}) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const todayShort = new Date().toLocaleDateString("fr-FR");

  const actions = engagements.filter((e) => e.nature !== "decision");
  const decisions = engagements.filter((e) => e.nature === "decision");
  const ouvertes = actions.filter((e) => !e.clos);
  const retard = ouvertes.filter((e) => e.urgence === "retard");
  const semaine = ouvertes.filter((e) => e.urgence === "imminent" || e.urgence === "semaine");
  const plusTard = ouvertes.filter((e) => e.urgence === "plus_tard");
  const sansDate = ouvertes.filter((e) => e.urgence === "sans_echeance");
  const closes = actions.filter((e) => e.clos);

  const coverHtml = cover({
    kicker: "Armonie Group · Engagements",
    title: "Registre des engagements",
    titleNote: todayShort,
    subtitle: perimetre === "Tous" ? "Tous les dossiers" : `Dossier ${perimetre}`,
    pill: "Document de travail interne",
    enBref: `État au ${today}. ${ouvertes.length} action${ouvertes.length > 1 ? "s" : ""} ouverte${ouvertes.length > 1 ? "s" : ""}`
      + `${decisions.length ? ` et ${decisions.length} décision${decisions.length > 1 ? "s" : ""} actée${decisions.length > 1 ? "s" : ""}` : ""}. `
      + `Contenu strictement issu du registre : aucune échéance n'est déduite, une date absente reste absente.`,
    callout: retard.length ? { value: retard.length, label: "en retard", hint: "à arbitrer" } : null,
    etabliPar,
  });

  const synth = chapter({
    over: "Synthèse",
    title: "Où en sont les engagements",
    lead: "Ce registre rassemble ce qui a été promis ou acté en séance. Il complète le suivi Jira, "
      + "qui connaît les tickets mais pas les engagements pris en réunion.",
  }) + kpiBand([
    { value: ouvertes.length, label: "actions ouvertes" },
    { value: retard.length, label: "en retard", tone: "cri" },
    { value: semaine.length, label: "sous 7 jours" },
    { value: decisions.length, label: "décisions", tone: "idg" },
  ]);

  const corps = [
    tableau("En retard", retard, "Échéance dépassée. À arbitrer en priorité."),
    tableau("Cette semaine", semaine, "Échéance à moins de sept jours."),
    tableau("À venir", plusTard, ""),
    tableau("Sans échéance", sansDate,
      "Engagements pris sans date ferme. La formulation entendue en séance est reproduite telle quelle, "
      + "sans être convertie en date."),
    decisions.length
      ? section({
          over: "Engagements", name: "Décisions actées",
          intro: "Choix arrêtés en séance. Ils se rappellent, ils ne s'exécutent pas : ni porteur ni échéance.",
          inner: `<ul class="eg-dec">${decisions.map((d) =>
            `<li>${esc(d.quoi)}${d.client ? ` <span class="eg-src">(${esc(d.client)})</span>` : ""}</li>`).join("")}</ul>`,
        })
      : "",
    tableau("Soldés", closes, "Conservés pour mémoire."),
  ].filter(Boolean).join("");

  const docTitle = `Registre des engagements — ${perimetre}`;
  const html = charterDoc({
    docTitle,
    extraCss: ENG_CSS,
    coverHtml,
    bodyHtml: synth + (corps || `<p class="muted">Aucun engagement sur ce périmètre.</p>`),
    footerText: `Registre des engagements · ${today} · Confidentiel`,
  });

  const iso = new Date().toISOString().slice(0, 10);
  const filename = `Engagements_${String(perimetre).replace(/[^\w-]+/g, "_")}_${iso}.pdf`;
  return { title: docTitle, html, filename };
}

const ENG_CSS = `
  table.eg-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin:2px 0 4px}
  table.eg-tbl th{background:${C.navy};color:#fff;text-align:left;padding:6px 8px;font-size:9.5px;
    letter-spacing:.08em;text-transform:uppercase;font-weight:700}
  table.eg-tbl td{padding:6px 8px;border-top:1px solid ${C.line};vertical-align:top;color:${C.ink}}
  table.eg-tbl tr:nth-child(even) td{background:${C.soft}}
  table.eg-tbl td:first-child{width:44%}
  .eg-date{white-space:nowrap}
  .eg-flou{color:${C.muted};font-style:italic}
  .eg-tag{display:inline-block;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
    padding:1px 5px;border-radius:4px;margin-left:5px}
  .eg-retard{background:${C.red};color:#fff}
  ul.eg-dec{margin:2px 0 4px;padding-left:16px;font-size:11.5px;line-height:1.55;color:${C.ink}}
  ul.eg-dec li{margin-bottom:3px}
  .eg-src{color:${C.muted}}
`;
