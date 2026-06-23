// ============================================================================
//  cp|WIRE — blockers.js
//  Dérive les POINTS BLOQUANTS qui allument le voyant MASTER WARNING, à partir
//  des MÊMES tickets que computeFacts (i.categorie, i.enRetard, i.flagged,
//  i.maj, i.cree) — aucune source parallèle, donc aucune divergence possible
//  avec le point du soir. Rien n'est inventé : tous les champs lus existent
//  sur l'objet ticket normalisé côté serveur (jira.js → normalize()).
//
//  GRAVE (allume le rouge, severity "critique") :
//    - drapeau Jira posé (impediment) ;
//    - catégorie « retourProd » (incident après mise en production) ;
//    - enRetard (échéance dépassée, déjà calculé serveur sur les cat. en charge) ;
//    - actif sans activité (i.maj) depuis >= staleCrit jours ouvrés.
//  À SURVEILLER (ambre, severity "majeur") :
//    - catégorie « retourTest » (recette rejetée, à reprendre) ;
//    - actif sans activité depuis >= staleMaj jours ouvrés ;
//    - en souffrance (ouvert depuis la création au-delà du seuil).
// ============================================================================

import { ACTIFS, RETOUR, CLOS } from "./groups.js";

// Seuils — PROVISOIRES, à recalibrer sur les délais moyens IMA (cf. SLA / sla.js).
export const BLK_SEUILS = {
  staleCrit: 5,    // actif figé >= 5 j ouvrés -> grave
  staleMaj: 3,     // actif figé >= 3 j ouvrés -> à surveiller
  souffrance: 21,  // ouvert depuis la création > 21 j -> à surveiller (aligné computeSouffrance)
};

// Jours ouvrés écoulés depuis une date ISO (week-ends exclus).
function joursOuvres(iso, now) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d)) return 0;
  let n = 0;
  const cur = new Date(d);
  while (cur < now) {
    cur.setDate(cur.getDate() + 1);
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export function computeBlockers(issues = [], now = new Date()) {
  const out = [];
  for (const i of issues || []) {
    if (CLOS.includes(i.categorie)) continue;        // clos -> jamais bloquant
    const actif = ACTIFS.includes(i.categorie);
    const idle = joursOuvres(i.maj, now);            // sans activité (dernière MAJ)
    const age = joursOuvres(i.cree, now);            // âge depuis création (souffrance)

    let severity = null;
    let reason = null;
    let ageDays = idle;

    if (i.statut === "Bloqué") {
      severity = "critique"; reason = "Bloqué (drapeau ou étiquette)";
    } else if (i.categorie === "retourProd") {
      severity = "critique"; reason = "Retour production — incident après MEP";
    } else if (i.enRetard) {
      severity = "critique"; reason = "En retard — échéance dépassée";
    } else if (actif && idle >= BLK_SEUILS.staleCrit) {
      severity = "critique"; reason = `Sans activité depuis ${idle} j`;
    } else if (i.categorie === "retourTest") {
      severity = "majeur"; reason = "Retour test — recette rejetée, à reprendre";
    } else if (actif && idle >= BLK_SEUILS.staleMaj) {
      severity = "majeur"; reason = `Sans activité depuis ${idle} j`;
    } else if (age > BLK_SEUILS.souffrance) {
      severity = "majeur"; reason = `En souffrance — ouvert depuis ${age} j`;
      ageDays = age;
    }

    if (!severity) continue;
    out.push({
      id: i.cle,
      title: i.resume,
      severity,
      reason,
      ageDays,
      assignee: i.assigne,
      project: i.dossier,
      ref: i,                 // ticket réel -> ouverture directe (TicketModal)
    });
  }
  out.sort((a, b) =>
    (b.severity === "critique") - (a.severity === "critique") || b.ageDays - a.ageDays);
  return out;
}

// Nombre de points GRAVES = ce que le voyant rouge compte et fait pulser.
export const graveCount = (pts) => (pts || []).filter((p) => p.severity === "critique").length;
