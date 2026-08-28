import { cle } from "./lib/commun.js";
// ticket.js — libellé d'affichage enrichi.
// Quand le résumé Jira est laconique (« Réécriture PRIMS9 »), on lui ajoute la
// description RÉELLE du programme issue du référentiel (prog.text, export Arcad/IBM i).
// Règles : on ne modifie jamais le résumé Jira d'origine ; on n'ajoute rien si le
// programme n'est pas au référentiel (aucune invention) ou si le résumé décrit déjà
// le programme (présence d'un séparateur « - / – / — / : » suivi de texte).

export function progResume(i) {
  const r = String((i && i.resume) || "").trim();
  const t = String((i && i.prog && i.prog.text) || "").trim();
  if (!t) return r;                          // pas de référentiel pour ce programme → rien ajouté
  if (cle(r).includes(cle(t))) return r;   // la description est déjà dans le résumé
  if (/\s[-–—:]\s\S/.test(r)) return r;      // le résumé porte déjà une description après un séparateur
  return `${r} — ${t}`;                      // résumé laconique → on complète avec le référentiel
}
