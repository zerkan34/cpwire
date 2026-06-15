// Référentiel Recette : le SOCLE qui fait parler la même langue.
// Domaine → Option → liste de Programmes (saisie/validée par le dev),
// puis rapprochement AUTOMATIQUE de chaque programme à son/ses ticket(s) Jira
// (le programme est déjà extrait du titre « Réécriture XXX » par programmes.js → i.prog).
// Aucune invention : si un programme n'a pas de ticket, il est marqué « non lié ».
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_PATH = path.join(__dirname, "referentiel.json");

export function loadReferentiel() {
  try { return JSON.parse(fs.readFileSync(REF_PATH, "utf8")); }
  catch { return {}; }
}
export function referentielClients() {
  return Object.keys(loadReferentiel()).filter((k) => k !== "_doc");
}

// Normalisation d'un nom de programme : majuscules, sans joker ni espaces de fin.
const norm = (s) => String(s || "").toUpperCase().replace(/[*\s]+$/g, "").trim();

const DONE = ["termine", "miseEnProd"];
const RECETTE = ["recetteArmonie", "recetteClient"];
const RETOUR = ["retourTest", "retourProd"];

// Index programme → tickets, à partir des tickets live.
function indexByProgramme(issues) {
  const idx = new Map();
  const add = (name, issue) => {
    const n = norm(name);
    if (!n) return;
    if (!idx.has(n)) idx.set(n, []);
    if (!idx.get(n).some((x) => x.cle === issue.cle)) idx.get(n).push(issue);
  };
  for (const i of issues) {
    if (i.prog && i.prog.name) add(i.prog.name, i);
    // repli : tente d'attraper le programme dans un titre « Réécriture XXX »
    const m = String(i.resume || "").match(/r[ée]+criture\s+([A-Z0-9_]{3,12})/i);
    if (m) add(m[1], i);
  }
  return idx;
}

// État représentatif d'un programme = catégorie du ticket le plus « avancé » trouvé.
const RANK = ["afaire", "encours", "retourProd", "retourTest", "recetteArmonie", "recetteClient", "attenteClient", "miseEnProd", "termine"];
function bestCategory(tickets) {
  let best = null, bestRank = -1;
  for (const t of tickets) {
    const r = RANK.indexOf(t.categorie);
    if (r > bestRank) { bestRank = r; best = t.categorie; }
  }
  return best;
}

// Croise le référentiel d'un client avec les tickets Jira live.
export function crossReferentiel(issues, client) {
  const ref = loadReferentiel()[client];
  if (!ref) return null;
  const idx = indexByProgramme(issues || []);
  const byDomaine = {};

  for (const opt of ref.options) {
    const programmes = (opt.programmes || []).map((p) => {
      const tickets = (idx.get(norm(p)) || []).map((i) => ({
        cle: i.cle, resume: i.resume, statut: i.statut, categorie: i.categorie,
        url: i.url, qui: (i.dev && i.dev !== "Non assigné") ? i.dev : (i.assigne || ""),
      }));
      return { nom: p, lie: tickets.length > 0, etat: bestCategory(tickets), tickets };
    });

    const cats = {};
    programmes.forEach((p) => p.tickets.forEach((t) => { cats[t.categorie] = (cats[t.categorie] || 0) + 1; }));
    const total = programmes.length;
    const lies = programmes.filter((p) => p.lie).length;
    const done = DONE.reduce((s, k) => s + (cats[k] || 0), 0);
    const enRecette = RECETTE.reduce((s, k) => s + (cats[k] || 0), 0);
    const retours = RETOUR.reduce((s, k) => s + (cats[k] || 0), 0);
    // Avancement : part de programmes liés qui sont validés (MEP/terminé). 0 si rien de lié.
    const pct = lies ? Math.round((done / lies) * 100) : 0;

    const enriched = {
      domaine: opt.domaine, code: opt.code, libelle: opt.libelle,
      statutRecette: opt.statutRecette || "", echeance: opt.echeance || "", livraison: opt.livraison || "",
      grosseChaine: !!opt.grosseChaine, noteChaine: opt.noteChaine || "",
      total, lies, nonLies: total - lies, done, enRecette, retours, pct,
      programmes,
    };
    (byDomaine[opt.domaine] ||= []).push(enriched);
  }

  const domaines = Object.entries(byDomaine)
    .map(([domaine, options]) => ({ domaine, options }))
    .sort((a, b) => a.domaine.localeCompare(b.domaine, "fr"));

  const nbProgrammes = ref.options.reduce((s, o) => s + (o.programmes ? o.programmes.length : 0), 0);
  return {
    client, majSource: ref.majSource || "",
    nbOptions: ref.options.length, nbProgrammes,
    domaines,
  };
}
