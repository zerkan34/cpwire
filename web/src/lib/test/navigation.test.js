// navigation.test.js — l'Atelier regroupé par moment de travail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILLES, familleDe, famillesVisibles, orphelins, premierDe, libelleDans } from "../navigation.js";

// Les onze sous-onglets réels de l'Atelier.
const TOUS = [
  { id: "morning", label: "Récap" }, { id: "charge", label: "Charge & capacité" },
  { id: "devs", label: "Développeurs" }, { id: "gantt", label: "GANTT" },
  { id: "planning", label: "Planning" }, { id: "cra", label: "CRA" },
  { id: "reunions", label: "Réunions" }, { id: "transcription", label: "Transcription" },
  { id: "engagements", label: "Engagements" }, { id: "reference", label: "Référence" },
  { id: "hygiene", label: "Qualité" },
];

test("les onze écrans sont tous rattachés : aucun ne disparaît", () => {
  assert.deepEqual(orphelins(TOUS), [], "un écran orphelin serait injoignable");
  const couverts = FAMILLES.flatMap((f) => f.subs);
  assert.equal(new Set(couverts).size, couverts.length, "aucun écran rangé dans deux familles");
});

test("quatre familles au lieu de onze entrées", () => {
  const v = famillesVisibles(TOUS);
  assert.equal(v.length, 4);
  assert.deepEqual(v.map((f) => f.label),
    ["Mon quotidien", "Mes réunions", "Mon portefeuille", "Références"]);
});

test("le cycle d'une réunion est une séquence ordonnée", () => {
  const f = familleDe("transcription");
  assert.equal(f.id, "reunions");
  assert.equal(f.sequence, true);
  assert.deepEqual(f.subs, ["reunions", "transcription", "engagements"],
    "préparer, puis transcrire, puis suivre");
});

test("dans sa famille, chaque écran est nommé par son action", () => {
  assert.equal(libelleDans("reunions", { id: "reunions", label: "Réunions" }), "Préparer");
  assert.equal(libelleDans("reunions", { id: "engagements", label: "Engagements" }), "Suivre");
  // Ailleurs, le libellé d'origine est conservé.
  assert.equal(libelleDans("portefeuille", { id: "gantt", label: "GANTT" }), "GANTT");
});

test("une famille entièrement masquée par le rôle disparaît", () => {
  // Rôle consultation : ni récap, ni réunions, ni transcription, ni engagements, ni CRA.
  const masques = new Set(["morning", "reunions", "transcription", "engagements", "cra"]);
  const permis = TOUS.filter((s) => !masques.has(s.id));
  const v = famillesVisibles(permis);
  assert.equal(v.find((f) => f.id === "reunions"), undefined, "plus aucune réunion visible");
  assert.ok(v.find((f) => f.id === "quotidien"), "Qualité reste, donc la famille demeure");
  assert.deepEqual(v.find((f) => f.id === "quotidien").items.map((s) => s.id), ["hygiene"]);
});

test("cliquer une famille mène à son premier écran atteignable", () => {
  const v = famillesVisibles(TOUS);
  assert.equal(premierDe(v.find((f) => f.id === "reunions")), "reunions");
  const permis = TOUS.filter((s) => s.id !== "morning");
  assert.equal(premierDe(famillesVisibles(permis).find((f) => f.id === "quotidien")), "hygiene",
    "si le premier est masqué, on tombe sur le suivant, pas sur du vide");
});

test("un écran ajouté sans famille reste joignable", () => {
  const avecNouveau = [...TOUS, { id: "nouveau", label: "Nouveauté" }];
  assert.deepEqual(orphelins(avecNouveau).map((s) => s.id), ["nouveau"]);
});
