// ============================================================================
//  knowledge.js — COUCHE DE CONNAISSANCE MÉTHODOLOGIQUE (doctrine TMA Armonie).
//  Contenu factuel extrait des documents officiels Armonie (définitions TMA,
//  procédures Jira, modèle de reporting CDP). C'est la SEULE source autorisée
//  pour les questions de méthode : l'assistant ne répond JAMAIS de mémoire.
//  Mettre à jour ici quand la doctrine évolue.
// ============================================================================

export const METHODOLOGIE = `### SLA TMA (délais contractuels, en heures et jours OUVRÉS)
Plages d'heures ouvrées : du lundi au vendredi, 9h00–12h00 et 14h00–18h00, hors jours fériés.
Les deux compteurs (prise en compte et résolution) démarrent au dépôt de la demande par le référent client.

Délai de PRISE EN COMPTE de l'anomalie :
- Bloquante : 2 heures
- Majeure : 4 heures
- Mineure : 1 jour

Délai de RÉSOLUTION ou de contournement (sur applications) :
- Bloquante : 4 heures
- Majeure : 2 jours
- Mineure : 10 jours

### Niveaux de gravité
- Bloquant : impossibilité d'utiliser au moins une fonction significative de l'application, ou de dérouler un processus utilisateur significatif complet. Si une solution de contournement existe, peut être requalifié en majeur (ou mineur).
- Majeur : dégradation importante d'au moins une fonction de l'application ou de ses performances. Si une solution de contournement existe, peut être requalifié en mineur.
- Mineur : incident ou anomalie qui ne gêne pas l'utilisation de l'application et ne dégrade pas ses performances.

### Définitions
- Anomalie : défaut d'une application susceptible de causer un dysfonctionnement technique ou fonctionnel.
- Incident : événement susceptible de causer une interruption ou une diminution de la qualité de service attendue (indisponibilité, usage partiel impossible, altération de données, etc.).
- Prise en compte : réception et compréhension d'une demande par le Titulaire (Armonie).
- Contournement : action de correction réduisant la gravité de l'incident/anomalie, sans revenir à la situation nominale.
- Résolution : livraison par le Titulaire de la correction permettant de revenir à la situation nominale.

### Mode de production — Build / Run
Champ Jira posé par ticket. Build = activité projet (développement, évolution). Run = activité TMA (maintenance / exploitation / run courant). C'est ce champ qui distingue, au niveau du ticket, l'engagement TMA d'un engagement projet.

### Cycle de vie d'un ticket dans cp|WIRE (catégories atomiques)
À faire → En cours → Retour de test / Retour de production → Recette Armonie → Recette client → En attente client → Mise en production → Terminé. (Annulé = sortie.)
Le « point du soir » suit 7 statuts : Mise en production, Terminé, Recette client, Recette Armonie, En cours, Retour de test, En attente client. La mise en production est réalisée par le client, pas par Armonie.

### Modèle de reporting Chef de Projet (Suivi des projets)
Colonnes officielles : Client, CDP, Projet, Périmètre, Point d'attention, Reste à faire, État, N° de projet (format PJ25xx-xxxx), Date de début, Date de fin, Jours/Hommes budgétisés, Montant budgété, Montant facturé, Reste à facturer, Commentaires, Météo, suivi hebdomadaire (S1…).
États projet/commerciaux observés : En cours, Terminé, Signé, Propal envoyée, AVV Pipe.

### Workflow Jira (statuts et transitions réels)
Statuts : TO DO (À faire) → IN PROGRESS (En cours) → EN ATTENTE CLIENT / RECETTE CLIENT → RETOUR TEST / RETOUR PRODUCTION → DONE (Terminé) / ANNULÉ. Il n'existe PAS de statut « Bloqué » dans le workflow.
Sens des transitions (doctrine d'usage) :
- En cours → Recette client : on demande aux métiers (client) de valider le ticket.
- En cours → En attente client : on attend une information du client pour avancer.
- En attente client → En cours : l'information reçue permet de reprendre.
- En attente client → Annulé : le ticket est annulé par les métiers.
- Recette client → Terminé : validé par les métiers.
- Recette client → En cours (état Retour test ou Retour production) : NON validé par les métiers, à reprendre.
- Recette client → En attente client : mis en attente par les métiers ou un responsable.
Techniquement les transitions sont libres, mais sauter des étapes est une erreur de process.

### Statut « Bloqué » dans cp|WIRE
« Bloqué » n'est pas un statut du workflow : c'est un état grossier calculé. Un ticket est « Bloqué » quand il porte le DRAPEAU Jira (impediment) OU une ÉTIQUETTE contenant « bloqu / blocked / impediment ». Un lien « is blocked by » non résolu signale aussi une dépendance bloquante. Pour diagnostiquer : Retour test = recette rejetée, à reprendre ; Retour production = incident après mise en production ; En attente client = la balle est côté client (ne pas compter comme blocage Armonie).

### Priorité (≠ gravité)
La priorité Jira d'un ticket est Haute / Moyenne / Faible. C'est un axe DISTINCT de la gravité SLA (Bloquante / Majeure / Mineure) : la priorité ordonne le travail, la gravité fixe les délais contractuels. Ne pas confondre les deux.

### Sprints (cadence mensuelle)
Un sprint = un mois (nom « Mois Année », début le 1er, fin le dernier jour). À la création, tout ticket part au Backlog. En fin de mois, les tickets non terminés sont basculés vers le sprint du mois suivant. Type de ticket : Epic (vaste corpus subdivisé en stories) ou Story (le ticket courant). Rapporteur = créateur du ticket (peut être le client). Personne assignée = responsable de la résolution.

### Vocabulaire client
EDL (École des Loisirs) : les commerciaux sont appelés « animateurs » / « animatrices ».`;

// Mots-clés qui déclenchent l'injection de la connaissance méthodologique dans le contexte.
export const METHODO_KEYWORDS = [
  "sla", "délai", "delai", "anomalie", "incident", "gravité", "gravite", "bloquant", "majeur", "mineur",
  "prise en compte", "contournement", "résolution", "resolution", "build", "run", "mode de production",
  "raci", "cycle", "réversibilité", "reversibilite", "heures ouvrées", "ouvré", "ouvre", "méthodologie",
  "methodo", "reporting", "météo", "meteo", "propal", "pipe", "périmètre", "perimetre", "reste à facturer",
  "workflow", "transition", "bloqué", "bloque", "blocked", "drapeau", "étiquette", "etiquette", "impediment",
  "retour test", "retour production", "recette client", "attente client", "sprint", "backlog", "priorité",
  "priorite", "épic", "epic", "story", "rapporteur", "is blocked by", "débloquer", "debloquer",
];
