// quotes.test.js — la Cote doit refléter le MOUVEMENT sans rien inventer :
// variation/direction justes, indice agrégé, et « — »/null si l'historique manque.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-quotes-"));
process.env.DATA_DIR = dir;
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const mk = (done, reste) => ({
  miseEnProd: [], termine: Array.from({ length: done }, (_, i) => "T" + i),
  recetteClient: [], recetteArmonie: [], encours: Array.from({ length: reste }, (_, i) => "E" + i),
  retourTest: [], attenteClient: [],
});
fs.writeFileSync(path.join(dir, "point-history.json"), JSON.stringify({
  DIAPAR: { "": { [day(2)]: mk(24, 26), [day(1)]: mk(28, 22), [day(0)]: mk(34, 16) } }, // +6 auj.
  EDL: { "": { [day(1)]: mk(8, 12), [day(0)]: mk(6, 14) } },                             // -2 (régression)
  NEUF: { "": { [day(0)]: mk(3, 7) } },                                                   // 1 seul jour
}));
const { buildQuotes } = await import("../quotes.js");

const R = buildQuotes({
  pointDerived: {
    days: [{ day: day(0), movements: [{ cle: "TDIA-1", dossier: "DIAPAR", fromLabel: "En cours", toLabel: "Terminé", regression: false }] }],
    pulse: { DIAPAR: [{ day: day(0), n: 6 }] },
  },
  projections: { dossiers: [{ dossier: "DIAPAR", rythme: 4 }] },
  risk: { dossiers: [{ dossier: "DIAPAR", score: 32, niveau: "modéré" }] },
});

test("valeur = avancement % du dernier point", () => {
  const dia = R.quotes.find((q) => q.dossier === "DIAPAR");
  assert.equal(dia.value, 68); // 34 / (34+16)
});

test("variation et direction justes (hausse / baisse)", () => {
  const dia = R.quotes.find((q) => q.dossier === "DIAPAR");
  assert.equal(dia.varDone, 6); assert.equal(dia.dir, "up");
  const edl = R.quotes.find((q) => q.dossier === "EDL");
  assert.equal(edl.varDone, -2); assert.equal(edl.dir, "down");
});

test("tri : ce qui bouge le plus en tête", () => {
  assert.equal(R.quotes[0].dossier, "DIAPAR");
});

test("indice global agrégé et orienté", () => {
  assert.ok(R.index.value != null);
  assert.equal(R.index.dir, "up");
  assert.ok(R.index.spark.length >= 2);
});

test("zéro-invention : 1 seul jour d'historique ⇒ variation null, direction plate", () => {
  const neuf = R.quotes.find((q) => q.dossier === "NEUF");
  assert.equal(neuf.varDone, null);
  assert.equal(neuf.dir, "flat");
});

test("enrichissements branchés : vélocité et risque remontés quand fournis", () => {
  const dia = R.quotes.find((q) => q.dossier === "DIAPAR");
  assert.equal(dia.velocite, 4);
  assert.equal(dia.risque, 32);
});
