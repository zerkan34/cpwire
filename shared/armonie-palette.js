// shared/armonie-palette.js — SOURCE UNIQUE de la palette de la charte Armonie.
//
// Valeurs relevées AU PIXEL sur le document de référence
// ARMONIE-DIAPAR-SEGUREL-ARBITRAGE-2026-08-06 (Arbitrage du périmètre AUTOMSI),
// et non reconstituées de mémoire.
//
// Correction du 13/08/2026 : ce fichier portait encore l'ancienne charte
// navy #2E2A5D / indigo #4B3F8F / or #A88B4B. Elle est PÉRIMÉE. Tous les
// documents produits par cp|WIRE sortaient donc hors charte.
//
// Les clés gardent leurs anciens noms pour ne rien casser chez les fichiers qui
// les importent, mais elles portent désormais les bonnes teintes :
//   navy   -> le violet de la charte  (titres, en-têtes de tableau, aplats)
//   indigo -> le violet clair         (filets, seconds plans)
//   gold   -> le jaune doré           (kickers, accents)
//
// Le dégradé de couverture va de NOIR à VIOLET à JAUNE (vérifié sur le document :
// #1E1E1F, puis #2E275C, puis #EBBD1A d'un bord à l'autre).
export const ARMONIE_PALETTE = {
  // Teintes principales
  navy: "#3B2E8C",    // VIOLET Armonie, teinte dominante
  indigo: "#C4C0DC",  // violet clair, filets et aplats secondaires
  gold: "#F2C316",    // JAUNE doré, kickers et accents
  gold2: "#F4CC3A",   // jaune clair, dégradés et survols

  // Neutres
  ink: "#1D1D1B",     // noir Armonie, texte courant
  muted: "#6E6A86",   // gris, texte secondaire
  soft: "#F5F2FC",    // lavande, fonds d'encart et lignes alternées
  line: "#E2DEF0",    // filet

  // Sémantiques
  green: "#2F7D4F",   // acquis, validé
  amber: "#C2691A",   // vigilance
  red: "#E91E63",     // MAGENTA Armonie, alerte et échéance ferme
};

// Alias explicites, pour que le code écrit à partir d'ici nomme les couleurs
// telles qu'elles s'appellent dans la charte.
export const ARMONIE = {
  noir: "#1D1D1B",
  violet: "#3B2E8C",
  violetClair: "#C4C0DC",
  jaune: "#F2C316",
  magenta: "#E91E63",
  lavande: "#F5F2FC",
  gris: "#6E6A86",
  filet: "#E2DEF0",
  vert: "#2F7D4F",
};

// Dégradé de couverture : noir, violet, jaune.
export const ARMONIE_GRADIENT = "linear-gradient(90deg, #1D1D1B 0%, #3B2E8C 55%, #F2C316 100%)";
