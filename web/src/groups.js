// ============================================================================
//  SOURCE DE VÉRITÉ UNIQUE — regroupements de catégories de tickets.
//  Toute page qui compte des tickets par "famille" DOIT importer d'ici.
//  Objectif : un même mot (« actifs », « validés »…) = le MÊME calcul partout.
//  La catégorie atomique de chaque ticket (i.categorie) est, elle, calculée
//  une seule fois côté serveur — ne jamais la recalculer dans le front.
// ============================================================================

// Ordre canonique des catégories (identique au serveur).
export const CAT_ORDER = [
  "afaire", "encours", "retourTest", "retourProd",
  "recetteArmonie", "recetteClient", "attenteClient",
  "miseEnProd", "termine", "annule",
];

export const CAT_LABEL = {
  afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
  miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé",
};

// --- Familles canoniques (une seule définition pour toute l'appli) ---

// Ce qu'un développeur a ACTIVEMENT en main (travail en production).
export const ACTIFS = ["encours", "retourTest", "retourProd"];

// Vue PIPELINE de recette : ce qui n'est pas encore entré en recette.
export const PIPELINE_ACTIFS = ["afaire", "encours"];

// À retravailler (retours).
export const RETOUR = ["retourTest", "retourProd"];

// En phase de recette / validation (livré, en attente d'un feu vert).
export const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];

// Validés (réellement aboutis).
export const VALIDES = ["termine", "miseEnProd"];

// Clos = validés + annulés (sert à calculer « ce qu'il reste à traiter »).
export const CLOS = ["termine", "miseEnProd", "annule"];

// Helper : compte les tickets d'un tableau dont la catégorie est dans `group`.
export const countIn = (items, group) => items.reduce((n, i) => n + (group.includes(i.categorie) ? 1 : 0), 0);

// Correspondance statut -> classe de pastille. Elle était recopiée à l'identique dans
// sept composants ; une seule définition suffit, ici, avec le reste des familles.
export const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };
