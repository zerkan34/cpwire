// photos.js — collecte AUTOMATIQUE des photos déposées dans ce dossier.
//
// COMMENT AJOUTER UNE PHOTO :
//   1. Dépose le fichier image ICI (dossier web/src/team/).
//   2. Nomme-le d'après la personne : minuscules, sans accents, espaces => tirets.
//        « Nicolas Durand »      -> nicolas-durand.jpg
//        « Amélia Ulloa Torres » -> amelia-ulloa-torres.jpg
//        « Inès Ghamgui »        -> ines-ghamgui.jpg
//   3. Formats acceptés : .jpg .jpeg .png .webp
//   4. Pousse + redéploie : la photo apparaît sur la fiche du développeur.
//
// Si aucune photo ne correspond, la fiche affiche automatiquement les INITIALES.
// Rien n'est inventé, rien ne casse si le dossier est vide.

const mods = import.meta.glob("./*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}", {
  eager: true,
  query: "?url",
  import: "default",
});

export const PHOTOS = {};
for (const p in mods) {
  const base = p.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
  PHOTOS[base] = mods[p];
}
