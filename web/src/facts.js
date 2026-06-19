// ============================================================================
//  SOURCE DE VÉRITÉ UNIQUE — chiffres par dossier, calculés depuis le LIVE JIRA.
//  computeFacts(issues) est LE seul calcul. Tous les écrans (Vue d'ensemble,
//  Recette, Suivi de projets, Client 360) lisent ces chiffres — donc plus
//  aucune contradiction d'un écran à l'autre.
//
//  Chaque chiffre dérive des catégories ATOMIQUES (i.categorie, calculée une
//  fois côté serveur) et du drapeau i.enRetard (calculé une fois côté serveur).
//  On ne réinvente rien ici : on agrège, point.
// ============================================================================
import { CAT_ORDER, ACTIFS, PIPELINE_ACTIFS, RETOUR, RECETTE, VALIDES, CLOS } from "./groups.js";

function emptyCats() {
  const c = {};
  for (const k of CAT_ORDER) c[k] = 0;
  return c;
}

// Construit le bloc de chiffres d'un lot de tickets (un dossier, ou tout).
function build(items) {
  const cats = emptyCats();
  let enRetard = 0, nonAssigne = 0;
  for (const i of items) {
    if (cats[i.categorie] !== undefined) cats[i.categorie] += 1;
    if (i.enRetard) enRetard += 1;
    if (!i.assigne || i.assigne === "Non assigné") nonAssigne += 1;
  }
  const sum = (g) => g.reduce((n, k) => n + cats[k], 0);
  const total = items.length;
  const valides = sum(VALIDES);
  const annule = cats.annule;
  const clos = sum(CLOS);
  return {
    total,
    cats,                      // compte atomique par catégorie
    afaireEncours: sum(PIPELINE_ACTIFS), // pipeline : pas encore en recette
    actifsDev: sum(ACTIFS),    // ce qu'un dév a activement en main
    retours: sum(RETOUR),      // à retravailler
    enRecette: sum(RECETTE),   // livré, en attente de feu vert
    valides,                   // terminé + mis en prod
    annule,
    clos,                      // validés + annulés
    reste: total - clos,       // ce qu'il reste réellement à traiter
    enRetard,
    nonAssigne,
    pct: total ? Math.round((valides / total) * 100) : 0,
    items,
  };
}

// Agrège les tickets par dossier + un bloc global.
export function computeFacts(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const groups = {};
  for (const i of list) {
    const d = i.dossier || "—";
    (groups[d] || (groups[d] = [])).push(i);
  }
  const byDossier = {};
  for (const d of Object.keys(groups)) byDossier[d] = build(groups[d]);
  return {
    byDossier,
    global: build(list),
    // Récupère le bloc d'un dossier (jamais undefined → bloc vide).
    get(dossier) { return byDossier[dossier] || build([]); },
  };
}

// Bloc vide réutilisable (composants sans données).
export const EMPTY_FACT = build([]);
