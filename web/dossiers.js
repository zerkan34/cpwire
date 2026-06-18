// dossiers.js — fiches dossiers éditables (historique court, techno, équipe & contacts).
// Données propres à l'utilisateur, persistées sur fichier. Seed = ce que l'on connaît déjà.
import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";

const DIR = dataDir();
const FILE = path.join(DIR, "dossiers.json");

const p = (nom, poste, email, statut, cote) => ({ nom, poste, email: email || "", statut: statut || "Actif", cote });

export const SEED = {
  EDL: {
    description:
      "L'école des loisirs — édition jeunesse (fondée en 1965). TMA de l'application MAX (gestion des abonnements « l'école des max ») sur IBM i : abonnés & clubs, colisage & transport, animatrices & commissions, interface Sage.",
    tech: ["IBM i / AS-400", "RPG", "Application MAX", "Interface Sage"],
    team: [
      p("Geoffrey Bourmond", "Développeur principal", "", "Actif", "Armonie"),
      p("Jean-Luc Cardinot", "Analyste, interface Sage", "", "Actif", "Armonie"),
      p("Vantai Nguyen", "Développeur (transferts, échange de livres)", "", "Actif", "Armonie"),
      p("Lionel Kieffer", "Responsable développement", "", "Actif", "Armonie"),
    ],
  },
  "DS Smith": {
    description:
      "DS Smith Packaging (ex-Nicollet) — emballage carton de luxe & PLV. TMA de l'application eMage sur IBM i : du devis à la facturation, planification WPRESS, production multi-usines (Rochechouart, Toury, Neuville, Fegersheim), interfaces PLM / Qualiac / EDI.",
    tech: ["IBM i / AS-400", "eMage", "WPRESS", "Bibliothèques GYPUBLINIC / BIGFIC / SERVICE", "EDI"],
    team: [
      p("Florian Crouau", "Responsable TMA", "", "Actif", "Armonie"),
      p("Lionel Kieffer", "Développeur", "", "Actif", "Armonie"),
      p("Étienne Delobelle", "Développeur", "", "Actif", "Armonie"),
      p("N. Renard", "Contact client", "", "Actif", "Client"),
      p("F. Nouzières", "Contact client", "", "Actif", "Client"),
    ],
  },
  Tafanel: {
    description:
      "Tafanel — premier distributeur de boissons d'Île-de-France pour le CHR (depuis 1932). Modernisation du socle IBM i : refonte RPG & déploiement PHL Mobile. Suivi Jira PTAF.",
    tech: ["IBM i / AS-400", "GestCom", "Suite PHL", "PHL Mobile", "RPG"],
    team: [
      p("Yann-André Roehrig", "Référent langage / refonte RPG", "", "Actif", "Armonie"),
      p("Lionel Kieffer", "Prise d'empreinte", "", "Actif", "Armonie"),
    ],
  },
  Bellion: {
    description:
      "Belmet (groupe Bellion) — refonte du SI de gestion commerciale (projet ERP26). Armonie en maîtrise d'œuvre (MOE) + AMOA. Approche « 1 pour 1 ». Réunion de lancement le 03/06/2026 ; CDC final attendu le 30/06, kick-off le 01/07.",
    tech: ["ERP26 (cible)", "Système modulaire", "Reprise à l'identique"],
    team: [
      p("Nicolas Durand", "Chef de projet (MOE)", "nikkodurand@gmail.com", "Actif", "Armonie"),
      p("Léo Gualano", "Suppléant", "", "Actif", "Armonie"),
      p("Sylvain Aktepe", "AMOA", "", "Actif", "Armonie"),
      p("Bruno Labbay", "Organisation", "", "Actif", "Armonie"),
      p("Guy Routier", "Escalade", "", "Actif", "Armonie"),
      p("Lionel Kieffer", "Référent legacy", "", "Actif", "Armonie"),
      p("Yann-André Roehrig", "Référent langage", "", "Actif", "Armonie"),
      p("Jonathan Lancelot", "DSI Groupe", "", "Actif", "Client"),
      p("Rodolphe Inizan", "Chef de projet", "", "Actif", "Client"),
      p("Dominique Quentel", "Qualité", "", "Actif", "Client"),
      p("François Bellion", "Directeur général Belmet", "", "Actif", "Client"),
      p("Antoine Bellion", "Directeur général Groupe", "", "Actif", "Client"),
    ],
  },
  Balas: {
    description:
      "Groupe Balas — BTP, génie climatique & fluides (fondé en 1804, Île-de-France). Dossier en amorçage : prise d'empreinte du SI à réaliser, support ≈ 0,5 ETP. ERP IFS.",
    tech: ["ERP IFS", "(prise d'empreinte à réaliser)"],
    team: [
      p("Jérôme Balas", "Directeur général", "", "Actif", "Client"),
      p("Maxime Gramier", "Contact opérationnel", "", "À confirmer", "Client"),
      p("Lionel Kieffer", "Supervision & prise d'empreinte", "", "Actif", "Armonie"),
      p("Léo Gualano", "Référent technique", "", "Actif", "Armonie"),
      p("Guillaume Pizard", "Développeur", "", "Actif", "Armonie"),
      p("Abdelaziz El Kaddari", "Développeur", "", "Actif", "Armonie"),
    ],
  },
  IMA: {
    description:
      "Inter Mutuelles Assistance (Niort) — TMA du SI d'assistance MULTICOM sur IBM i (Adelia) : maintenance corrective & évolutive, data warehouse, référentiel bénéficiaires (REF_BEN). Migration du suivi vers Jira (TIMA) en cours. Charge 3,2 → 4,2 ETP.",
    tech: ["IBM i / AS-400", "MULTICOM", "Adelia", "Data warehouse", "REF_BEN"],
    team: [
      p("Mélanie Senebier", "Cheffe de projet", "", "Actif", "Armonie"),
      p("Stéphane François", "Directeur des services", "", "Actif", "Armonie"),
      p("Joshua Vegas", "Développeur", "", "Actif", "Armonie"),
      p("M. Meziane", "Développeur", "", "Actif", "Armonie"),
      p("O. Aimes", "Développeur", "", "Actif", "Armonie"),
      p("L. Sagnal", "Développeur", "", "Actif", "Armonie"),
      p("L. Charrier", "Développeur", "", "Actif", "Armonie"),
      p("B. Dib", "Référent REF_BEN", "", "Actif", "Armonie"),
    ],
  },
  DIAPAR: {
    description:
      "DIAPAR (Distribution Alimentaire Parisienne) — centrale d'achats (enseigne G20), Chilly-Mazarin, ≈ 9 500 références. TMA de la gestion commerciale spécifique (RPG/38) & finance Anaël sur IBM i Power9. Démarrage 06/12/2024. COMOP hebdo, COPIL trimestriel.",
    tech: ["IBM i Power9 / OS 7.4", "GC spécifique (RPG/38)", "Anaël (Infor)", "PHL Spool", "Infolog / Witron WMS", "ProEDI"],
    team: [
      p("Mickaël Barteldt", "Directeur général", "mbarteldt@diapar.com", "Actif", "Client"),
      p("M. Chaibcherif", "DSI", "mchaibcherif@diapar.com", "Actif", "Client"),
      p("J. Ferrandon", "Support", "", "Actif", "Client"),
      p("JJ. Soussand", "Ancien DSI (retraité)", "jjsoussand@diapar.com", "Inactif", "Client"),
      p("Erik Pillère", "Développeur", "", "Actif", "Client"),
      p("Marie-Antoine", "Développeur", "", "Actif", "Client"),
      p("O. Segurel", "Contact", "", "Actif", "Client"),
      p("Mélanie Senebier", "Cheffe de projet", "", "Actif", "Armonie"),
      p("Yann-André Roehrig", "Développeur", "", "Actif", "Armonie"),
      p("A. Ramora", "Développeur", "", "Actif", "Armonie"),
      p("Bruno Labbay", "Organisation", "", "Actif", "Armonie"),
      p("R. Dahmane", "Développeur", "", "Actif", "Armonie"),
    ],
  },
};

function ensure() {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(SEED, null, 2));
  } catch (e) { console.error("[dossiers] init impossible:", e.message); }
}

export function readAll() {
  ensure();
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    // Complète avec les fiches seed absentes (nouveaux dossiers), sans écraser l'existant.
    let changed = false;
    for (const k of Object.keys(SEED)) if (!saved[k]) { saved[k] = SEED[k]; changed = true; }
    if (changed) fs.writeFileSync(FILE, JSON.stringify(saved, null, 2));
    return saved;
  } catch { return { ...SEED }; }
}

export function saveOne(nom, fiche) {
  const all = readAll();
  all[nom] = {
    description: String(fiche.description || ""),
    tech: Array.isArray(fiche.tech) ? fiche.tech.filter(Boolean) : [],
    team: Array.isArray(fiche.team) ? fiche.team : [],
  };
  try { fs.writeFileSync(FILE, JSON.stringify(all, null, 2)); } catch (e) { console.error("[dossiers] écriture impossible:", e.message); }
  return all[nom];
}
