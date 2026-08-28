// ============================================================================
//  commun.js — SOURCE DE VÉRITÉ UNIQUE pour les petits utilitaires transverses.
//
//  Pourquoi ce fichier : l'audit du 13/08/2026 a trouvé les mêmes fonctions
//  redéfinies en local dans une dizaine de composants, avec des variantes
//  SUBTILEMENT DIFFÉRENTES. Conséquence concrète : deux écrans qui affichent
//  la même chose ne rapprochaient pas les mêmes lignes, et les chiffres
//  divergeaient sans raison visible.
//
//  Exemples relevés avant mutualisation :
//    - 5 versions de « norm », dont 7 occurrences qui ne faisaient qu'un trim()
//      (donc « Bellion » et « bellion » restaient deux clients distincts) ;
//    - 4 versions de « frDate », dont une qui renvoyait la date DU JOUR quel
//      que soit son argument, sous le même nom que les trois autres ;
//    - 3 versions de « daysSince » et 2 de « joursOuvres ».
//
//  Règle : toute page qui normalise, compare ou formate importe d'ici.
//  Rien ne se redéfinit en local.
// ============================================================================

// Normalisation de texte : définie UNE SEULE fois dans shared/texte.js, partagée
// avec le serveur. Réexportée ici pour que les composants gardent un import unique.
// Avant, la même logique existait des deux côtés, avec des variantes divergentes.
export { libelle, cle, memeEntite, cleEmail, cleCode } from "../../../shared/texte.js";

/**
 * Date ISO vers JJ/MM/AAAA (DATE SEULE).
 * À ne pas confondre avec frDate() de utils.js, qui affiche date ET heure :
 * les deux existent légitimement, d'où deux noms distincts.
 */
export function frDateCourte(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}

/** Date du jour en toutes lettres (« mardi 13 août 2026 »). */
export const dateDuJour = () =>
  new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

/** Nombre de jours CALENDAIRES écoulés depuis une date ISO. null si invalide. */
export function daysSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}

/**
 * Nombre de jours OUVRÉS écoulés depuis une date ISO (week-ends exclus).
 * `now` est paramétrable pour rendre la fonction testable.
 */
export function joursOuvres(iso, now = new Date()) {
  if (!iso) return null;
  const debut = new Date(iso);
  if (isNaN(debut.getTime())) return null;
  const a = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (b <= a) return 0;
  let n = 0;
  const curseur = new Date(a);
  while (curseur < b) {
    curseur.setDate(curseur.getDate() + 1);
    const j = curseur.getDay();
    if (j !== 0 && j !== 6) n++;
  }
  return n;
}

/** Nombre formaté à la française (espace insécable comme séparateur de milliers). */
export const nf = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("fr-FR") : "—");

/** Échappement HTML, pour les contenus injectés dans un document généré. */
export const escHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
