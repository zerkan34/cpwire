// connaissance.js — Mémoire d'équipe : ce que l'assistant doit savoir sur votre façon
// de travailler et sur chaque client. Lue à CHAQUE génération de rapport (donc l'IA en tient
// compte), elle s'enrichit dans le temps.
//
// PERSISTANCE (important) : le SOCLE ci-dessous est versionné dans le code → jamais perdu.
// Les ajouts faits dans l'app sont écrits dans le dossier de données (paths.js) : effectifs
// tout de suite, mais réinitialisés au redéploiement sur Render gratuit. Le bouton « Exporter »
// permet de récupérer le JSON pour le re-committer (ou définir un disque persistant via DATA_DIR).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dataDir } from "./paths.js";
import { saveBlob as dbSaveBlob, restoreBlob } from "./persist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = dataDir();
const FILE = path.join(DIR, "connaissance.json");
// Copie committée dans le dépôt (server/data/connaissance.json) : source DURABLE.
// Sur Render gratuit, le dossier d'exécution est éphémère ; on réamorce depuis cette copie
// à chaque démarrage si besoin. Pour rendre des ajouts permanents : Exporter → committer ce fichier.
const REPO_FILE = path.join(__dirname, "data", "connaissance.json");

// ---- SOCLE VERSIONNÉ (toujours présent) -----------------------------------
const SEED = {
  global: {
    // Règles de rédaction et de travail que l'assistant doit TOUJOURS respecter.
    conventions: [
      "Registre : français professionnel, senior, concis. Vouvoyer le client.",
      "Signer les comptes rendus « Nicolas Durand, chef de projet ».",
      "Toujours séparer le périmètre TMA (maintenance courante) du périmètre Projet.",
      "Ne jamais inventer de chiffre, de statut ni de nom : s'appuyer uniquement sur les données Jira.",
      "Un nom listé comme intervenant/assigné d'un ticket est un développeur Armonie.",
      "Distinguer la priorité (Haute/Moyenne/Faible) de la gravité SLA (Bloquante/Majeure/Mineure) : deux axes différents (la priorité ordonne, la gravité fixe les délais).",
      "« Bloqué » dans cp|WIRE = drapeau Jira OU étiquette (bloqu/blocked/impediment), pas un statut du workflow ; « En attente client » n'est pas un blocage Armonie.",
    ],
    // Glossaire transverse (terme → sens).
    glossaire: [
      { terme: "TMA", sens: "Tierce Maintenance Applicative — maintenance courante sous contrat." },
      { terme: "Mode projet", sens: "Engagement projet (lots, jalons), distinct de la TMA." },
      { terme: "CR", sens: "Compte rendu." },
      { terme: "COPIL", sens: "Comité de pilotage." },
      { terme: "CRA", sens: "Compte rendu d'activité : chaque collaborateur saisit ses jours ouvrés dans Dolibarr pour le mois de facturation." },
      { terme: "Dolibarr", sens: "Outil interne Armonie de saisie des CRA et de génération/émission des factures." },
      { terme: "Chronogramme de facturation Armonie", sens: "Cycle fin de mois (RACI porté par la Direction générale) : saisie des CRA par les collaborateurs ; contrôle des CRA à J-1 et corrections éventuelles ; génération des projets de facture (temps passé & forfait) ; contrôle à J+1 et corrections ; émission des factures à J+2. Tout se fait dans Dolibarr." },
    ],
  },
  // Mémoire par client (clé = nom de dossier affiché). « attentes » à compléter par vos soins.
  clients: {
    EDL: {
      contexte:
        "L'école des loisirs — maison d'édition jeunesse indépendante (depuis 1965). Service d'abonnement MAX (« l'école des max ») sur IBM i : chaque année scolaire (novembre → juin), l'abonné reçoit 8 livres sélectionnés, livrés une fois par mois. Deux périmètres pilotés ensemble : la TMA courante de MAX (abonnés & clubs, colisage & transport, animatrices & commissions, interface Sage) ET le projet MINIKILI+ — offre enrichie d'abonnements créant deux nouveaux clubs « Minimax+ » et « Kilimax+ » à 11 livres (1 livre de plus aux tirages de décembre, mars et juin), avec en parallèle des évolutions du modèle de données et des processus techniques de MAX.",
      attentes: [
        "Livrables projet MINIKILI+ : spécifications techniques de développement, un cahier de tests par option modifiée, procès-verbaux de réception, PV de mise en production.",
        "Tous les documents projet sont déposés sur l'espace SharePoint Armonie dédié et partagés avec le client.",
        "Jalons : spécifications 13/02 ; développement (livraison par modules au fil de l'eau) jusqu'au 10/04 ; tests & recette EDL jusqu'au 08/05 ; cible de terminaison 15/05 ; MEP prévisionnelle 01/06 ; assistance post-MEP via le dispositif TMA jusqu'au 12/06/2026.",
        "Séparer strictement le périmètre projet MINIKILI+ du périmètre TMA : le passage des accès « ligne à ligne » au SQL se fait au fil de l'eau et relève de la TMA, pas du projet.",
      ],
      glossaire: [
        { terme: "animateur / animatrice", sens: "Commercial CÔTÉ CLIENT EDL (force de vente). JAMAIS un développeur Armonie." },
        { terme: "MAX (« l'école des max »)", sens: "Application IBM i de gestion des abonnements de livres jeunesse d'EDL." },
        { terme: "MINIKILI+", sens: "Projet d'offre enrichie MAX : création des clubs Minimax+ et Kilimax+." },
        { terme: "Minimax+ / Kilimax+", sens: "Deux nouveaux clubs à 11 livres/an (au lieu de 8 ; +1 livre en décembre, mars, juin)." },
        { terme: "club", sens: "Formule d'abonnement MAX par tranche d'âge. Les 8 clubs actuels : Bébémax, Titoumax, Minimax, Kilimax, Animax, Maximax, Supermax, Mediummax — auxquels s'ajoutent Minimax+ et Kilimax+ (10 au total)." },
        { terme: "tirage", sens: "Envoi mensuel ; un tirage peut désormais comporter plusieurs livres (plusieurs séquences)." },
        { terme: "séquence", sens: "Rang d'un livre à l'intérieur d'un tirage (la base gère jusqu'à 99 séquences ; affichage limité à 2 cette campagne)." },
        { terme: "Remis", sens: "Indique qu'un livre d'un tirage ne doit pas être envoyé à un abonné ; géré par séquence depuis MINIKILI+." },
        { terme: "MX_TIT", sens: "Table des titres MAX (livres par club et par tirage) ; porte la zone « ordre » d'affichage des clubs." },
        { terme: "ABO_ABO / ABO_ADR", sens: "Tables abonnements / adresses (ajout d'index ABO_ID, ABO_ID_GECKO, AD_ID)." },
        { terme: "GECKO / INTRAMAX", sens: "Applicatifs externes consommant la base DB2 for i de MAX (impactés par le lot 2)." },
        { terme: "LiteSoft", sens: "Éditeur tiers (Franck Vigier) ; consomme le webservice Armonie structuré par abonnement." },
        { terme: "NGP", sens: "Trigramme préfixant les nouveaux objets créés par Armonie sur le projet (Nouvelle Gestion du Personnel)." },
      ],
      notes: [
        "Gouvernance projet : comité présidé par Guy Routier (Armonie), pilotage & CR par Mélanie Senebier (Armonie), développements par Lionel Kieffer (Armonie). Côté EDL : Aline Giron (cheffe de projet IT, valide les CR), Jennifer Salaun (cheffe de projet métier), Jean-Luc Cardinot (analyste-développeur AS/400). Laetitia à associer dès que les travaux portent sur les écrans lots & chaîne.",
        "Développements sur la partition DEV du client (172.22.0.44, IBM i V7.3) ; tests projet dans des bibliothèques suffixées « _D » (MAX_D, GENERAL_D…). Profil de test fonctionnel : TEST_EDL ; tests de chaîne avec les applicatifs externes : GECO_T.",
        "Normes projet : modèle de données décrit en DDL (et non DDS), sources SQL dans QDDSLESRC ; programmes en RPG ILE full free avec accès données en SQL embarqué de préférence ; conventions inspirées de l'applicatif SEGUREL.",
        "Décisions COPROJ : écrans passés en 132 colonnes pour afficher les 10 clubs ; ordre d'affichage des clubs piloté par une zone « ordre » paramétrable (Minimax+/Kilimax+ après le Médium, exigence des opératrices de saisie) ; gestion des « Remis » par séquence via sous-fichier ; couleurs des nouveaux clubs reprises de leur club d'origine (palette IBM i limitée).",
        "Webservice LiteSoft : données structurées par abonnement (principe validé), consommations historisées ; ~5 J/H, positionné début avril, non prioritaire vs les modifications d'écrans.",
        "Impacts queries utilisateur limités : les queries existants n'ont pas à être modifiés mais doivent être rouverts puis réenregistrés ; les nouvelles zones (id, séquence) sont à ajouter manuellement si besoin.",
        "Base documentaire SharePoint TMA : rubriques Facturations, Documents & Supports Métiers, Projets, Archives, Astuces, Clôtures & RAZ. Deux sujets connexes au projet : une analyse « colis privé » (A. Quillère, nov. 2025) qui recoupe les longueurs d'adresse (colis privé limité à 32 car., DPD à 30) ; une procédure Clôture/RAZ documentée (oct. 2025) qui recoupe la priorité 2 « arrêt de l'ajout en colonne + RAZ scriptée ».",
        "Offre enrichie : 11 livres répartis sur l'année (1 nov., 2 déc., 1 janv., 1 févr., 2 mars, 1 avr., 1 mai, 2 juin). Lancement 2026/2027, réservé France métropolitaine, Belgique, Luxembourg, Suisse ; abonnements individuels ET regroupés ; papier ET web. Les évolutions DB2 lèvent trois limites historiques : nombre de clubs (8 → n), livres par club (8 → n), livres par tirage (1 → n), n compris entre 1 et 99.",
        "Chiffrage atelier (indicatif) : webservice à créer 5 J/H (+ ~1,5 J/H d'impact programmes) ; index ABO_ABO + ABO_ADR ~12 J/H ; extensions de longueurs (prospects, établissements, animatrices, auteurs, enveloppes) ~11 J/H ; fusion MX_II ~3,5 J/H + 2 J/H sur 8 programmes ; suppression edlmy ~1 J/H + PRI_CDE16 ~1 J/H ; refonte stockage stats à la clôture ~5 J/H (priorité 2).",
        "Projet (suivi global) : Campagne des abonnements — n° PJ2509-0666, signé, 63 J/H budgétés, 43 650 € (correspond au projet MINIKILI+ / PEM).",
        "Procédure de clôture & RAZ (documentation technique, révision 15/05/2025, GBO) — étapes ordonnées : faire désactiver la réplication (ROBOT HA) par l'exploitation ; désactiver les triggers ; tenir l'OUTQ (MAX/BX472) ; créer la bibliothèque de l'année (CRTLIB RAZ_2025) ; renommer MAX_AP en MAX_2024 ; puis la suite de la chaîne de clôture/RAZ. Recoupe la priorité 2 « arrêt de l'ajout en colonne + RAZ scriptée ».",
      ],
    },
    "DS Smith": {
      contexte: "DS Smith Packaging — emballage carton de luxe. Application eMage (gestion industrielle) sur IBM i.",
      attentes: ["À préciser : livrables et délais attendus côté DS Smith."],
      glossaire: [],
      notes: [
        "Base documentaire SharePoint TMA volumineuse (≈ 570 dossiers / 410 fichiers) : rubriques Gouvernance, Documents & Supports Métiers, Projets, Wiki export, Qualité, Contrat. Documents récents autour de la gestion industrielle (« Système global gestion industrielle », « Process création produit », oct. 2025).",
      ],
    },
    Tafanel: {
      contexte: "Tafanel — engagement en MODE PROJET (à ne pas présenter comme de la TMA).",
      attentes: ["À préciser : lots, jalons et livrables attendus."],
      glossaire: [],
      notes: [
        "Dossier SharePoint très actif (≈ 930 fichiers) : rubriques LES PROJETS, Contexte, Propositions commerciales, CR réunions internes, et une « TaskForce RPGFree ». Activité courante (juin 2026) sur la refonte RPG free et les tests fonctionnels (ISO_PROG, GESCOM CONDEC, ECRECO).",
        "Refonte applicative — fichier « Chaînes par domaines » (mis à jour le 18/06/2026, sur la base des informations du 17/11/2025) : 4342 lignes de programmes réparties sur 20 domaines (bibliothèque applicative principale GESCOM ; menus CLP OPTIONnnn en LIBPROG). 916 tickets Jira distincts y sont référencés.",
        "Refonte — statuts des lignes : 824 en mise en production, 591 terminées, 380 en recette client, 122 en attente client, 40 en recette Armonie, 44 annulées, 2 en retour test, et 2338 sans ticket associé (#N/A).",
        "Refonte — volumétrie par domaine (nb de lignes) : 99 Non catégorisé 1821 ; 08 Administration commerciale 433 ; 21 Traitements fin de mois 330 ; 20 Traitements début et fin de journée 268 ; 10 Commandes Tafanel 233 ; 13 Logistique Tafanel 202 ; 17 Comptabilité clients et caisse 174 ; 19 Comptabilité générale et fournisseurs 155 ; 14 Logistique Socodis 154 ; 07 Articles-produits-tarifs 137 ; 09 Stocks et promotions des ventes 125 ; 04 Création des tarifs 77 ; 01 Mise à jour et affichage client 64 ; 11 Commandes Socodis 51 ; 12 Commandes Disney 51 ; 03 Mise à jour et affichage des articles 21 ; 06 Gestion des becs 20 ; 18 Investissements et prestations 17 ; 05 Gestion des réductions tarifaires 7 ; 02 Gestion des produits 2.",
        "Projet (suivi global) : Modernisation code et applicatif — n° PJ2412-0601, terminé, 16 J/H budgétés, 10 893 €.",
        "Priorisation (fichier interne « Vision 20 janvier », snapshot refonte au 26/06/2026, 4346 lignes) : suivi par domaine (01 Articles-Produits-Tarifs, 02 Stocks & promotions des ventes, 3.0 Commandes Tafanel, 4.1 Logistique Tafanel, 6.0 Administration commerciale…) donnant, par option, l'échéance, la date de livraison Armonie, le statut et l'historique des retours de tests. Exemples : OPTION313 Ristournes clients (livrée le 05/02/2026, « VALIDE TAFANEL » ; retours de tests via GESRIS) ; Option 110 libellés permanents sur facture (livrée 13/02/2026) ; REFART Référencement des articles et Option 295 Réception des commandes (échéance 12/02/2026). Interlocuteur tests côté Tafanel : Laurent Le Guen.",
      ],
    },
    Bellion: {
      contexte: "Groupe Bellion / Belmet — projet ERP 2026, module Gestion Commerciale (GesCo).",
      attentes: ["À préciser : périmètre de recette et jalons COPIL."],
      glossaire: [],
      notes: [
        "Dossier SharePoint volumineux (≈ 950 fichiers) : LES PROJETS, Contexte & Processus, Propositions commerciales, Architecture, Hébergement, Facture Électronique, plus Assistance IBM i (jetons) et Phase #02. Jalons tracés : COPIL #05 (17/11/2025), PV de migration vers le nouvel environnement (05/12/2025).",
        "Projet (suivi global) : Modernisation SI — n° PJ2503-0631, en cours, 146 J/H budgétés, 96 780 €.",
        "Chronogramme de bascule ERP sur V7.5 (fichier VOK V2.5, 04/09/2025) : migration de la base ERP sur environnement bac à sable V7.5 (10/03 → 11/04/2025) ; migration des éditions dans PHL Spool (07/07 → 05/09) et des rapports dans PHL Query (18/08 → 05/09) ; usage en parallèle des environnements V5R4 et cible V7.5 ; validation finale de la migration sur V7.5 le 19/09/2025 ; rédaction d'une documentation détaillée de la procédure de migration.",
      ],
    },
    IMA: {
      contexte: "IMA — TMA, périmètres Dataware / MCS sur IBM i.",
      attentes: ["À préciser : SLA et livrables contractuels."],
      glossaire: [],
      notes: [
        "Base SharePoint : Gouvernance, Documents & Supports Métiers, Facturations, et un chantier dédié « Migration JIRA » (CDC_Migration_Jira_IMA_Armonie, versions V1.1 → V1.2). Pilotage par COPIL ; dernier COPIL Mars 2026 (dernière mise à jour juin 2026, N. Durand).",
        "Projets (suivi global) : Purge Higgins (n° PJ2411-0595, terminé, 10 J/H, 8 500 €) ; Automatisation purge MCS (TMA, en cours) ; Sésame Espagne (n° PJ2507-0651, proposition envoyée, 16 100 €) ; Décommissionnement UK (n° PJ2507-0650, en cours, 5 J/H, 4 950 €) ; Rétro-documentation REF-BEN (n° PJ2406-0536, proposition envoyée, 12 240 €).",
        "Export Jira de mai 2026 : 33 tickets TIMA suivis sur le mois (Dataware / MCS — ex. contrôle d'intégrité des fichiers ATR reçus sur le S3, problème de chargement des données Higgins en préproduction, extractions CRA Produits). Le fichier récapitule aussi le temps par intervenant : Joshua Vegas, Ludovic Sagnal, Océane Aimes, Léo Charrier, Maamar Meziane.",
      ],
    },
    DIAPAR: {
      contexte: "DIAPAR — grossiste alimentaire. Gestion commerciale (GC) sur IBM i, interface compta ANAEL.",
      attentes: ["À préciser : livrables et délais attendus."],
      glossaire: [],
      notes: [
        "Base SharePoint : Gouvernance + dossier partagé. Pilotage par COPIL mensuels (CR du 09/01/2026, présentations février et mars 2026).",
        "Projets (suivi global, en TMA) : création d'une nouvelle partition DEV ; remplacement du formulaire papier resaisi par une page sur l'intranet ; projet d'optimisation des tournées (le « 986 »).",
      ],
    },
    Balas: {
      contexte: "Groupe Balas.",
      attentes: ["À préciser."],
      glossaire: [],
      notes: [
        "Base SharePoint : Gouvernance, Prise d'empreinte, Documents & Support Métiers, Projets, Wiki export. Contient la liste des accès et des éléments d'audit (prise d'empreinte) ; dernière activité sept. 2025 — dossier en phase d'amorçage.",
      ],
    },
    Segurel: {
      contexte: "Segurel — réécriture / réimplémentation de l'applicatif GLOG sur IBM i (AS/400), engagement en MODE PROJET. Inclut un projet Paie / Primes / Gestion des employés.",
      attentes: ["Valider le cahier des charges du projet Paie.", "Planning projet GLOG."],
      glossaire: [{ terme: "GLOG", sens: "Applicatif logistique réécrit / réimplémenté sur AS/400 chez Segurel." }],
      notes: [
        "Base SharePoint : LES PROJETS, Contexte & Processus, Propositions commerciales, Facturations, Documentation technique + utilisateurs GLOG. Documents de référence : TEC « Réécriture GLOG » (L. Kieffer, janv. 2026), LDM Segurel, commande de reprise GLOG, planning projet. Les conventions de développement EDL/MINIKILI+ s'inspirent de l'applicatif Segurel.",
        "Projet (suivi global) : Implémentation des fonctionnalités GLog sur AS/400 — n° PJ2507-0652, en cours, 9 J/H, 8 400 €.",
      ],
    },
    DPIECE: {
      contexte: "DPIECE — liste de suivi de l'avancement de 61 programmes d'intégration (interfaces de type ANAEL). Bibliothèques : source AXASP030 / objets AXSPE030 (44 programmes) et VINCIV8 (17 programmes). On y suit l'utilisation depuis la MEP V8R1 et la validation côté Vinci.",
      attentes: ["À préciser : périmètre de recette et critères de validation Vinci."],
      glossaire: [
        { terme: "DPIECE", sens: "Liste de suivi des programmes d'intégration (interfaces ANAEL / Vinci) et de leur avancement (utilisation, état dev, validation)." },
        { terme: "AXASP030 / AXSPE030", sens: "Bibliothèques source / objets des programmes d'intégration (44 des 61 programmes)." },
        { terme: "VINCIV8", sens: "Bibliothèque regroupant 17 des programmes du périmètre." },
      ],
      notes: [
        "Avancement (61 programmes). Utilisés depuis la MEP V8R1 : 36 « Oui », 22 « Non », 3 « Non (à tester en recette) ». État de développement : 26 en « Recette », 1 « À faire », 34 sans état renseigné. Colonnes de suivi du fichier : « Test Armonie » et « Validé (Vinci) ».",
      ],
    },
    Vandoren: {
      contexte: "Vandoren (Bormes-les-Mimosas) — fabricant d'anches et de becs pour instruments à vent. Armonie a réalisé un audit de l'application métier hébergée sur IBM i (AS/400) — compte rendu d'entretien du 01/03/2022 (auteur Dominique Gayte ; participants côté Vandoren : Alain Porte, Patrick Chemla, Jean Rapenne).",
      attentes: ["À préciser : suites données à l'audit (plan de reprise d'activité, maintenance matérielle/logicielle, modernisation)."],
      glossaire: [],
      notes: [
        "Serveur : POWER modèle 520 en IBM i V7R1, 16 Go de mémoire, disques occupés à ~25 %, en RAID 5 ; une quinzaine d'utilisateurs réguliers. Matériel performant et sans panne, mais ancien (~10 ans d'existence), hors maintenance matérielle et logicielle, et sans IPL.",
        "Plan de reprise d'activité : assuré uniquement par les sauvegardes sur bandes quotidiennes. Enjeu fort en fin de mois (≈ 97 % du CA à l'export, expéditions concentrées en fin de mois). Préconisation Armonie : doter le SI d'un véritable PRA pour la partie IBM i, adapté aux enjeux métier.",
        "Application : la paie et la comptabilité ont été sorties de l'IBM i ; il ne reste que l'application métier proprement dite, essentielle au fonctionnement de l'entreprise. L'audit couvre serveur, PRA, programmes, base de données et interface.",
      ],
    },
  },
};

function ensure() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      // Réamorçage : on privilégie la copie committée (durable) si elle existe, sinon le socle.
      if (REPO_FILE !== FILE && fs.existsSync(REPO_FILE)) {
        try { fs.copyFileSync(REPO_FILE, FILE); }
        catch { fs.writeFileSync(FILE, JSON.stringify(SEED, null, 2)); }
      } else {
        fs.writeFileSync(FILE, JSON.stringify(SEED, null, 2));
      }
    }
  } catch (e) { console.error("[connaissance] init impossible:", e.message); }
}

// Fusion non destructive : complète l'enregistré avec les nouveautés du socle, sans écraser vos ajouts.
function mergeSeed(saved) {
  const out = { global: { ...SEED.global, ...(saved.global || {}) }, clients: { ...(saved.clients || {}) } };
  // conventions/glossaire global : on garde l'enregistré s'il existe, sinon le socle.
  out.global.conventions = (saved.global && saved.global.conventions) || SEED.global.conventions;
  out.global.glossaire = (saved.global && saved.global.glossaire) || SEED.global.glossaire;
  for (const k of Object.keys(SEED.clients)) {
    out.clients[k] = { ...SEED.clients[k], ...(out.clients[k] || {}) };
  }
  // Mémoire « pilote » : profil de Nicolas + consignes permanentes (toujours préservée).
  out.pilote = (saved.pilote && typeof saved.pilote === "object")
    ? {
        profil: Array.isArray(saved.pilote.profil) ? saved.pilote.profil.map(String).filter(Boolean) : [],
        consignes: Array.isArray(saved.pilote.consignes) ? saved.pilote.consignes.map(String).filter(Boolean) : [],
        maj: saved.pilote.maj || null,
      }
    : { profil: [], consignes: [], maj: null };
  return out;
}

export function readConnaissance() {
  ensure();
  try { return mergeSeed(JSON.parse(fs.readFileSync(FILE, "utf-8"))); }
  catch {
    try { if (REPO_FILE !== FILE) return mergeSeed(JSON.parse(fs.readFileSync(REPO_FILE, "utf-8"))); } catch {}
    return JSON.parse(JSON.stringify(SEED));
  }
}

export function saveConnaissance(data) {
  const safe = {
    global: {
      conventions: Array.isArray(data?.global?.conventions) ? data.global.conventions.map(String).filter(Boolean) : SEED.global.conventions,
      glossaire: Array.isArray(data?.global?.glossaire) ? data.global.glossaire.filter((g) => g && g.terme).map((g) => ({ terme: String(g.terme), sens: String(g.sens || "") })) : SEED.global.glossaire,
    },
    clients: {},
  };
  const src = data?.clients || {};
  const current = readConnaissance();   // pour préserver la couche « auto » (apprise par l'IA), non éditée à la main
  for (const k of Object.keys(src)) {
    const c = src[k] || {};
    safe.clients[k] = {
      contexte: String(c.contexte || ""),
      attentes: Array.isArray(c.attentes) ? c.attentes.map(String).filter(Boolean) : [],
      glossaire: Array.isArray(c.glossaire) ? c.glossaire.filter((g) => g && g.terme).map((g) => ({ terme: String(g.terme), sens: String(g.sens || "") })) : [],
      notes: Array.isArray(c.notes) ? c.notes.map(String).filter(Boolean) : [],
    };
    const keptAuto = (c.auto && Array.isArray(c.auto.points)) ? c.auto : (current.clients[k] && current.clients[k].auto);
    if (keptAuto && Array.isArray(keptAuto.points) && keptAuto.points.length) {
      safe.clients[k].auto = { points: keptAuto.points.map(String).filter(Boolean).slice(0, 6), at: String(keptAuto.at || "") };
    }
    // Couche « apprise par import » (upsert par source) — préservée comme la couche auto.
    const keptAppris = Array.isArray(c.appris) ? c.appris : (current.clients[k] && current.clients[k].appris);
    if (Array.isArray(keptAppris) && keptAppris.length) {
      safe.clients[k].appris = keptAppris
        .filter((e) => e && (e.text || e.source))
        .map((e) => ({
          source: String(e.source || ""), at: String(e.at || ""), text: String(e.text || "").slice(0, 2000),
          history: Array.isArray(e.history) ? e.history.slice(0, 5).map((h) => ({ at: String(h?.at || ""), text: String(h?.text || "").slice(0, 2000) })) : [],
        }))
        .slice(-200);
    }
  }
  safe.pilote = current.pilote || { profil: [], consignes: [], maj: null };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(safe, null, 2)); try { dbSaveBlob("connaissance", JSON.stringify(safe, null, 2)); } catch {} }
  catch (e) { console.error("[connaissance] écriture impossible:", e.message); }
  return mergeSeed(safe);
}

// Bloc texte injecté dans les prompts IA. `dossier` = nom de dossier affiché (ex. "EDL").
export function knowledgeForPrompt(dossier) {
  const k = readConnaissance();
  const lines = ["\n\nMÉMOIRE D'ÉQUIPE — à respecter impérativement :"];
  if (k.global.conventions?.length) lines.push("Conventions : " + k.global.conventions.map((c) => `(${c})`).join(" "));
  if (k.global.glossaire?.length) lines.push("Glossaire : " + k.global.glossaire.map((g) => `${g.terme} = ${g.sens}`).join(" ; "));
  const c = k.clients[dossier];
  if (c) {
    if (c.contexte) lines.push(`Client ${dossier} — contexte : ${c.contexte}`);
    if (c.attentes?.length) lines.push(`Attentes ${dossier} : ${c.attentes.join(" ; ")}`);
    if (c.glossaire?.length) lines.push(`Vocabulaire ${dossier} : ` + c.glossaire.map((g) => `${g.terme} = ${g.sens}`).join(" ; "));
    if (c.notes?.length) lines.push(`Notes ${dossier} : ${c.notes.join(" ; ")}`);
    if (c.auto?.points?.length) lines.push(`Observé automatiquement sur ${dossier} (activité Jira récente, indicatif) : ${c.auto.points.join(" ; ")}`);
    if (c.appris?.length) lines.push(`Sources apprises ${dossier} (imports intégrés, à mémoriser durablement) : ` + c.appris.slice(-10).map((e) => String(e.text || "").replace(/\s+/g, " ").slice(0, 360)).join("  ⟶  "));
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// ---- Couche « apprise automatiquement » par l'IA (séparée des notes manuelles) ----
// Écrit l'observation IA pour un client sans toucher au reste (contexte/attentes/glossaire/notes).
export function saveAuto(dossier, points) {
  const k = readConnaissance();
  if (!k.clients[dossier]) k.clients[dossier] = { contexte: "", attentes: [], glossaire: [], notes: [] };
  k.clients[dossier].auto = { points: (points || []).map(String).filter(Boolean).slice(0, 6), at: new Date().toISOString() };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(k, null, 2)); try { dbSaveBlob("connaissance", JSON.stringify(k, null, 2)); } catch {} }
  catch (e) { console.error("[connaissance] saveAuto impossible:", e.message); }
  return k.clients[dossier].auto;
}

// Ancienneté (ms) de la dernière observation IA d'un client (Infinity si jamais apprise).
export function autoAgeMs(dossier) {
  const at = readConnaissance().clients[dossier]?.auto?.at;
  return at ? Date.now() - new Date(at).getTime() : Infinity;
}

// Ajoute une NOTE manuelle (ex. import d'un fichier analysé par le copilote) au corpus d'un dossier.
export function addNote(dossier, note) {
  const txt = String(note || "").trim();
  if (!dossier || !txt) return null;
  const k = readConnaissance();
  if (!k.clients[dossier]) k.clients[dossier] = { contexte: "", attentes: [], glossaire: [], notes: [] };
  if (!Array.isArray(k.clients[dossier].notes)) k.clients[dossier].notes = [];
  k.clients[dossier].notes.push(txt.slice(0, 1200));
  return saveConnaissance(k);
}

// Mémorise/ACTUALISE ce qu'un IMPORT apprend, par source (upsert : on remplace l'entrée
// de la même source au lieu d'empiler des doublons → on garde toujours la dernière
// version, la mémoire ne gonfle pas). IMPORTANT : contrairement à un upsert destructeur,
// l'ancienne version n'est jamais perdue — elle bascule dans `history` (5 dernières,
// plus récente en premier), consultable/vérifiable dans Mémoire → Sources apprises.
// Écriture directe (comme saveAuto) pour préserver la couche. Relue par l'IA via
// knowledgeForPrompt (seule la version courante, jamais l'historique, y est injectée).
export function learnFromImport(dossier, sourceKey, text) {
  const d = String(dossier || "").trim();
  const body = String(text || "").trim();
  if (!d || !body) return null;
  const k = readConnaissance();
  if (!k.clients[d]) k.clients[d] = { contexte: "", attentes: [], glossaire: [], notes: [] };
  if (!Array.isArray(k.clients[d].appris)) k.clients[d].appris = [];
  const tag = String(sourceKey || "").trim() || body.slice(0, 32);
  const i = k.clients[d].appris.findIndex((e) => e && e.source === tag);
  const prev = i >= 0 ? k.clients[d].appris[i] : null;
  const history = prev
    ? [{ at: prev.at, text: prev.text }, ...(Array.isArray(prev.history) ? prev.history : [])].slice(0, 5)
    : [];
  const entry = { source: tag, at: new Date().toISOString(), text: body.slice(0, 2000), history };
  if (i >= 0) k.clients[d].appris[i] = entry; else k.clients[d].appris.push(entry);
  if (k.clients[d].appris.length > 200) k.clients[d].appris = k.clients[d].appris.slice(-200);
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(k, null, 2)); try { dbSaveBlob("connaissance", JSON.stringify(k, null, 2)); } catch {} }
  catch (e) { console.error("[connaissance] learnFromImport impossible:", e.message); }
  return entry;
}

// Oublie DÉFINITIVEMENT une source apprise (elle et son historique). Explicite et
// irréversible — ne touche à rien d'autre (contexte, notes, glossaire, autres sources).
export function forgetLearned(dossier, sourceKey) {
  const d = String(dossier || "").trim();
  const tag = String(sourceKey || "").trim();
  if (!d || !tag) return false;
  const k = readConnaissance();
  const list = k.clients[d]?.appris;
  if (!Array.isArray(list)) return false;
  const before = list.length;
  k.clients[d].appris = list.filter((e) => !e || e.source !== tag);
  if (k.clients[d].appris.length === before) return false; // rien à oublier
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(k, null, 2)); try { dbSaveBlob("connaissance", JSON.stringify(k, null, 2)); } catch {} }
  catch (e) { console.error("[connaissance] forgetLearned impossible:", e.message); }
  return true;
}

// ============================================================================
//  MÉMOIRE « PILOTE » — ce que Natacha sait de Nicolas (profil : qui il est,
//  comment il pense/travaille) + ses CONSIGNES PERMANENTES (corrections,
//  préférences durables, « désormais X = Y »). Posée une fois, appliquée pour
//  toujours. Injectée dans CHAQUE réponse de l'assistant.
// ============================================================================
const _norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

export function readPilote() {
  const p = readConnaissance().pilote || { profil: [], consignes: [], maj: null };
  return { profil: p.profil || [], consignes: p.consignes || [], maj: p.maj || null };
}

// Mise à jour INCRÉMENTALE et sûre : ajoute (dédup), retire (corrections), borne, horodate.
// remove = liste de chaînes ; toute ligne (profil OU consigne) qui contient l'une d'elles est supprimée
// AVANT l'ajout des nouvelles → permet « oublie X / ce n'est plus Mélanie c'est moi ».
export function updatePilote({ profilAdd = [], consignesAdd = [], remove = [] } = {}) {
  const k = readConnaissance();
  const cur = k.pilote || { profil: [], consignes: [], maj: null };
  let profil = (cur.profil || []).map(String);
  let consignes = (cur.consignes || []).map(String);

  const rem = (remove || []).map(_norm).filter((x) => x.length >= 3);
  const drop = (arr) => arr.filter((line) => !rem.some((r) => _norm(line).includes(r)));
  if (rem.length) { profil = drop(profil); consignes = drop(consignes); }

  const addInto = (arr, adds) => {
    for (const raw of adds || []) {
      const v = String(raw || "").trim().slice(0, 400);
      if (!v) continue;
      const nv = _norm(v);
      if (nv.length < 3) continue;
      // dédup : ignore si déjà présent (ou quasi-identique) ; remplace une variante plus courte.
      const idx = arr.findIndex((l) => { const nl = _norm(l); return nl === nv || nl.includes(nv) || nv.includes(nl); });
      if (idx >= 0) { if (nv.length > _norm(arr[idx]).length) arr[idx] = v; }
      else arr.push(v);
    }
    return arr;
  };
  profil = addInto(profil, profilAdd).slice(-30);
  consignes = addInto(consignes, consignesAdd).slice(-40);

  k.pilote = { profil, consignes, maj: new Date().toISOString() };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(k, null, 2)); try { dbSaveBlob("connaissance", JSON.stringify(k, null, 2)); } catch {} }
  catch (e) { console.error("[connaissance] updatePilote impossible:", e.message); }
  return k.pilote;
}

// Bloc injecté en TÊTE du contexte de l'assistant (priorité haute).
export function piloteForPrompt() {
  const p = readPilote();
  const out = [];
  if (p.consignes.length) {
    out.push("CONSIGNES PERMANENTES DE NICOLAS — à appliquer SANS jamais y revenir ni redemander (en cas de contradiction, la plus récente prime) :");
    out.push(p.consignes.map((c) => `• ${c}`).join("\n"));
  }
  if (p.profil.length) {
    out.push("CE QUE TU SAIS DE NICOLAS (qui il est, comment il pense et travaille — adapte-toi à lui) :");
    out.push(p.profil.map((c) => `• ${c}`).join("\n"));
  }
  return out.length ? out.join("\n") : "";
}


// Restauration de la mémoire depuis la base durable (Neon) au démarrage, si DATABASE_URL.
// Écrit le contenu de la base dans le fichier local (source de vérité à l'exécution).
export async function initMemory() {
  try {
    const c = await restoreBlob("connaissance");
    if (c && c.trim()) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE, c);
      return true;
    }
  } catch (e) { console.error("[connaissance] initMemory impossible:", e.message); }
  return false;
}
