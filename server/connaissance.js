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
import { dataDir } from "./paths.js";

const DIR = dataDir();
const FILE = path.join(DIR, "connaissance.json");

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
    ],
    // Glossaire transverse (terme → sens).
    glossaire: [
      { terme: "TMA", sens: "Tierce Maintenance Applicative — maintenance courante sous contrat." },
      { terme: "Mode projet", sens: "Engagement projet (lots, jalons), distinct de la TMA." },
      { terme: "CR", sens: "Compte rendu." },
      { terme: "COPIL", sens: "Comité de pilotage." },
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
        { terme: "club", sens: "Formule d'abonnement MAX par tranche d'âge (Bébémax, Titoumax, Minimax, Kilimax, Médium…)." },
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
      ],
    },
    "DS Smith": {
      contexte: "DS Smith Packaging — emballage carton de luxe. Application eMage (gestion industrielle) sur IBM i.",
      attentes: ["À préciser : livrables et délais attendus côté DS Smith."],
      glossaire: [],
      notes: [],
    },
    Tafanel: {
      contexte: "Tafanel — engagement en MODE PROJET (à ne pas présenter comme de la TMA).",
      attentes: ["À préciser : lots, jalons et livrables attendus."],
      glossaire: [],
      notes: [],
    },
    Bellion: {
      contexte: "Groupe Bellion / Belmet — projet ERP 2026, module Gestion Commerciale (GesCo).",
      attentes: ["À préciser : périmètre de recette et jalons COPIL."],
      glossaire: [],
      notes: [],
    },
    IMA: {
      contexte: "IMA — TMA, périmètres Dataware / MCS sur IBM i.",
      attentes: ["À préciser : SLA et livrables contractuels."],
      glossaire: [],
      notes: [],
    },
    DIAPAR: {
      contexte: "DIAPAR — grossiste alimentaire. Gestion commerciale (GC) sur IBM i, interface compta ANAEL.",
      attentes: ["À préciser : livrables et délais attendus."],
      glossaire: [],
      notes: [],
    },
    Balas: {
      contexte: "Groupe Balas.",
      attentes: ["À préciser."],
      glossaire: [],
      notes: [],
    },
  },
};

function ensure() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(SEED, null, 2));
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
  return out;
}

export function readConnaissance() {
  ensure();
  try { return mergeSeed(JSON.parse(fs.readFileSync(FILE, "utf-8"))); }
  catch { return JSON.parse(JSON.stringify(SEED)); }
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
  }
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(safe, null, 2)); }
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
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// ---- Couche « apprise automatiquement » par l'IA (séparée des notes manuelles) ----
// Écrit l'observation IA pour un client sans toucher au reste (contexte/attentes/glossaire/notes).
export function saveAuto(dossier, points) {
  const k = readConnaissance();
  if (!k.clients[dossier]) k.clients[dossier] = { contexte: "", attentes: [], glossaire: [], notes: [] };
  k.clients[dossier].auto = { points: (points || []).map(String).filter(Boolean).slice(0, 6), at: new Date().toISOString() };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(k, null, 2)); }
  catch (e) { console.error("[connaissance] saveAuto impossible:", e.message); }
  return k.clients[dossier].auto;
}

// Ancienneté (ms) de la dernière observation IA d'un client (Infinity si jamais apprise).
export function autoAgeMs(dossier) {
  const at = readConnaissance().clients[dossier]?.auto?.at;
  return at ? Date.now() - new Date(at).getTime() : Infinity;
}
