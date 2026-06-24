// blockersDoc.js — Document « Points bloquants » charté, par client. Inclus dans le ZIP du récap.
// Chiffres et dates 100 % issus des données (jamais inventés). Les tickets « dormants » (sans
// mouvement depuis longtemps, probablement obsolètes) sont EXCLUS, comme dans le voyant.

import { computeBlockers } from "./blockers.js";
import { cover, section, chapter, kpiBand, charterDoc } from "./charter.js";

const NAVY = "#2E2A5D", INDIGO = "#4B3F8F", GOLD = "#A8884E", INK = "#1F1B33";
const MUTED = "#6E6A86", SOFT = "#F5F2FC", LINE = "#e7e5f1", RED = "#C0392B", AMBER = "#C2691A";
const OBSOLETE_DAYS = 180;

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmtD(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function joursOuvres(iso, now = new Date()) {
  if (!iso) return 0; const d = new Date(iso); if (isNaN(d)) return 0;
  let n = 0; const cur = new Date(d);
  while (cur < now) { cur.setDate(cur.getDate() + 1); const wd = cur.getDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}
const daysCal = (iso) => { if (!iso) return 0; const d = new Date(iso); return isNaN(d) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000); };
function sinceLabel(kind) {
  switch (kind) {
    case "retard": return "échéance dépassée le";
    case "bloque": return "signalé bloquant le";
    case "retourProd": return "passé en retour prod le";
    case "retourTest": return "passé en retour test le";
    case "afaire": return "en « À faire » depuis le";
    default: return "dans cet état depuis le";
  }
}
function preciseSince(p, sinceMap) {
  if (p.kind === "retard") return p.since;
  const s = sinceMap[p.id];
  if (!s) return p.since;
  if (p.kind === "bloque") return s.flaggedAt || s.enteredStatusAt || p.since;
  return s.enteredStatusAt || p.since;
}
function clientIntro(list) {
  const c = list.filter((p) => p.severity === "critique").length;
  const m = list.length - c;
  const bits = [`${list.length} point${list.length > 1 ? "s" : ""} bloquant${list.length > 1 ? "s" : ""}`];
  if (c) bits.push(`${c} critique${c > 1 ? "s" : ""}`);
  if (m) bits.push(`${m} à surveiller`);
  let txt = bits.join(" · ");
  const oldest = list.slice().sort((a, b) => b._days - a._days)[0];
  if (oldest && oldest._since) txt += `. Le plus ancien dans son état : ${oldest.id}, ${sinceLabel(oldest.kind)} ${fmtD(oldest._since)} (${oldest._days} j ouvrés).`;
  return txt;
}
function engTag(eng) {
  if (eng === "Projet") return `<span class="eng eng-p">PROJET</span>`;
  if (eng === "TMA") return `<span class="eng eng-t">TMA</span>`;
  return "";
}

// Chemin « ZIP du récap » : recalcule tout depuis les tickets et exclut les dormants (>180 j).
export function buildBlockersDoc(issues = [], { meName = "", sinceMap = {} } = {}) {
  const all = computeBlockers(issues).map((p) => {
    const _since = preciseSince(p, sinceMap);
    return { ...p, _since, _days: joursOuvres(_since), _moveDays: daysCal(p.maj) };
  });
  const dormant = all.filter((p) => p._moveDays > OBSOLETE_DAYS).length;
  const pts = all.filter((p) => p._moveDays <= OBSOLETE_DAYS); // dormants exclus
  return renderBlockersHtml(pts, { meName, dormant });
}

// Chemin « export du voyant » : rend EXACTEMENT la liste déjà filtrée à l'écran
// (client choisi, dormants masqués ou non, recherche, tri). Aucun recalcul, aucune
// ré-exclusion — fidélité totale aux filtres. `caption` décrit les filtres appliqués.
export function buildBlockersDocFromPoints(points = [], { meName = "", caption = "", dormant = 0 } = {}) {
  const pts = points.map((p) => ({
    ...p,
    _since: (p._since != null ? p._since : p.since) || null,
    _days: (p._days != null ? p._days : joursOuvres(p._since != null ? p._since : p.since)),
    _moveDays: (p._moveDays != null ? p._moveDays : daysCal(p.maj)),
  }));
  return renderBlockersHtml(pts, { meName, dormant, caption });
}

// Rendu charté commun (depuis une liste de points déjà préparés).
function renderBlockersHtml(pts, { meName = "", dormant = 0, caption = "" } = {}) {
  const crit = pts.filter((p) => p.severity === "critique").length;
  const byClient = {};
  pts.forEach((p) => { const c = p.project || "—"; (byClient[c] ||= []).push(p); });
  const clients = Object.keys(byClient).sort();
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const sections = clients.map((c) => {
    const list = byClient[c].slice().sort((a, b) => (b.severity === "critique") - (a.severity === "critique") || b._days - a._days);
    const rows = list.map((p) => {
      const col = p.severity === "critique" ? RED : AMBER;
      const tag = p.severity === "critique" ? "CRITIQUE" : "MAJEUR";
      return `<tr>
        <td class="sev"><span class="badge" style="background:${col}">${tag}</span>${engTag(p.engagement)}</td>
        <td class="cle">${esc(p.id)}</td>
        <td class="res"><div class="t">${esc(p.title || "")}</div><div class="why" style="color:${col}">${esc(p.reason || "")}</div></td>
        <td class="dev">${esc(p.assignee || "Non assigné")}</td>
        <td class="since">${sinceLabel(p.kind)}<br><b>${fmtD(p._since)}</b><span class="d">${p._days} j ouvrés</span></td>
      </tr>`;
    }).join("");
    const table = `<table><thead><tr><th>Gravité</th><th>Ticket</th><th>Sujet &amp; raison</th><th>Développeur</th><th>Depuis</th></tr></thead><tbody>${rows}</tbody></table>`;
    return section({ over: `Dossier · ${list.length} point${list.length > 1 ? "s" : ""}`, name: c, intro: esc(clientIntro(list)), inner: table });
  }).join("");

  const body = pts.length ? sections : `<p class="ch-empty">Aucun point bloquant actif à signaler. Tous les voyants sont au vert.</p>`;
  const etabli = meName || "Nicolas Durand";
  const clientsLabel = clients.length ? clients.join(", ") : "—";

  const synth = chapter({
    over: "Synthèse", title: "Vue d'ensemble",
    lead: `Répartition des ${pts.length} point${pts.length > 1 ? "s" : ""} bloquant${pts.length > 1 ? "s" : ""} sur ${clients.length} client${clients.length > 1 ? "s" : ""}. Le détail par client suit.`,
  })
    + kpiBand([
      { value: pts.length, label: "points bloquants" },
      { value: crit, label: "critiques", tone: "cri" },
      { value: pts.length - crit, label: "à surveiller", tone: "maj" },
      { value: clients.length, label: "clients", tone: "idg" },
    ])
    + `<div class="ch-legend"><div class="lt">Comment lire ce document</div>
        <div class="row"><span class="k c">Critique</span><span>Échéance dépassée.</span></div>
        <div class="row"><span class="k m">Majeur</span><span>Assigné mais resté en « À faire » (statut non transitionné), recette rejetée, ou signalé bloquant.</span></div>
        <div class="row"><span class="k d">Depuis</span><span>Date d'entrée réelle dans l'état bloquant, et ancienneté en jours ouvrés.</span></div>
      </div>`
    + (caption ? `<p class="ch-filt">Filtres appliqués : ${esc(caption)}</p>` : "")
    + (dormant ? `<p class="ch-note">${dormant} ticket${dormant > 1 ? "s" : ""} dormant${dormant > 1 ? "s" : ""} (sans mouvement depuis plus de ${OBSOLETE_DAYS} jours, probablement obsolète${dormant > 1 ? "s" : ""}) exclu${dormant > 1 ? "s" : ""} de ce relevé.</p>` : "");

  const coverHtml = cover({
    kicker: "Armonie Group · Points bloquants",
    title: "Points<br>bloquants",
    subtitle: "Portefeuille TMA & Projets — suivi multi-clients",
    meta: `${clients.length} client${clients.length > 1 ? "s" : ""} · ${today}`,
    pill: "Document de travail interne",
    enBref: `${pts.length} point${pts.length > 1 ? "s" : ""} bloquant${pts.length > 1 ? "s" : ""} recensé${pts.length > 1 ? "s" : ""} sur l'ensemble du portefeuille. ${clients.length} client${clients.length > 1 ? "s" : ""} concerné${clients.length > 1 ? "s" : ""} : ${esc(clientsLabel)}. ${crit} critique${crit > 1 ? "s" : ""} (échéance dépassée) · ${pts.length - crit} à surveiller (statut figé). Données issues de Jira : statuts, drapeaux et historique.`,
    callout: crit ? { value: crit, label: "dont critiques", hint: "échéance dépassée — à traiter en priorité" } : null,
    etabliPar: etabli,
  });

  const extraCss = `
    td.sev{width:80px} td.cle{width:80px;font-family:ui-monospace,Menlo,monospace;font-weight:700;color:${GOLD};padding-top:11px}
    td.dev{width:120px;font-weight:600} td.since{width:108px;white-space:nowrap;color:${MUTED};font-size:10px;line-height:1.35}
    td.since b{color:${INK};font-size:11.5px} td.since .d{display:block;color:${MUTED};font-size:9.5px;margin-top:1px}
    .badge{display:inline-block;color:#fff;font-size:8px;font-weight:800;letter-spacing:.5px;padding:3px 7px;border-radius:5px}
    .eng{display:inline-block;margin-top:5px;font-size:7.5px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:5px}
    .eng-p{background:#fff2e7;color:#b4560b;border:1px solid #f0d2b0}
    .eng-t{background:#e2f3ea;color:#1f8a5f;border:1px solid #bfe3d0}
    .res .t{font-weight:600;line-height:1.35} .res .why{font-size:10px;font-weight:600;margin-top:3px}
    .ch-filt{font-size:10.5px;color:${INDIGO};font-weight:600;margin:0 0 8px} .ch-note{font-size:10.5px;color:${MUTED};margin:0 0 14px;font-style:italic}
    .ch-empty{color:${MUTED};padding:26px;text-align:center;font-size:13px}`;

  const html = charterDoc({
    docTitle: `Points bloquants — ${today}`,
    extraCss,
    coverHtml,
    bodyHtml: synth + body,
    footerText: `Points bloquants · ${today} · Confidentiel`,
  });

  return { name: "Points-bloquants.html", dossier: "Points bloquants", html, count: pts.length };
}
