// shared/groupes.js — SOURCE UNIQUE des familles de catégories, PARTAGÉE serveur et front.
//
// Contexte : web/src/groups.js jouait déjà ce rôle côté navigateur, mais le serveur
// redéfinissait les mêmes familles dans six fichiers, et sous TROIS formes différentes :
//   coherence.js / hygiene.js : const DONE = new Set([...])       → DONE.has(cat)
//   projections.js / risk.js  : const DONE = ["termine", ...]     → DONE.includes(cat)
//   cadence.js                : const DONE = (i) => ...           → DONE(issue)
// Trois écritures du même concept, c'est trois occasions de le faire diverger le jour où
// une catégorie s'ajoute. On expose donc les deux formes utiles, explicitement nommées.
//
// Les catégories atomiques (i.categorie) restent calculées une seule fois côté serveur.

export const VALIDES = ["termine", "miseEnProd"];        // réellement aboutis
export const CLOS = ["termine", "miseEnProd", "annule"]; // aboutis + annulés
export const ACTIFS = ["encours", "retourTest", "retourProd"];
export const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];

// Formes pratiques, pour ne pas obliger chaque appelant à refabriquer son Set.
export const VALIDES_SET = new Set(VALIDES);
export const CLOS_SET = new Set(CLOS);

/** Le ticket est-il abouti ? (terminé ou mis en production) */
export const estValide = (issue) => VALIDES_SET.has(issue && issue.categorie);
/** Le ticket est-il clos ? (abouti ou annulé) */
export const estClos = (issue) => CLOS_SET.has(issue && issue.categorie);
/** Le ticket est-il encore à traiter ? */
export const estOuvert = (issue) => !estClos(issue);
