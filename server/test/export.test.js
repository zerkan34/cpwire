// export.test.js — l'export complet est une fonction de SAUVEGARDE.
// S'il perd des données ou fait fuiter un secret sans qu'on s'en aperçoive,
// on ne le découvre qu'au moment où on en a besoin. D'où ces tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";
import JSZip from "jszip";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-exp-"));
process.env.DATA_DIR = DIR;

const eng = await import("../engagements.js");
const gan = await import("../gantts.js");
const reu = await import("../reunionStore.js");

await eng.creer({ quoi: "Relancer Catherine", qui: "Nikko", client: "Belmet", echeance: "2026-09-05" });
await gan.enregistrer({ client: "Tafanel", projet: "GesCo", data: { phases: [{ name: "P1" }], tasks: [{ p: 0, t: "Cadrage", a: 0, b: 1 }] } }, "n@t.fr");
await reu.enregistrer({ titre: "COPROJ", client: "Belmet", date: "2026-08-13", transcript: "Bonjour à tous.", cr: { decisions: ["Report acté"] } });

const { construireExport } = await import("../export.js");
const { buffer, nom, resume } = await construireExport({ demandePar: "n@t.fr" });
const zip = await JSZip.loadAsync(buffer);
const noms = Object.keys(zip.files);
const texte = async (f) => zip.file(f).async("string");

test("l'archive est un ZIP valide et nommé avec la date", () => {
  assert.equal(buffer.slice(0, 2).toString(), "PK");
  assert.match(nom, /^cpwire-export-\d{4}-\d{2}-\d{2}\.zip$/);
});

test("rien n'est perdu : chaque jeu de données est présent", () => {
  for (const attendu of ["donnees/engagements.json", "donnees/gantts.json", "donnees/reunions.json"]) {
    assert.ok(noms.includes(attendu), `${attendu} doit être dans l'archive`);
  }
});

test("les données sont intactes, pas seulement présentes", async () => {
  const e = JSON.parse(await texte("donnees/engagements.json"));
  assert.equal(e[0].quoi, "Relancer Catherine");
  assert.equal(e[0].echeance, "2026-09-05");
});

test("les CSV s'ouvrent dans Excel : point-virgule et BOM", async () => {
  const csv = await texte("tableaux/engagements.csv");
  assert.equal(csv.charCodeAt(0), 0xFEFF, "sans BOM, Excel casse les accents");
  assert.ok(csv.split("\r\n")[0].includes(";"), "séparateur point-virgule");
  assert.ok(csv.includes("Relancer Catherine"));
});

test("chaque réunion a sa fiche lisible sans outil", async () => {
  const fiche = noms.find((n) => n.startsWith("reunions/") && n.endsWith(".md"));
  assert.ok(fiche, "une fiche Markdown par réunion");
  const t = await texte(fiche);
  assert.match(t, /COPROJ/);
  assert.match(t, /Bonjour à tous/, "la transcription intégrale est reprise");
});

test("chaque planning est réimportable", async () => {
  const f = noms.find((n) => n.startsWith("plannings/") && n.endsWith(".json"));
  assert.ok(f);
  const d = JSON.parse(await texte(f));
  assert.equal(d.tasks[0].t, "Cadrage");
});

test("AUCUN secret ni mot de passe dans l'archive", async () => {
  const suspects = /(password|passwordHash|\bsalt\b|api[_-]?key|ATATT|client_secret|refresh_token)/i;
  for (const f of noms) {
    if (zip.files[f].dir) continue;
    if (f === "LISEZ-MOI.txt" || f === "MANIFESTE.json") continue;  // ils en PARLENT
    const t = await texte(f);
    assert.ok(!suspects.test(t), `${f} ne doit contenir aucun secret`);
  }
});

test("le manifeste dit ce qui a été pris ET ce qui ne l'a pas été", () => {
  assert.ok(resume.contenu.engagements >= 1);
  assert.ok(Array.isArray(resume.nonExporte) && resume.nonExporte.length >= 3);
  assert.match(resume.nonExporte.join(" "), /mots de passe/i);
  assert.equal(resume.demandePar, "n@t.fr", "on sait qui a exporté");
});

test("un mode d'emploi accompagne l'archive", async () => {
  const l = await texte("LISEZ-MOI.txt");
  assert.match(l, /STRUCTURE/);
  assert.match(l, /CONFIDENTIALITÉ/);
});
