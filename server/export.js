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
import { courbes, barres, anneau, frise } from "./diagrammes.js";

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
  tickets: (d) => (Array.isArray(d) ? d.map((i) => ({
    cle: i.cle, dossier: i.dossier, projet: i.projet, resume: i.resume,
    statut: i.statut, statutJira: i.statutJira, categorie: i.categorie,
    priorite: i.priorite, assigne: i.assigne, dev: i.dev,
    creeLe: i.cree, majLe: i.maj, statutDepuis: i.statutDepuis,
    enRetard: i.enRetard ? "oui" : "", url: i.url,
  })) : []),
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
  const horodatage = new Date();
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


  /* ---- 5. Le portefeuille Jira au moment de l'export ---- */
  // Les tickets appartiennent à Jira, mais un dossier de passation sans l'état
  // du portefeuille à la date du départ n'a pas grand sens : c'est la photo qui
  // permet de comprendre où en était chaque client.
  let tickets = [];
  try {
    const { loadSnapshot } = await import("./store.js");
    const snap = loadSnapshot();
    tickets = Array.isArray(snap.issues) ? snap.issues : [];
    if (tickets.length) {
      ajouter("donnees/tickets.json", joli({ synchroniseLe: snap.syncedAt, tickets }));
      ajouter("tableaux/tickets.csv", csvExcel(versCsv(TABLEAUX.tickets(tickets))));
      resume.tickets = tickets.length;
    }
  } catch (e) {
    absents.push({ chemin: "donnees/tickets.json", raison: "instantané Jira illisible : " + e.message });
  }

  /* ---- 6. Référentiels et données de contexte ---- */
  const modules = [
    ["referentiel", async () => (await import("./referentiel.js")).loadReferentiel()],
    ["projets", async () => (await import("./projets.js")).loadProjets()],
    ["acces", async () => (await import("./projets.js")).loadAcces()],
    ["connaissance", async () => (await import("./connaissance.js")).readConnaissance()],
    ["historique-jours", async () => (await import("./pointHistory.js")).seriesByDossier()],
    ["historique-mois", async () => (await import("./pointHistory.js")).monthlyPortfolio()],
  ];
  for (const [nom, charger] of modules) {
    if (vus.has(nom)) continue;
    try {
      const v = await charger();
      if (v == null || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) continue;
      ajouter(`donnees/${nom}.json`, joli(v));
      resume[nom] = Array.isArray(v) ? v.length : Object.keys(v).length;
    } catch (e) {
      absents.push({ chemin: `donnees/${nom}.json`, raison: e.message });
    }
  }

  /* ---- 7. L'Atelier de flux et les livrables client ---- */
  // Ce sont des documents produits pour Belmet : ils font partie du travail
  // livré, ils n'ont pas à rester seulement sur le serveur.
  try {
    const dossierFlux = path.join(path.dirname(new URL(import.meta.url).pathname), "public", "flux");
    if (fs.existsSync(dossierFlux)) {
      for (const f of fs.readdirSync(dossierFlux)) {
        const complet = path.join(dossierFlux, f);
        if (!fs.statSync(complet).isFile()) continue;
        zip.file(`atelier-de-flux/${f}`, fs.readFileSync(complet));
        journal.push({ chemin: `atelier-de-flux/${f}`, octets: fs.statSync(complet).size });
      }
      resume["atelier-de-flux"] = fs.readdirSync(dossierFlux).length;
    }
  } catch (e) {
    absents.push({ chemin: "atelier-de-flux/", raison: e.message });
  }

  /* ---- 8. Diagrammes ---- */
  const diagrammes = [];
  const posterDiagramme = (nom, svg, legende) => {
    if (!svg) return;
    zip.file(`diagrammes/${nom}.svg`, svg);
    journal.push({ chemin: `diagrammes/${nom}.svg`, octets: Buffer.byteLength(svg) });
    diagrammes.push({ nom, legende });
  };

  try {
    // Répartition du portefeuille par client.
    if (tickets.length) {
      const parDossier = {};
      for (const t of tickets) { const d = t.dossier || "—"; parDossier[d] = (parDossier[d] || 0) + 1; }
      posterDiagramme("portefeuille-par-client",
        barres({ titre: "Portefeuille par client",
          sous: `${tickets.length} tickets au ${new Date().toLocaleDateString("fr-FR")}`,
          donnees: Object.entries(parDossier).sort((a, b) => b[1] - a[1]).map(([nom, valeur]) => ({ nom, valeur })) }),
        "Nombre de tickets par dossier, tous statuts confondus.");

      // Répartition par catégorie.
      const CAT = { afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
        recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
        miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé" };
      const parCat = {};
      for (const t of tickets) { const c = t.categorie || "?"; parCat[c] = (parCat[c] || 0) + 1; }
      posterDiagramme("repartition-par-statut",
        anneau({ titre: "Répartition par statut", sous: "État du portefeuille au moment de l'export",
          parts: Object.entries(parCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ nom: CAT[k] || k, valeur: v })) }),
        "Où en sont les tickets, toutes affaires confondues.");

      // Charge par personne.
      const parDev = {};
      for (const t of tickets) {
        if (["termine", "miseEnProd", "annule"].includes(t.categorie)) continue;
        const d = t.dev || t.assigne || "Non assigné";
        parDev[d] = (parDev[d] || 0) + 1;
      }
      posterDiagramme("charge-par-personne",
        barres({ titre: "Charge par personne", sous: "Tickets ouverts uniquement",
          donnees: Object.entries(parDev).sort((a, b) => b[1] - a[1]).map(([nom, valeur]) => ({ nom, valeur })) }),
        "Tickets encore ouverts, par personne qui les porte.");
    }

    // Évolution historique, par dossier.
    try {
      const { seriesByDossier } = await import("./pointHistory.js");
      const series = seriesByDossier() || {};
      const courbesDossiers = Object.entries(series).slice(0, 8).map(([dossier, pts]) => ({
        nom: dossier,
        points: (Array.isArray(pts) ? pts : []).map((p) => ({ x: p.day || p.date || "", y: p.ouverts ?? p.open ?? p.total ?? 0 })),
      })).filter((s) => s.points.length >= 2);
      if (courbesDossiers.length) {
        posterDiagramme("evolution-par-dossier",
          courbes({ titre: "Évolution du portefeuille", sous: "Tickets ouverts, jour par jour", series: courbesDossiers }),
          "Comment la charge de chaque dossier a évolué dans le temps.");
      }
    } catch (e) { absents.push({ chemin: "diagrammes/evolution-par-dossier.svg", raison: e.message }); }

    // Frise des échéances.
    try {
      const { buildDeadlineRadar } = await import("./deadlines.js");
      const { readConnaissance } = await import("./connaissance.js");
      const radar = buildDeadlineRadar({}, readConnaissance() || {}) || [];
      if (radar.length) {
        posterDiagramme("echeances",
          frise({ titre: "Échéances", sous: "Jalons relevés dans les fiches et la mémoire",
            jalons: radar.map((r) => ({ date: r.date, label: `${r.dossier || ""} · ${r.label || ""}`.trim() })) }),
          "Les jalons connus, sur douze mois glissants.");
      }
    } catch (e) { absents.push({ chemin: "diagrammes/echeances.svg", raison: e.message }); }

    // Engagements par statut.
    const eng = blobs.find((b) => b.name === "engagements");
    const listeEng = eng ? analyser(eng.content) : lireJson(path.join(dossier || "", "engagements.json"));
    if (Array.isArray(listeEng) && listeEng.length) {
      const parStatut = {};
      for (const e of listeEng) { const k = e.statut || "?"; parStatut[k] = (parStatut[k] || 0) + 1; }
      const L = { a_faire: "À faire", en_cours: "En cours", fait: "Fait", abandonne: "Abandonné" };
      posterDiagramme("engagements-par-statut",
        anneau({ titre: "Engagements pris en séance", sous: "Actions et décisions du registre",
          parts: Object.entries(parStatut).map(([k, v]) => ({ nom: L[k] || k, valeur: v })) }),
        "Les engagements du registre, par état d'avancement.");
    }
  } catch (e) {
    absents.push({ chemin: "diagrammes/", raison: e.message });
  }

  /* ---- 9. Rapport de passation, lisible dans un navigateur ---- */
  const rapport = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>cp|WIRE — dossier de passation</title>
<style>
 body{margin:0;background:#fff;color:${"#1D1D1B"};font-family:Inter,system-ui,sans-serif;line-height:1.6}
 .bar{height:6px;background:linear-gradient(90deg,#1D1D1B 0%,#3B2E8C 55%,#F2C316 100%)}
 .wrap{max-width:1000px;margin:0 auto;padding:28px 24px 60px}
 h1{font-size:26px;margin:18px 0 4px} h2{font-size:17px;margin:34px 0 10px;color:#3B2E8C}
 .sub{color:#6E6A86;font-size:14px;margin:0 0 22px}
 table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 18px}
 th{background:#3B2E8C;color:#fff;text-align:left;padding:7px 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
 td{padding:7px 10px;border-top:1px solid #E2DEF0}
 tr:nth-child(even) td{background:#F5F2FC}
 figure{margin:0 0 26px;border:1px solid #E2DEF0;border-radius:12px;overflow:hidden}
 figure img{display:block;width:100%}
 figcaption{padding:9px 14px;font-size:12.5px;color:#6E6A86;background:#F5F2FC}
 .note{background:#F5F2FC;border-left:3px solid #F2C316;padding:12px 16px;border-radius:8px;font-size:13.5px}
</style></head><body><div class="bar"></div><div class="wrap">
<h1>cp|WIRE — dossier de passation</h1>
<p class="sub">Export du ${horodatage.toLocaleString("fr-FR")}${ctx.demandePar ? ` · par ${ctx.demandePar}` : ""}</p>
<div class="note">Ce document accompagne l'archive. Les diagrammes sont des fichiers SVG du dossier
<code>diagrammes/</code> : ils s'ouvrent seuls, sans réseau ni logiciel particulier. Les données
qui les alimentent sont dans <code>donnees/</code>, en JSON, et dans <code>tableaux/</code>, en CSV.</div>
<h2>Ce que contient l'archive</h2>
<table><tr><th>Jeu de données</th><th>Volume</th></tr>
${Object.entries(resume).sort().map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}
</table>
<h2>Diagrammes</h2>
${diagrammes.map((d) => `<figure><img src="diagrammes/${d.nom}.svg" alt="${d.nom}"><figcaption>${d.legende}</figcaption></figure>`).join("") || "<p class=\"sub\">Aucun diagramme : pas assez de données au moment de l'export.</p>"}
<h2>Ce qui n'est pas dans cette archive</h2>
<ul>${["Variables d'environnement et secrets (jetons Jira, clés d'API, identifiants Microsoft et SharePoint)",
       "Mots de passe et empreintes de mots de passe des comptes",
       "Le contenu des documents SharePoint : seul le catalogue est exporté"].map((x) => `<li>${x}</li>`).join("")}</ul>
<p class="sub">Voir <code>MANIFESTE.json</code> pour le détail complet, et <code>PASSATION.md</code>
à la racine du dépôt pour la reprise de l'outil.</p>
</div></body></html>`;
  zip.file("RAPPORT-PASSATION.html", rapport);
  journal.push({ chemin: "RAPPORT-PASSATION.html", octets: Buffer.byteLength(rapport) });

  /* ---- 10. Manifeste et mode d'emploi ---- */
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
