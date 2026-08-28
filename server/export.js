// export.js — EXPORT TOTAL des données de cp|WIRE, en une archive ZIP.
//
// Raison d'être : à ce jour, les données de l'outil vivent dans une base Neon et
// dans un dossier de données sur Render. Personne, en dehors de qui a les accès
// d'hébergement, ne peut en obtenir une copie. Une passation, un audit, une
// sauvegarde avant manipulation risquée, ou simplement le droit de récupérer son
// travail : tout cela demandait jusqu'ici un accès administrateur à Render.
//
// L'archive est PORTABLE et LISIBLE sans cp|WIRE :
//   - le JSON brut, pour réimporter ou traiter par programme ;
//   - des CSV ouvrables dans Excel, pour les tableaux qui s'y prêtent ;
//   - un LISEZ-MOI qui explique chaque fichier ;
//   - un MANIFESTE qui liste ce qui a été exporté, et surtout ce qui NE L'A PAS ÉTÉ.
//
// Ce qui n'est volontairement jamais exporté : les secrets (variables
// d'environnement, jetons Jira, clés d'API) et les mots de passe, même hachés.
// Une archive d'export circule par courriel et se retrouve sur des postes ; elle
// ne doit pas être un trousseau de clés.

import JSZip from "jszip";
import fs from "fs";
import path from "path";
import { restoreManyBlobs, persistenceActive } from "./persist.js";
import { dataDir, dataDirInfo } from "./paths.js";

/* ------------------------------------------------------------------ */
/* Outils                                                             */
/* ------------------------------------------------------------------ */

const joli = (o) => JSON.stringify(o, null, 2);

/** Convertit un tableau d'objets en CSV lisible par Excel en français. */
function versCsv(lignes, colonnes) {
  if (!Array.isArray(lignes) || !lignes.length) return "";
  const cols = colonnes || [...new Set(lignes.flatMap((l) => Object.keys(l || {})))];
  const cellule = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // Point-virgule comme séparateur : c'est ce qu'attend Excel en configuration
    // française. Les guillemets internes se doublent, selon la convention CSV.
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(";"), ...lignes.map((l) => cols.map((c) => cellule(l && l[c])).join(";"))].join("\r\n");
}

/** Un BOM en tête, sans quoi Excel affiche les accents de travers. */
const csvExcel = (contenu) => (contenu ? "\uFEFF" + contenu : "");

function lireJson(chemin) {
  try { return JSON.parse(fs.readFileSync(chemin, "utf8")); } catch (e) { return null; }
}

/** Analyse un blob : le contenu peut être une chaîne JSON ou déjà un objet. */
function analyser(contenu) {
  if (contenu == null) return null;
  if (typeof contenu === "object") return contenu;
  try { return JSON.parse(contenu); } catch (e) { return contenu; }
}

/* ------------------------------------------------------------------ */
/* Ce qu'on sait mettre en tableau                                     */
/* ------------------------------------------------------------------ */

// Pour ces jeux de données, un CSV a du sens : ce sont des listes de lignes
// comparables. Le reste part en JSON seulement, parce qu'aplatir une structure
// imbriquée en colonnes produit un tableau illisible.
const TABLEAUX = {
  engagements: (d) => (Array.isArray(d) ? d.map((e) => ({
    id: e.id, nature: e.nature, statut: e.statut, quoi: e.quoi, qui: e.qui,
    client: e.client, echeance: e.echeance, note: e.note, origine: e.origine,
    creeLe: e.creeLe, majLe: e.majLe,
  })) : []),
  reunions: (d) => (Array.isArray(d) ? d.map((r) => ({
    id: r.id, titre: r.titre, client: r.client, date: r.date,
    dureeMinutes: Math.round((r.dureeMs || 0) / 60000),
    tailleTranscription: (r.transcript || "").length,
    aUnCompteRendu: !!r.cr, majLe: r.majLe,
  })) : []),
  gantts: (d) => (Array.isArray(d) ? d.map((g) => ({
    id: g.id, client: g.client, projet: g.projet, titre: g.titre,
    phases: (g.data?.phases || []).length, taches: (g.data?.tasks || []).length,
    creeLe: g.creeLe, majLe: g.majLe, majPar: g.majPar,
  })) : []),
};

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

/**
 * Construit l'archive complète.
 * @param {object} ctx  { demandePar, appVersion }
 * @returns {Promise<{buffer:Buffer, nom:string, resume:object}>}
 */
export async function construireExport(ctx = {}) {
  const zip = new JSZip();
  const debut = Date.now();
  const journal = [];      // ce qui a été pris
  const absents = [];      // ce qui manquait, et pourquoi
  const resume = {};

  const ajouter = (chemin, contenu, note) => {
    if (contenu == null || contenu === "") { absents.push({ chemin, raison: note || "vide" }); return false; }
    zip.file(chemin, contenu);
    const taille = Buffer.byteLength(typeof contenu === "string" ? contenu : String(contenu));
    journal.push({ chemin, octets: taille });
    return true;
  };

  /* ---- 1. Base durable : TOUT ce qui y est stocké, sans liste en dur ---- */
  // On ne devine pas les clés : on demande tout. Ainsi, une donnée ajoutée
  // demain à l'application sera exportée sans qu'on ait à modifier ce fichier.
  let blobs = [];
  try {
    if (persistenceActive()) blobs = await restoreManyBlobs("");
  } catch (e) {
    absents.push({ chemin: "donnees/", raison: "base durable injoignable : " + e.message });
  }

  const vus = new Set();
  for (const b of blobs) {
    const nom = String(b.name || "").trim();
    if (!nom) continue;
    // Les clés de test créées par les modules au démarrage n'ont aucun intérêt.
    if (/_test$/.test(nom)) continue;
    vus.add(nom);
    const valeur = analyser(b.content);
    ajouter(`donnees/${nom}.json`, joli(valeur), "clé vide en base");
    resume[nom] = Array.isArray(valeur) ? valeur.length : (valeur && typeof valeur === "object" ? Object.keys(valeur).length : 1);

    const enTableau = TABLEAUX[nom];
    if (enTableau) {
      const csv = versCsv(enTableau(valeur));
      if (csv) ajouter(`tableaux/${nom}.csv`, csvExcel(csv));
    }
  }

  /* ---- 2. Dossier de données : ce qui n'est pas en base ---- */
  let dossier = null;
  try { dossier = typeof dataDir === "function" ? dataDir() : dataDir; } catch (e) { dossier = null; }
  if (dossier && fs.existsSync(dossier)) {
    for (const f of fs.readdirSync(dossier)) {
      if (!f.endsWith(".json")) continue;
      const base = f.replace(/\.json$/, "");
      if (vus.has(base)) continue;      // déjà pris depuis la base, qui fait foi
      const v = lireJson(path.join(dossier, f));
      if (v == null) { absents.push({ chemin: `donnees/${f}`, raison: "fichier illisible" }); continue; }
      ajouter(`donnees/${f}`, joli(v));
      resume[base] = Array.isArray(v) ? v.length : (v && typeof v === "object" ? Object.keys(v).length : 1);
      const enTableau = TABLEAUX[base];
      if (enTableau) {
        const csv = versCsv(enTableau(v));
        if (csv) ajouter(`tableaux/${base}.csv`, csvExcel(csv));
      }
    }
  } else {
    absents.push({ chemin: "donnees/ (fichiers)", raison: "dossier de données absent" });
  }

  /* ---- 3. Comptes : sans aucun élément secret ---- */
  try {
    const { listUsers } = await import("./users.js");
    const comptes = (await listUsers()).map((u) => ({
      email: u.email, role: u.role, confirme: !!u.confirmed, creeLe: u.createdAt || "",
      // Ni mot de passe, ni empreinte, ni sel : une archive circule.
    }));
    if (comptes.length) {
      ajouter("donnees/comptes.json", joli(comptes));
      ajouter("tableaux/comptes.csv", csvExcel(versCsv(comptes)));
      resume.comptes = comptes.length;
    }
  } catch (e) {
    absents.push({ chemin: "donnees/comptes.json", raison: "liste des comptes indisponible : " + e.message });
  }

  /* ---- 4. Contenu intégral des réunions et des plannings ---- */
  // La transcription d'une réunion et le contenu d'un planning sont volumineux :
  // ils méritent un fichier chacun, nommé lisiblement, plutôt qu'un gros JSON.
  const detacher = async (nomBlob, dossierZip, nommer, contenu) => {
    const src = blobs.find((b) => b.name === nomBlob);
    const val = src ? analyser(src.content) : lireJson(path.join(dossier || "", nomBlob + ".json"));
    if (!Array.isArray(val)) return;
    for (const item of val) {
      const txt = contenu(item);
      if (txt) ajouter(`${dossierZip}/${nommer(item)}`, txt);
    }
  };
  await detacher("reunions", "reunions", (r) =>
    `${(r.date || "sans-date")}_${String(r.client || r.titre || r.id).replace(/[^\w.-]+/g, "-")}.md`.slice(0, 120),
    (r) => {
      const l = [`# ${r.titre || "Réunion"}`, r.client ? `Client : ${r.client}` : "", `Date : ${r.date || "—"}`, ""];
      if (r.cr) l.push("## Compte rendu", "", JSON.stringify(r.cr, null, 2), "");
      if (r.transcript) l.push("## Transcription", "", r.transcript);
      return l.filter(Boolean).join("\n");
    });
  await detacher("gantts", "plannings", (g) =>
    `${String(g.client || "").replace(/[^\w.-]+/g, "-")}_${String(g.projet || "").replace(/[^\w.-]+/g, "-")}.json`.slice(0, 120),
    (g) => joli(g.data || {}));

  /* ---- 5. Manifeste et mode d'emploi ---- */
  const horodatage = new Date();
  const st = (() => { try { return dataDirInfo(); } catch (e) { return {}; } })();

  const manifeste = {
    genereLe: horodatage.toISOString(),
    demandePar: ctx.demandePar || "inconnu",
    application: "cp|WIRE",
    persistance: { baseDurable: (() => { try { return persistenceActive(); } catch (e) { return false; } })(),
                   dossierDonnees: dossier || null, disquePersistant: !!st.persistent },
    contenu: resume,
    fichiers: journal.sort((a, b) => a.chemin.localeCompare(b.chemin)),
    absents,
    nonExporte: [
      "Variables d'environnement et secrets (jetons Jira, clés d'API, identifiants Microsoft et SharePoint)",
      "Mots de passe et empreintes de mots de passe des comptes",
      "Tickets Jira : ils appartiennent à Jira, cp|WIRE n'en garde pas de copie de référence",
      "Documents SharePoint : seul le catalogue est exporté, pas le contenu des fichiers",
    ],
    dureeMs: Date.now() - debut,
  };
  zip.file("MANIFESTE.json", joli(manifeste));

  zip.file("LISEZ-MOI.txt", [
    "EXPORT COMPLET DES DONNÉES cp|WIRE",
    "===================================",
    "",
    `Généré le ${horodatage.toLocaleString("fr-FR")} par ${ctx.demandePar || "un administrateur"}.`,
    "",
    "STRUCTURE",
    "",
    "  donnees/     Les données brutes, un fichier JSON par jeu.",
    "               C'est la source de vérité : tout est là, sans perte.",
    "",
    "  tableaux/    Les mêmes données en CSV, ouvrables dans Excel.",
    "               Séparateur point-virgule, encodage UTF-8 avec BOM :",
    "               un double-clic suffit, les accents s'affichent bien.",
    "               Seuls les jeux qui ont une forme de tableau y figurent.",
    "",
    "  reunions/    Une fiche Markdown par réunion : compte rendu et",
    "               transcription intégrale, lisibles sans aucun outil.",
    "",
    "  plannings/   Un fichier JSON par planning GANTT, réimportable dans",
    "               l'outil par « Importer JSON ».",
    "",
    "  MANIFESTE.json   Ce qui a été exporté, ce qui manquait et pourquoi.",
    "",
    "CE QUI N'EST PAS DANS CETTE ARCHIVE, VOLONTAIREMENT",
    "",
    "  - Les secrets : jetons Jira, clés d'API, identifiants Microsoft.",
    "  - Les mots de passe, même sous forme hachée.",
    "  Une archive d'export circule par courriel et atterrit sur des postes.",
    "  Elle ne doit pas être un trousseau de clés.",
    "",
    "  - Les tickets Jira : ils appartiennent à Jira. cp|WIRE les lit, il",
    "    n'en conserve pas de copie de référence.",
    "  - Le contenu des documents SharePoint : seul le catalogue est ici.",
    "",
    "CONFIDENTIALITÉ",
    "",
    "  Cette archive contient des comptes rendus de réunion, des noms de",
    "  personnes et des données client. Traitez-la comme un document interne.",
    "",
  ].join("\n"));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const jour = horodatage.toISOString().slice(0, 10);
  return { buffer, nom: `cpwire-export-${jour}.zip`, resume: manifeste };
}
