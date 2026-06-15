// demo-data.js — jeu d'exemple (mêmes formats que la sortie normalisée de jira.js).
// Permet de voir le cockpit fonctionner avant de brancher Jira.
export const DEMO_ISSUES = [
  d("TDIA-52", "DIAPAR", "Automatisation consigne / déconsigne", "Erik Pillère", "En cours"),
  d("TDIA-43", "DIAPAR", "Optimisation des tournées (« le 986 »)", "Bruno Labbay", "À faire"),
  d("TDIA-28", "DIAPAR", "Anomalie génération factures FAC080", "Joshua Vegas", "Terminé"),
  d("TDIA-27", "DIAPAR", "Anomalie ACH020 — dépassement taille numérique", "Non assigné", "Bloqué"),
  d("TDIA-10", "DIAPAR", "Purge automatisée des spools PHL", "Yann-André Roehrig", "À faire"),
  d("TEDL-596", "EDL", "Échange de livres V2", "Vantai Nguyen", "En cours"),
  d("TEDL-568", "EDL", "Interface AS/400 → Sage", "Jean-Luc Cardinot", "À faire", "2026-05-30"),
  d("TEDL-604", "EDL", "Correction API UPS", "Geoffrey Bourmond", "En cours"),
  d("TEDL-577", "EDL", "Expédition DOM Saint-Martin / Colissimo", "Lionel Kieffer", "Terminé"),
  d("ERP26-15", "Bellion", "Réception & analyse du CDC final V1", "Nicolas Durand", "À faire", "2026-06-30"),
  d("ERP26-16", "Bellion", "Préparer le kick-off (archi, modèle, modules)", "Nicolas Durand", "À faire", "2026-07-01"),
  d("TIMA-812", "IMA", "Migration des tickets vers l'instance IMA", "Mélanie Senebier", "En cours"),
  d("TIMA-815", "IMA", "Décommissionnement UK", "Joshua Vegas", "Bloqué"),
  d("PTAF-220", "Tafanel", "Refonte écran RPG facturation", "Yann-André Roehrig", "En cours"),
  d("TDSS-145", "DS Smith", "Suppression facturation MA (PDFP)", "Florian Crouau", "À faire"),
];

function d(cle, dossier, resume, assigne, statut, echeance = null) {
  const due = echeance ? new Date(echeance) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    cle,
    projet: cle.split("-")[0],
    dossier,
    resume,
    assigne,
    priorite: "Moyenne",
    statutJira: statut,
    statut,
    echeance,
    enRetard: Boolean(due && due < today && statut !== "Terminé"),
    maj: new Date().toISOString(),
    url: "#",
  };
}
