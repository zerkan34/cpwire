import { ARMONIE_PALETTE as P } from "../shared/armonie-palette.js";
import { escHtml } from "../shared/texte.js";
// digest.js — DIGEST QUOTIDIEN (« le point du soir qui vient à toi »).
// -----------------------------------------------------------------------------
// Compose, à partir de faits DÉJÀ calculés, un résumé de fin de journée :
// ce qui a bougé, ce qui a dépassé (SLA/GTI), les échéances de la semaine, et
// les récurrences à surveiller. Zéro invention : chaque ligne vient d'une source
// réelle. L'ENVOI (mail/Slack) est séparé et conditionné aux accès (voir app.js) —
// on ne prétend jamais avoir envoyé quelque chose qu'on n'a pas pu envoyer.

const cap = (n, arr) => arr.slice(0, n);

export function buildDigest({ pointDerived = null, slaReport = null, radar = [], recurrences = [], engagements = [] } = {}) {
  const date = new Date().toISOString().slice(0, 10);

  // Mouvements du jour (dernier jour dérivé des instantanés).
  const days = pointDerived && Array.isArray(pointDerived.days) ? pointDerived.days : [];
  const last = days.length ? days[days.length - 1] : null;
  const movs = last && Array.isArray(last.movements) ? last.movements : [];
  const regressions = movs.filter((m) => m.regression)
    .map((m) => ({ cle: m.cle, dossier: m.dossier || "—", detail: `${m.fromLabel || "?"} → ${m.toLabel || "?"}` }));
  const mouvements = { total: movs.length, top: cap(6, movs.map((m) => ({ cle: m.cle, dossier: m.dossier || "—", detail: `${m.fromLabel || "?"} → ${m.toLabel || "?"}` }))) };

  // SLA (résolution) et GTI (prise en charge) — dépassements.
  const overGtr = (slaReport?.alerts || []).filter((a) => a.state === "over");
  const overGti = (slaReport?.gtiAlerts || []).filter((a) => a.state === "over");
  const sla = { depasses: overGtr.length, top: cap(5, overGtr.map((a) => ({ cle: a.cle, dossier: a.dossier || "—", detail: `${a.bucket || ""} +${Math.round(a.depassementH || 0)} h` }))) };
  const gti = { depasses: overGti.length, top: cap(5, overGti.map((a) => ({ cle: a.cle, dossier: a.dossier || "—", detail: `${a.bucket || ""} prise en charge +${Math.round(a.depassementH || 0)} h` }))) };

  // Échéances : en retard + cette semaine (fait deadlines.js).
  const retard = (radar || []).filter((r) => r.statut === "retard").map((r) => ({ dossier: r.dossier, label: r.label, jours: r.joursRestants }));
  const semaine = (radar || []).filter((r) => r.statut === "semaine").map((r) => ({ dossier: r.dossier, label: r.label, jours: r.joursRestants }));
  const echeances = { retard: cap(8, retard), semaine: cap(8, semaine) };

  // Engagements : ce qui a été promis en séance et qui arrive à terme. Les échéances
  // ci-dessus viennent des fiches et de la mémoire ; celles-ci viennent des réunions.
  // Deux origines différentes, donc deux blocs : les mélanger ferait perdre l'information
  // « qui s'est engagé ».
  const ouverts = (engagements || []).filter((e) => e && !e.clos && e.nature !== "decision");
  const engRetard = ouverts.filter((e) => e.urgence === "retard");
  const engSemaine = ouverts.filter((e) => e.urgence === "imminent" || e.urgence === "semaine");
  const ligneEng = (e) => ({ dossier: e.client || "—", label: e.quoi, qui: e.qui || "", jours: e.joursRestants });
  const engagementsBloc = {
    ouverts: ouverts.length,
    retard: cap(8, engRetard.map(ligneEng)),
    semaine: cap(8, engSemaine.map(ligneEng)),
  };

  return {
    date,
    mouvements, regressions: cap(8, regressions),
    sla, gti,
    echeances,
    engagements: engagementsBloc,
    recurrences: cap(6, recurrences || []),
    vide: !mouvements.total && !sla.depasses && !gti.depasses && !retard.length && !semaine.length
      && !engagementsBloc.retard.length && !engagementsBloc.semaine.length,
  };
}

// Version texte simple, prête pour un corps de mail / message Slack.
export function digestText(d) {
  const L = [];
  L.push(`cp|WIRE — point du soir du ${d.date}`);
  L.push("");
  L.push(`• Mouvements aujourd'hui : ${d.mouvements.total}`);
  if (d.regressions.length) L.push(`• Retours en arrière : ${d.regressions.length} (${d.regressions.slice(0, 3).map((r) => r.cle).join(", ")}…)`);
  L.push(`• SLA dépassés (résolution) : ${d.sla.depasses}`);
  L.push(`• Prise en charge dépassée (GTI) : ${d.gti.depasses}`);
  L.push(`• Échéances en retard : ${d.echeances.retard.length} · cette semaine : ${d.echeances.semaine.length}`);
  const eng = d.engagements || { retard: [], semaine: [], ouverts: 0 };
  L.push(`• Engagements en retard : ${eng.retard.length} · cette semaine : ${eng.semaine.length} (sur ${eng.ouverts} ouverts)`);
  if (eng.retard.length) {
    L.push("");
    L.push("Engagements en retard :");
    for (const e of eng.retard) L.push(`  - ${e.dossier} : ${e.label}${e.qui ? ` (${e.qui})` : ""}`);
  }
  if (d.recurrences.length) {
    L.push("");
    L.push("Récurrences à surveiller :");
    for (const r of d.recurrences) L.push(`  - ${r.dossier} : ${r.type} ×${r.n}`);
  }
  L.push("");
  L.push("— Établi automatiquement par cp|WIRE, à partir des données Jira. Aucune valeur estimée.");
  return L.join("\n");
}

// Corps HTML du digest, à la charte Armonie (styles inline = compatibles mail).
export function digestHtml(d) {
  // Palette : on la lit dans la source unique (shared/armonie-palette.js) au lieu de la
  // recopier ici. Les valeurs étaient identiques à une exception près (le rouge, #b23b46
  // contre #C0392B) : c'est exactement ainsi qu'une charte se met à diverger sans que
  // personne ne s'en aperçoive.
  const NAVY = P.navy, INDIGO = P.indigo, GOLD = P.gold, LAV = P.soft, INK = P.ink, GREY = P.muted, LINE = P.line, RED = P.red;
  const kpi = (n, lbl, warn) => `<td align="center" style="padding:10px 6px;border:1px solid ${LINE};border-radius:10px;background:${warn && n ? "#fbeef0" : LAV};">
      <div style="font-family:'Poppins',Arial,sans-serif;font-weight:800;font-size:22px;color:${warn && n ? RED : NAVY};">${n}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:${GREY};margin-top:2px;">${escHtml(lbl)}</div></td>`;
  const li = (dossier, cle, detail, tag, tagColor) => `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid ${LINE};font-family:Arial,sans-serif;font-size:13px;color:${INK};">
        ${tag ? `<span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:${tagColor || GREY};background:${LAV};border-radius:6px;padding:2px 7px;margin-right:7px;">${escHtml(tag)}</span>` : ""}
        <b style="color:${NAVY};">${escHtml(dossier)}</b>${cle ? ` <span style="color:${GOLD};font-weight:700;">${escHtml(cle)}</span>` : ""}
        <span style="color:${GREY};"> — ${escHtml(detail)}</span></td></tr>`;
  const section = (title, rowsHtml) => rowsHtml ? `
    <tr><td style="padding:18px 0 6px;font-family:'Poppins',Arial,sans-serif;font-weight:700;font-size:14px;color:${NAVY};">${escHtml(title)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml}</table></td></tr>` : "";

  const echRows = [
    ...d.echeances.retard.map((e) => li(e.dossier, "", e.label, "en retard", RED)),
    ...d.echeances.semaine.map((e) => li(e.dossier, "", e.label, "cette semaine", GOLD)),
  ].join("");
  const engRows = [
    ...((d.engagements && d.engagements.retard) || []).map((e) => li(e.dossier, "", `${e.label}${e.qui ? ` — ${e.qui}` : ""}`, "en retard", RED)),
    ...((d.engagements && d.engagements.semaine) || []).map((e) => li(e.dossier, "", `${e.label}${e.qui ? ` — ${e.qui}` : ""}`, "cette semaine", GOLD)),
  ].join("");
  const regRows = d.regressions.map((r) => li(r.dossier, r.cle, r.detail)).join("");
  const slaRows = d.sla.top.map((r) => li(r.dossier, r.cle, r.detail, "SLA", RED)).join("");
  const recRows = d.recurrences.map((r) => li(r.dossier, "", `${r.type} ×${r.n}`)).join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#eceaf3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceaf3;padding:24px 0;">
   <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(31,27,51,.12);">
     <tr><td style="height:4px;background:linear-gradient(90deg,${NAVY},${INDIGO} 55%,${GOLD});font-size:0;line-height:4px;">&nbsp;</td></tr>
     <tr><td style="padding:22px 28px 6px;">
       <div style="font-family:'Poppins',Arial,sans-serif;font-weight:800;font-size:18px;color:${NAVY};letter-spacing:.01em;">cp<span style="color:${GOLD};">|</span>WIRE</div>
       <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};font-weight:700;margin-top:2px;">Point du soir</div>
       <div style="font-family:'Poppins',Arial,sans-serif;font-weight:700;font-size:20px;color:${INK};margin-top:10px;">Ce qui a bougé aujourd'hui</div>
       <div style="width:96px;height:3px;background:${GOLD};margin-top:8px;border-radius:2px;"></div>
       <div style="font-family:Arial,sans-serif;font-size:12px;color:${GREY};margin-top:8px;">${escHtml(d.date)} · composé automatiquement à partir des données Jira. Aucune valeur estimée.</div>
     </td></tr>
     <tr><td style="padding:14px 28px 0;">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;"><tr>
         ${kpi(d.mouvements.total, "mouvements")}
         ${kpi(d.regressions.length, "retours arrière", true)}
         ${kpi(d.sla.depasses, "SLA dépassés", true)}
         ${kpi(d.gti.depasses, "prise en charge", true)}
       </tr></table>
     </td></tr>
     <tr><td style="padding:2px 28px 22px;">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
         ${section("Échéances", echRows)}
         ${section("Engagements pris en séance", engRows)}
         ${section("Retours en arrière", regRows)}
         ${section("SLA dépassés", slaRows)}
         ${section("Récurrences à surveiller", recRows)}
         ${d.vide ? `<tr><td style="padding:16px 0;font-family:Arial,sans-serif;font-size:13px;color:${GREY};">Rien à signaler aujourd'hui : aucun mouvement, dépassement ni échéance imminente.</td></tr>` : ""}
       </table>
     </td></tr>
     <tr><td style="padding:14px 28px;border-top:1px solid ${LINE};font-family:Arial,sans-serif;font-size:11px;color:${GREY};">
       Armonie Group · cp|WIRE — cockpit de pilotage. Confidentiel.
     </td></tr>
    </table>
   </td></tr>
  </table></body></html>`;
}
