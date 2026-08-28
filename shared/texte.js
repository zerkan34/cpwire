// shared/texte.js — normalisation de texte, PARTAGÉE serveur et front.
//
// Il existait onze fonctions nommées « norm » dans le serveur et onze de plus dans le
// front. Toutes ne faisaient pas la même chose, et c'est justement le problème : sous
// un nom identique se cachaient au moins quatre comportements distincts, dont certains
// ne repliaient pas les accents. Deux écrans pouvaient donc rapprocher « Bellion » et
// « bellion » sur l'un et pas sur l'autre.
//
// On sépare désormais par INTENTION, avec des noms qui disent ce qu'ils font.

/** Texte pour l'AFFICHAGE : on retire seulement les espaces superflus. */
export const libelle = (s) => String(s == null ? "" : s).trim();

/**
 * Clé de COMPARAISON : minuscules, sans accents, sans espaces superflus.
 * À utiliser dès qu'on rapproche deux libellés (client, dossier, personne).
 * Jamais pour afficher.
 */
export const cle = (s) =>
  String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Deux libellés désignent-ils la même entité ? Accents et casse ignorés. */
export const memeEntite = (a, b) => cle(a) === cle(b);

/**
 * Clé d'ADRESSE ÉLECTRONIQUE : minuscules et espaces retirés, mais les accents
 * sont CONSERVÉS, parce qu'une adresse accentuée n'est pas la même qu'une autre.
 */
export const cleEmail = (s) => String(s == null ? "" : s).trim().toLowerCase();

/**
 * Clé de CODE technique (programme, objet IBM i) : majuscules, astérisque et
 * espaces de fin retirés. Rien à voir avec un libellé humain.
 */
export const cleCode = (s) => String(s == null ? "" : s).toUpperCase().replace(/[*\s]+$/g, "").trim();

/** Remplace tirets et soulignés par des espaces (lecture d'en-têtes importés). */
export const separateursEnEspaces = (s) => String(s == null ? "" : s).replace(/[_\-]+/g, " ");

/**
 * Échappement HTML, pour insérer du texte dans un document généré.
 * Il en existait onze copies (six côté front, cinq côté serveur), sous deux
 * écritures différentes mais au résultat identique.
 */
export const escHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
