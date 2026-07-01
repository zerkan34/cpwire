// ============================================================================
//  cp|WIRE — blockers.js
//  Dérive les POINTS BLOQUANTS qui allument le voyant MASTER WARNING, à partir
//  des MÊMES tickets que computeFacts. Chaque point répond à deux questions :
//    • POURQUOI il est là (un état VOULU, posé sur le ticket) ;
//    • DEPUIS QUAND il y est entré (date d'entrée dans l'état, pas l'inactivité).
//
//  GRAVE (rouge, "critique") :
//    - statut « Bloqué » (drapeau Jira OU étiquette bloqu/blocked/impediment) ;
//    - catégorie « retourProd » (incident après mise en production) ;
//    - enRetard (échéance dépassée — calculé serveur sur les cat. en charge).
//  À SURVEILLER (ambre, "majeur") :
//    - catégorie « retourTest » (recette rejetée, à reprendre) ;
//    - catégorie « afaire » AVEC un assigné (quelqu'un est dessus mais le statut
//      n'a pas été transitionné — angle mort du board).
//
//  On NE met PAS de signal d'inactivité (« sans activité depuis N j ») : ce n'est
//  pas un état voulu, et ce n'est pas ce qu'on veut voir ici.
//
//  `since` = date d'entrée dans l'état :
//    - en retard -> l'échéance (date à laquelle il l'est devenu) ;
//    - sinon -> statutDepuis (statuscategorychangedate Jira), repli sur maj.
// ============================================================================

import { CLOS } from "./groups.js";

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
    if (CLOS.includes(i.categorie)) continue; // clos -> jamais bloquant

    let severity = null;
    let reason = null;
    let kind = null;                              // bloque | retourProd | retard | retourTest | afaire
    let since = i.statutDepuis || i.maj || null; // date d'entrée dans l'état actuel (approx. avant enrichissement)

    if (i.statut === "Bloqué") {
      severity = "critique"; reason = "Bloqué — drapeau ou étiquette posé"; kind = "bloque";
    } else if (i.categorie === "retourProd") {
      severity = "critique"; reason = "Retour production — incident après mise en production"; kind = "retourProd";
    } else if (i.enRetard) {
      severity = "critique"; reason = "En retard — échéance dépassée"; kind = "retard";
      since = i.echeance || since; // devenu bloquant à l'échéance
    } else if (i.categorie === "retourTest") {
      severity = "majeur"; reason = "Retour test — recette rejetée, à reprendre"; kind = "retourTest";
    } else if (i.categorie === "afaire" && i.assigne && i.assigne !== "Non assigné") {
      severity = "majeur"; reason = "Assigné mais resté en « À faire » — statut non transitionné"; kind = "afaire";
    }

    if (!severity) continue;
    out.push({
      id: i.cle,
      title: i.resume,
      severity,
      reason,
      kind,
      since,                          // ISO — depuis quand dans cet état (raffiné via changelog à l'ouverture)
      daysSince: joursOuvres(since, now),
      maj: i.maj || null,             // dernière date de MOUVEMENT (cache + tri + détection dormant)
      cree: i.cree || null,           // date de MISE EN PLACE du ticket (tri)
      engagement: i.engagement || "", // "TMA" ou "Projet" -> pastille spéciale
      assignee: i.assigne,
      project: i.dossier,
      ref: i,                         // ticket réel -> ouverture directe (TicketModal)
    });
  }
  // Grave d'abord, puis le plus ancien dans l'état en tête.
  out.sort((a, b) =>
    (b.severity === "critique") - (a.severity === "critique") || b.daysSince - a.daysSince);
  return out;
}

// Nombre de points GRAVES = ce que le voyant rouge compte et fait pulser.
export const graveCount = (pts) => (pts || []).filter((p) => p.severity === "critique").length;
