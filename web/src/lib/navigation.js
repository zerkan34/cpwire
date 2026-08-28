// ============================================================================
//  navigation.js — structure de l'Atelier, regroupée par MOMENT DE TRAVAIL.
//
//  Avant : onze sous-onglets en liste plate (Récap, Charge, Développeurs, GANTT,
//  Planning, CRA, Réunions, Transcription, Engagements, Référence, Qualité).
//  Un tiroir fourre-tout où trois écrans qui forment une seule séquence métier
//  (préparer une réunion, la transcrire, suivre ce qui en sort) se retrouvaient
//  éparpillés au milieu de huit autres.
//
//  Maintenant : quatre familles, et à l'intérieur d'une famille, les écrans
//  s'enchaînent. La famille « Mes réunions » est explicitement séquentielle :
//  ses trois écrans sont numérotés, parce qu'ils se font dans cet ordre.
//
//  Les identifiants de sous-onglets ne changent PAS : les liens profonds, la
//  mémorisation du dernier écran et le filtrage par rôle continuent de marcher.
// ============================================================================

export const FAMILLES = [
  {
    id: "quotidien",
    label: "Mon quotidien",
    subs: ["morning", "hygiene"],
  },
  {
    id: "reunions",
    label: "Mes réunions",
    // sequence : les écrans sont numérotés et se lisent dans l'ordre.
    sequence: true,
    subs: ["reunions", "transcription", "engagements"],
  },
  {
    id: "portefeuille",
    label: "Mon portefeuille",
    subs: ["charge", "devs", "planning", "gantt", "cra"],
  },
  {
    id: "references",
    label: "Références",
    subs: ["reference"],
  },
];

// Libellés courts propres à la famille : dans « Mes réunions », « Réunions »
// ne veut plus rien dire puisque tout y parle de réunions. On nomme l'ACTION.
export const LABELS_FAMILLE = {
  reunions: { reunions: "Préparer", transcription: "Transcrire", engagements: "Suivre" },
};

/** Libellé à afficher pour un sous-onglet, dans le contexte de sa famille. */
export function libelleDans(familleId, sub) {
  const specifique = LABELS_FAMILLE[familleId] && LABELS_FAMILLE[familleId][sub.id];
  return specifique || sub.label;
}

/** La famille qui contient ce sous-onglet, ou null s'il n'est rattaché à aucune. */
export function familleDe(subId) {
  return FAMILLES.find((f) => f.subs.includes(subId)) || null;
}

/**
 * Familles réellement affichables, compte tenu des sous-onglets que le rôle
 * a le droit de voir. Une famille dont tout le contenu est masqué disparaît,
 * au lieu de rester présente et de mener à un écran vide.
 */
export function famillesVisibles(subsAutorises) {
  const permis = new Set(subsAutorises.map((s) => s.id));
  return FAMILLES
    .map((f) => ({ ...f, items: subsAutorises.filter((s) => f.subs.includes(s.id) && permis.has(s.id)) }))
    .filter((f) => f.items.length > 0);
}

/**
 * Sous-onglets d'un groupe qui n'appartiennent à aucune famille. Filet de
 * sécurité : si un écran est ajouté un jour sans être rattaché, il reste
 * atteignable au lieu de disparaître silencieusement de la navigation.
 */
export function orphelins(subsAutorises) {
  return subsAutorises.filter((s) => !familleDe(s.id));
}

/** Premier écran atteignable d'une famille, pour le clic sur son nom. */
export function premierDe(famille) {
  return famille && famille.items && famille.items.length ? famille.items[0].id : null;
}
