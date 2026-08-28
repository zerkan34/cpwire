// gantts.test.js — les plannings doivent survivre à leur auteur.
//
// Contexte : les GANTT vivaient dans le localStorage du navigateur de la personne
// qui les créait. Invisibles pour les collègues, perdus au nettoyage du cache,
// disparus au départ de leur auteur. Ils sont désormais côté serveur, partagés.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-gantt-"));
const reg = await import("../gantts.js");

const planBelmet = {
  client: "Belmet", projet: "ERP26",
  data: {
    phases: [{ name: "PHASE 0 · Réalisé" }, { name: "PHASE 1 · Cadrage" }],
    tasks: [
      { p: 0, t: "Migration V6R1 vers V7R5", a: 0, b: 0.9, s: "done" },
      { p: 1, t: "Cahier des charges définitif", a: 1, b: 2.4, s: "hach" },
    ],
  },
};

test("un planning enregistré est relisible par n'importe qui", async () => {
  const { id } = await reg.enregistrer(planBelmet, "nikko@armonie.group");
  const relu = await reg.lire(id);
  assert.equal(relu.client, "Belmet");
  assert.equal(relu.data.tasks.length, 2);
  assert.equal(relu.data.tasks[0].t, "Migration V6R1 vers V7R5");
  assert.equal(relu.majPar, "nikko@armonie.group", "on sait qui a modifié en dernier");
});

test("le même client et projet ne crée pas de doublon, il met à jour", async () => {
  const a = await reg.enregistrer(planBelmet, "a@x.fr");
  const b = await reg.enregistrer({ ...planBelmet, titre: "Belmet · ERP26 (v2)" }, "b@x.fr");
  assert.equal(a.id, b.id);
  const tout = await reg.liste();
  assert.equal(tout.filter((g) => g.id === a.id).length, 1);
});

test("client et projet sont obligatoires", async () => {
  await assert.rejects(() => reg.enregistrer({ projet: "X" }), /client/i);
  await assert.rejects(() => reg.enregistrer({ client: "X" }), /projet/i);
});

test("les données sont assainies : pas de tâche informe en base", async () => {
  const { id } = await reg.enregistrer({
    client: "Test", projet: "P",
    data: { phases: [{ name: "P1" }], tasks: [{ p: "x", t: 42, a: "abc", b: null }] },
  });
  const t = (await reg.lire(id)).data.tasks[0];
  assert.equal(t.p, 0, "un index de phase illisible retombe à 0");
  assert.equal(typeof t.t, "string");
  assert.equal(t.a, 0);
  assert.equal(t.b, 1, "une fin absente ou antérieure au début devient début + 1 mois");
  assert.ok(t.b > t.a, "jamais de barre de largeur nulle, sinon la tâche est invisible");
});

test("dupliquer reprend le contenu sous un autre client", async () => {
  const { id } = await reg.enregistrer(planBelmet);
  const { id: id2 } = await reg.dupliquer(id, "Bellion", "ERP27");
  assert.notEqual(id, id2);
  const copie = await reg.lire(id2);
  assert.equal(copie.client, "Bellion");
  assert.equal(copie.data.tasks.length, 2, "le contenu suit");
  // L'original ne bouge pas.
  assert.equal((await reg.lire(id)).client, "Belmet");
});

test("la liste donne de quoi afficher un index sans charger les contenus", async () => {
  const l = await reg.liste();
  assert.ok(l.length >= 2);
  const b = l.find((g) => g.client === "Belmet");
  assert.equal(b.taches, 2);
  assert.equal(b.phases, 2);
  assert.equal(b.data, undefined, "le contenu n'est pas transporté dans la liste");
});

test("suppression", async () => {
  const { id } = await reg.enregistrer({ client: "Ephemere", projet: "P" });
  await reg.supprimer(id);
  assert.equal(await reg.lire(id), null);
});
