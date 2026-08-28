// dependances.test.js — le déploiement ne doit pas échouer sur un import non déclaré.
//
// Contexte : un déploiement Render a planté sur « Cannot find package 'xlsx' ».
// La dépendance avait disparu du package.json (retirée pendant une session de
// travail pour contourner une restriction réseau, et non remise). Le code
// compilait, les tests passaient — parce que le paquet était présent en local —
// et personne ne l'a vu avant la mise en ligne.
//
// Ce test compare ce que le code IMPORTE à ce que le manifeste DÉCLARE.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SERVEUR = path.join(ICI, "..");

const NATIFS = new Set(["fs","path","url","crypto","child_process","os","http","https","zlib",
  "stream","util","events","buffer","assert","readline","worker_threads","timers",
  "string_decoder","querystring","net","tls","dns","module","perf_hooks","process"]);

function fichiersJs(dossier, acc = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) fichiersJs(p, acc);
    else if (e.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

test("chaque paquet importé est déclaré dans package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(SERVEUR, "package.json"), "utf8"));
  const declarees = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);

  const manquantes = [];
  for (const f of fichiersJs(SERVEUR)) {
    const src = fs.readFileSync(f, "utf8");
    const motifs = [/from\s+["']([^"']+)["']/g, /import\(\s*["']([^"']+)["']\s*\)/g];
    for (const re of motifs) {
      for (const m of src.matchAll(re)) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("/")) continue;      // module local
        if (spec.startsWith("node:")) continue;
        const paquet = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (NATIFS.has(paquet) || declarees.has(paquet)) continue;
        manquantes.push(`${paquet} (importé par ${path.relative(SERVEUR, f)})`);
      }
    }
  }
  assert.deepEqual([...new Set(manquantes)], [],
    "ces paquets sont importés mais absents du package.json : le déploiement échouera");
});

test("xlsx pointe bien sur l'archive SheetJS, pas sur npm", () => {
  // La version npm de xlsx est vulnérable et n'est plus maintenue par SheetJS.
  // Le choix de l'archive CDN est délibéré : ne pas le « corriger » en numéro de version.
  const pkg = JSON.parse(fs.readFileSync(path.join(SERVEUR, "package.json"), "utf8"));
  const v = pkg.dependencies?.xlsx;
  assert.ok(v, "xlsx doit être déclaré : cra-xlsx.js l'importe");
  assert.match(v, /cdn\.sheetjs\.com/, "xlsx doit venir de l'archive SheetJS officielle");
});
