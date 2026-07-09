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

// ============================================================================
//  CONNAISSANCE DE L'APPLICATION cp|WIRE elle-même.
//  Faits vérifiés dans le code (server/ + web/src/). Permet à Natacha de
//  connaître l'outil « par cœur » : à quoi il sert, comment il est fait, ce que
//  chaque écran/fonction produit. TOUJOURS injectée dans le contexte.
//  Mettre à jour ici quand l'application évolue.
// ============================================================================
export const APPLICATION = `### Ce qu'est cp|WIRE
Cockpit de pilotage personnel du chef de projet TMA. Il interroge Jira Cloud (API REST, jeton exclusivement côté serveur), normalise et met en cache les tickets, puis les restitue en tableaux de bord par client/dossier : à faire, en cours, bloqués, en retard, en recette, terminés. Il y ajoute la production de livrables (comptes rendus, CRA, réunions), une couche d'analyse (SLA, échéances, signaux, charge), un assistant IA ancré (Natacha) et des intégrations (Microsoft 365, Dolibarr, SharePoint/ShareFly). Slogan : passerelle de pilotage vers Jira.

### Architecture technique
- Back-end : Node.js (ESM) + Express 4 (server/app.js, ~70 routes). Persistance : dossier DATA_DIR + miroir base Neon/PostgreSQL (persist.js). exceljs/SheetJS (Excel), mammoth (Word), pdf-parse (PDF).
- Front : React 18 + Vite 5, PWA (installable). Appelle l'API /api/* en JSON, jeton dans l'en-tête x-access-token.
- Desktop : application Tauri 2 (« cpWIRE »), qui charge en fait le service hébergé (Render). Déploiement : Render / Docker ; le serveur sert à la fois l'API et le front buildé.
- Import Jira : recherche JQL enrichie paginée (100/page), timeout 30 s, découverte auto du champ Flagged.

### Statuts et point du soir
- Statut « gros grain » (bucket) : Bloqué / À faire / En cours / Terminé.
- Catégories fines : afaire, encours, retourTest, retourProd, recetteArmonie, recetteClient, attenteClient, miseEnProd, termine, annule.
- Point du soir = relevé quotidien reprenant le mail de la direction, 7 statuts suivis dans l'ordre : Mise en production, Terminé, Recette client, Recette Armonie, En cours, Retour de test, En attente client. Hors point : à faire, retour prod, annulé. La mise en production est réalisée par le CLIENT, pas par Armonie.
- « En retard » : échéance passée ET catégorie encore en charge de production (afaire, encours, retourTest, retourProd). Un ticket livré / en recette / en attente client / en MEP / terminé n'est jamais « en retard de développement », même si sa duedate est dépassée.
- « Bloqué » n'est PAS un statut du workflow : c'est calculé (drapeau Jira impediment, ou étiquette bloqu/blocked/impediment, ou lien « is blocked by » non résolu). « En attente client » n'est pas un blocage Armonie.

### Modèle d'un ticket (objet normalisé)
Champs clés : cle (ex. PTAF-53), projet, dossier (client), engagement (TMA/Projet/—), resume, prog (localisation IBM i via référentiel Arcad), assigne, dev (dév principal), contributors, labels, priorite, statutJira, statut (bucket), categorie (fine), echeance, enRetard, flagged, statutDepuis (depuis quand dans l'état), maj, cree, resolu, url. La description détaillée est chargée à la demande, pas à l'import.

### Dossiers / clients et logique de clé
Le dossier (client affiché) est déduit du PRÉFIXE de la clé Jira. Correspondances : TEDL/PEM→EDL, TDSS/PDFP→DS Smith, TMT/PTAF→Tafanel, TBEL→Bellion, TBAL/PBAL→Balas, TIMA/PIMA/PIMA2→IMA, TDIA→DIAPAR. Sinon « Autre ».
Engagement : convention T…→TMA, P…→Projet, avec exceptions déclarées (Tafanel TMT/PTAF = Projet). Un marqueur explicite dans le ticket (étiquette tma/run/projet/build, ou [TMA]/#projet) prime sur la déduction par préfixe.
Clients suivis : EDL (appli MAX, abonnements jeunesse, + projet MINIKILI+), DS Smith (appli eMage, emballage carton), Tafanel (distributeur boissons, mode Projet, réécriture RPG), Bellion/Belmet (projet ERP26), Balas (BTP, ERP IFS, amorçage), IMA (SI MULTICOM sous Adelia), DIAPAR (gestion commerciale + finance Anaël), Segurel (réécriture appli logistique GLOG). La mémoire ajoute DPIECE et Vandoren.

### Écrans / fonctionnalités (front)
Navigation en 4 espaces : Pilotage, Explorateur, Atelier, ShareFly, plus Signaux et Admin (owner). L'Atelier regroupe : Récap, Charge & capacité, Développeurs, GANTT, Planning, CRA, Réunions, Référence, Qualité. Un rôle « consultation » a un accès restreint (pas de CR/récap/réunion/CRA/mémoire).
- Poste de commandement : accueil Pilotage, mécanique de portée (Tout / Client / Projet / TMA) qui recalcule camembert, KPIs, ticker de tendance par client, barres — tout cliquable.
- Portefeuille / Explorateur : vue par dossier (risque, engagement, avancement, compteurs) et surface unique tickets & dossiers.
- En cours, Recette, Tickets figés, Hygiène : suivi par phase et qualité des tickets.
- Point du soir, Digest, Recap quotidien : relevés et point du soir composé automatiquement.
- Signaux / Santé / SLA : surface d'alerte unique (score de risque, cohérence, SLA opérationnel, journal des signaux). Radar des échéances.
- CRA (temps par personne/projet, import Excel), Développeurs (charge/heures/tickets), Charge & capacité (WIP, surcharge).
- Réunions (CR de réunion, audio transcrit, images lues par l'IA), Historique (journal des livrables produits/poussés).
- Assistant Natacha, analyse IA d'un point bloquant au clic, détail d'un ticket (explication IA, rapport→Jira, changement de statut).
- Connaissance / Historique d'apprentissage (édition de la mémoire), Import de sources (Excel/CSV/Word/PPTX/PDF/JSON, capitalisation après validation).
- Référentiel programmes IBM i (annuaire programmes × tickets), fiche client 360, GANTT / Planning à la charte, explorateur SharePoint, ShareFly (catalogue documentaire).

### Fonctions serveur notables
- CRA : consolidation des worklogs Jira sur une période (par personne / projet) et/ou import d'un Excel/CRA ; export Excel.
- Génération de documents : habillage à la charte Armonie (barre dégradée navy→indigo→or, logo cp|WIRE, Poppins/Inter), rendu écran + PDF (WeasyPrint).
- Digest : point du soir automatique (mouvements du jour, régressions, SLA dépassés, échéances) en texte + mail HTML, planifiable.
- Échéances : extraction déterministe des dates écrites dans les fiches + mémoire, détection de divergences entre sources.
- SLA : cibles GTI (prise en charge) / GTR (résolution) en heures par dossier × priorité, buckets P1-P4, respecté/dépassé/à risque.
- Signaux : journal d'apprentissage 60 j — régression, SLA, stagnation (>30 j), divergence ; récurrences repérées.
- Mémoire / connaissance : socle versionné (conventions, glossaire, mémoire par client) + mémoire « pilote » (profil de Nicolas + consignes permanentes). knowledge.js = doctrine méthodologique TMA (seule source pour les questions de méthode).
- Intégrations : Microsoft 365 (envoi mail Outlook, SharePoint via Graph), Dolibarr (lecture seule, rapprochement clients↔Tiers, CRA/facturation), ShareFly (catalogue partagé), transcription audio.
- Authentification : e-mail/mot de passe, jetons HMAC signés et expirants, rôles owner / invité lecture seule / consultation ; verrous serveur d'accès.

### Précisions utiles
- Les projets Jira importés et la requête JQL par défaut sont configurés en variables d'environnement (non visibles dans le code).
- Build/Run décrit l'activité d'un ticket (Build = projet, Run = TMA) ; en pratique l'engagement affiché est déduit du préfixe ou d'un marqueur, pas lu d'un champ Jira dédié.
- Principe transverse de toute l'application : zéro invention — chaque module ne calcule qu'à partir de faits Jira réels et signale l'absence d'information plutôt que de la fabriquer.`;
