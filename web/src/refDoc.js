// ============================================================================
//  refDoc.js — Générateurs de documents pour la page RÉFÉRENCE, à la CHARTE
//  Armonie. Trois vues : Annuaire, Analyse & apprentissage, Mémoire d'équipe.
//  Chaque générateur produit un HTML charté unique, servant à la fois :
//    • à l'export PDF (via printHtml) ;
//    • à l'export « web cliquable » (via downloadHtml) — les clés de tickets
//      sont des liens vers Jira.
//  Règle sacrée : zéro invention. On ne met en page que les données reçues.
// ============================================================================
import { C, esc, cover, section, chapter, kpiBand, charterDoc } from "./charter.js";

const frDate = () => new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const tkLink = (cle, url) => url
  ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="rd-tk">${esc(cle)}</a>`
  : `<span class="rd-tk">${esc(cle)}</span>`;

// Barres horizontales chartées (mêmes codes que le cockpit à l'écran).
function bars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  return `<div class="rd-bars">` + rows.map((r) =>
    `<div class="rd-bar"><span class="rd-bar-l">${esc(r.label)}</span><span class="rd-bar-t"><i style="width:${Math.max(2, Math.round((r.value / max) * 100))}%;background:${r.color || C.indigo}"></i></span><b class="rd-bar-v">${esc(String(r.value))}${esc(r.suffix || "")}</b></div>`
  ).join("") + `</div>`;
}

// Cartes « client → liste de tickets » (reprises, recette client).
function ticketCards(arr, urlOf) {
  if (!arr.length) return `<p class="rd-empty">Aucun élément sur ce périmètre.</p>`;
  return `<div class="rd-cards">` + arr.map((c) =>
    `<div class="rd-card"><div class="rd-card-h"><span>${esc(c.client)}</span><b>${c.n}</b></div><div class="rd-card-b">` +
    c.list.slice(0, 10).map((i) => `<div class="rd-prog">${tkLink(i.cle, urlOf(i.cle))}<span>${esc(i.resume || "")}</span></div>`).join("") +
    (c.list.length > 10 ? `<div class="rd-sub">+ ${c.list.length - 10} autre(s)</div>` : "") +
    `</div></div>`
  ).join("") + `</div>`;
}

const RD_CSS = `
  .rd-tk { font-family: ui-monospace, Menlo, monospace; font-weight: 700; color: ${C.gold}; text-decoration: none; white-space: nowrap; }
  .rd-tk:hover { text-decoration: underline; }
  .rd-bars { display: flex; flex-direction: column; gap: 7px; margin: 4px 0 6px; }
  .rd-bar { display: grid; grid-template-columns: 150px 1fr auto; align-items: center; gap: 12px; font-size: 11px; }
  .rd-bar-l { color: ${C.ink}; font-weight: 600; }
  .rd-bar-t { height: 11px; background: ${C.soft}; border-radius: 99px; overflow: hidden; }
  .rd-bar-t i { display: block; height: 100%; border-radius: 99px; }
  .rd-bar-v { font-weight: 800; color: ${C.navy}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rd-sub { color: ${C.muted}; font-size: 10.5px; margin: 4px 0 0; }
  .rd-empty { color: ${C.muted}; font-size: 11.5px; font-style: italic; }
  .rd-tbl { width: 100%; border-collapse: collapse; font-size: 11px; margin: 2px 0 4px; }
  .rd-tbl th { text-align: left; color: ${C.muted}; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; padding: 4px 8px; border-bottom: 1px solid ${C.line}; }
  .rd-tbl td { padding: 4px 8px; border-bottom: 1px solid ${C.line}; color: ${C.ink}; }
  .rd-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .rd-card { border: 1px solid ${C.line}; border-radius: 10px; overflow: hidden; break-inside: avoid; }
  .rd-card-h { background: ${C.soft}; padding: 8px 12px; font-weight: 700; color: ${C.navy}; display: flex; justify-content: space-between; border-bottom: 1px solid ${C.line}; }
  .rd-card-b { padding: 10px 12px; }
  .rd-prog { display: flex; gap: 8px; font-size: 11px; margin: 4px 0; align-items: baseline; }
  .rd-prog span { color: ${C.muted}; }
  .rd-opt { border: 1px solid ${C.line}; border-radius: 10px; overflow: hidden; margin: 0 0 12px; break-inside: avoid; }
  .rd-opt-h { background: ${C.soft}; padding: 9px 13px; display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid ${C.line}; }
  .rd-opt-h b { color: ${C.navy}; font-size: 13px; }
  .rd-opt-h span { color: ${C.muted}; font-size: 10.5px; }
  .rd-opt-b { padding: 10px 13px; }
  .rd-opt-lib { font-weight: 600; color: ${C.ink}; font-size: 12px; margin-bottom: 4px; }
  .rd-opt-meta { color: ${C.muted}; font-size: 10.5px; margin-bottom: 8px; }
  .rd-pill { display: inline-block; font-size: 9.5px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: ${C.soft}; border: 1px solid ${C.line}; color: ${C.indigo}; margin-right: 6px; }
  .rd-pill.late { color: ${C.red}; border-color: ${C.red}; }
  .rd-kv { margin: 0 0 14px; }
  .rd-kv dt { font-weight: 700; color: ${C.navy}; font-size: 12px; margin-top: 8px; }
  .rd-kv dd { margin: 2px 0 0; color: ${C.ink}; font-size: 11.5px; }
  .rd-ul { margin: 4px 0 0; padding-left: 18px; }
  .rd-ul li { font-size: 11.5px; color: ${C.ink}; margin: 2px 0; }
  .rd-auto { background: ${C.soft}; border: 1px solid ${C.line}; border-radius: 10px; padding: 10px 13px; margin-top: 8px; }
  .rd-auto-l { font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; color: ${C.gold}; font-weight: 700; margin-bottom: 4px; }
`;

// ---------- 1) ANALYSE & APPRENTISSAGE ----------
export function buildAnalyseDoc(d) {
  const u = d.urlOf || (() => "");
  const k = d.kpis || {};
  const flowRows = (d.flow || []).map((w) => `<tr><td>${esc(w.label)}</td><td style="text-align:right">${w.cree}</td><td style="text-align:right">${w.resolu}</td></tr>`).join("");
  const flowTot = (d.flow || []).reduce((a, w) => ({ c: a.c + w.cree, r: a.r + w.resolu }), { c: 0, r: 0 });
  const oldestList = (d.recetteCli || []).filter((c) => c.oldest).slice(0, 8)
    .map((c) => `<div class="rd-prog"><b style="color:${C.ink};min-width:90px;display:inline-block">${esc(c.client)}</b>${tkLink(c.oldest.cle, u(c.oldest.cle))}<span>${c.oldest.age} j</span></div>`).join("");

  const body = [
    kpiBand([
      { value: k.total, label: "tickets (périmètre)" },
      { value: k.encours, label: "en cours" },
      { value: k.recette, label: "en recette / attente", tone: "gold" },
      { value: k.reprises, label: "reprises", tone: k.reprises ? "red" : "" },
      { value: k.retard, label: "en retard", tone: k.retard ? "red" : "" },
      { value: k.bloque, label: "bloqués", tone: k.bloque ? "red" : "" },
    ]),
    chapter({ over: "Flux", title: "Débit hebdomadaire — créés vs résolus", lead: `Sur ${d.weeks} semaines : ${flowTot.c} créé(s) · ${flowTot.r} résolu(s).` }),
    `<table class="rd-tbl"><thead><tr><th>Semaine</th><th style="text-align:right">Créés</th><th style="text-align:right">Résolus</th></tr></thead><tbody>${flowRows}</tbody></table>`,
    chapter({ over: "Pipeline", title: "Répartition par état" }),
    bars(d.repartition || []),
    chapter({ over: "Backlog", title: "Ancienneté du backlog ouvert" }),
    bars(d.aging || []),
    chapter({ over: "Charge", title: d.client && d.client !== "Tous" ? "Charge ouverte par projet" : "Charge ouverte par client" }),
    bars(d.charge || []),
    chapter({ over: "Priorité", title: "Priorité des tickets ouverts" }),
    bars(d.prio || []),
    chapter({ over: "Côté client", title: "Délais de recette / attente", lead: "Délai moyen en main du client (jours). Élevé = client lent à recetter." }),
    bars((d.recetteCli || []).map((c) => ({ label: c.client, value: c.avg, color: c.avg >= 30 ? C.red : C.indigo, suffix: " j" }))),
    oldestList ? `<div style="margin-top:8px">${oldestList}</div>` : "",
    chapter({ over: "Recette client", title: "Tickets en cours de validation client" }),
    ticketCards(d.recetteClient || [], u),
    chapter({ over: "Qualité", title: "Reprises — recette rejetée" }),
    ticketCards(d.reprises || [], u),
    chapter({ over: "Équipe", title: "Activité des développeurs", lead: "Tickets résolus sur 30 jours glissants." }),
    bars((d.devs || []).map((x) => ({ label: x.dev, value: x.resolu30 }))),
  ].join("\n");

  const html = charterDoc({
    docTitle: "Analyse & apprentissage — cp|WIRE",
    extraCss: RD_CSS,
    coverHtml: cover({
      kicker: "Référence · Analyse & apprentissage",
      title: "Analyse &amp; apprentissage",
      subtitle: `${d.client || "Tous les clients"}${d.eng && d.eng !== "Tous" ? ` · ${d.eng}` : ""}`,
      meta: `Lecture analytique du portefeuille — ${frDate()}`,
      enBref: `Lecture calculée en direct sur les données Jira (zéro invention). ${k.total} ticket(s) sur le périmètre, dont ${k.encours} en cours, ${k.recette} en recette/attente et ${k.reprises} reprise(s).`,
      callout: { value: k.retard || 0, label: "en retard", hint: `${k.bloque || 0} bloqué(s)` },
      etabliPar: "Nicolas Durand",
    }),
    bodyHtml: body,
    footerText: "cp|WIRE · Analyse & apprentissage",
  });
  return { html, filename: "Analyse-apprentissage.pdf" };
}

// ---------- 2) ANNUAIRE (référentiel recette) ----------
export function buildAnnuaireDoc(data, client, urlOf) {
  const u = urlOf || (() => "");
  const CAT = { afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod", recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client", miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé" };
  const body = (data.domaines || []).map((dom) => {
    const opts = dom.options.map((o) => {
      const progs = o.total === 0
        ? `<p class="rd-sub">Programmes à renseigner.</p>`
        : o.programmes.map((p) => p.lie
          ? `<div class="rd-prog"><span class="rd-pill">${esc(CAT[p.etat] || p.etat || "—")}</span><b style="color:${C.ink}">${esc(p.nom)}</b> ${(p.tickets || []).map((t) => tkLink(t.cle, u(t.cle))).join(" ")}</div>`
          : `<div class="rd-prog"><span class="rd-pill late">non lié</span><b style="color:${C.ink}">${esc(p.nom)}</b></div>`
        ).join("");
      return `<div class="rd-opt"><div class="rd-opt-h"><b>${esc(o.code)}</b><span>${o.statutRecette === "Armonie" ? "Recette Armonie" : "Recette client"}</span></div>` +
        `<div class="rd-opt-b"><div class="rd-opt-lib">${esc(o.libelle || "")}</div>` +
        `<div class="rd-opt-meta">${o.livraison ? `Livraison ${esc(o.livraison)} · ` : ""}${o.lies}/${o.total} programme(s) lié(s)${o.retours ? ` · ${o.retours} en retour` : ""}</div>` +
        progs + `</div></div>`;
    }).join("");
    return chapter({ over: "Domaine", title: esc(dom.domaine.replace(/_/g, " ")) }) + opts;
  }).join("\n");

  const html = charterDoc({
    docTitle: `Annuaire ${client} — cp|WIRE`,
    extraCss: RD_CSS,
    coverHtml: cover({
      kicker: "Référence · Annuaire",
      title: "Annuaire — référentiel recette",
      subtitle: client,
      meta: `Programmes rapprochés de leurs tickets Jira — ${frDate()}`,
      enBref: `${data.nbOptions} option(s) · ${data.nbProgrammes} programme(s). Chaque programme est rapproché de son ticket Jira (« non lié » sinon).`,
      etabliPar: "Nicolas Durand",
    }),
    bodyHtml: body,
    footerText: `cp|WIRE · Annuaire ${client}`,
  });
  return { html, filename: `Annuaire-${client}.pdf` };
}

// ---------- 3) MÉMOIRE D'ÉQUIPE ----------
export function buildMemoireDoc(k) {
  const g = k.global || {};
  const conventions = (g.conventions || []).length ? `<ul class="rd-ul">${(g.conventions).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : `<p class="rd-empty">Aucune convention enregistrée.</p>`;
  const glossG = (g.glossaire || []).length ? `<dl class="rd-kv">${(g.glossaire).map((x) => `<dt>${esc(x.terme)}</dt><dd>${esc(x.sens || "")}</dd>`).join("")}</dl>` : `<p class="rd-empty">Glossaire vide.</p>`;

  const clientsBody = Object.entries(k.clients || {}).map(([name, cl]) => {
    const att = (cl.attentes || []).length ? `<dt>Attentes</dt><dd><ul class="rd-ul">${cl.attentes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></dd>` : "";
    const voc = (cl.glossaire || []).length ? `<dt>Vocabulaire</dt><dd>${cl.glossaire.map((x) => `${esc(x.terme)}${x.sens ? " = " + esc(x.sens) : ""}`).join(" · ")}</dd>` : "";
    const notes = (cl.notes || []).length ? `<dt>Notes / consignes</dt><dd><ul class="rd-ul">${cl.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></dd>` : "";
    const auto = cl.auto && (cl.auto.points || []).length
      ? `<div class="rd-auto"><div class="rd-auto-l">🤖 Appris automatiquement de Jira</div><ul class="rd-ul">${cl.auto.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : "";
    const inner = `<dl class="rd-kv"><dt>Contexte</dt><dd>${esc(cl.contexte || "—")}</dd>${att}${voc}${notes}</dl>${auto}`;
    return section({ over: "Client", name, inner });
  }).join("\n");

  const body = [
    chapter({ over: "Général", title: "Conventions générales" }), conventions,
    chapter({ over: "Général", title: "Glossaire général" }), glossG,
    clientsBody,
  ].join("\n");

  const html = charterDoc({
    docTitle: "Mémoire d'équipe — cp|WIRE",
    extraCss: RD_CSS,
    coverHtml: cover({
      kicker: "Référence · Mémoire d'équipe",
      title: "Mémoire d'équipe",
      subtitle: "Ce que l'assistant sait de votre façon de travailler",
      meta: `Conventions, glossaire et contexte appris — ${frDate()}`,
      enBref: "Base relue par l'assistant à chaque rapport : conventions, glossaire, et, par client, contexte, attentes, vocabulaire, notes et contexte appris automatiquement de Jira.",
      etabliPar: "Nicolas Durand",
    }),
    bodyHtml: body,
    footerText: "cp|WIRE · Mémoire d'équipe",
  });
  return { html, filename: "Memoire-equipe.pdf" };
}
