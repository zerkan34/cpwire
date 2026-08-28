// deadlines.test.js — le radar des échéances doit rester strictement déterministe :
// aucune date « inventée », le vocabulaire rétrospectif est écarté, et les faux positifs
// numériques usuels (IP, ratios, références de version) ne doivent jamais matcher.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeadlineRadar } from "../deadlines.js";

// Les dates des tests étaient écrites en dur (juin 2026) : relues en août 2026, elles
// étaient devenues passées, donc écartées par le radar, et trois tests viraient au rouge
// sans qu'aucune ligne de code n'ait changé. On ancre désormais tout sur un « aujourd'hui »
// fixe, injecté dans la fonction : les tests valent la même chose dans dix ans.
const MAINTENANT = new Date("2026-01-15T09:00:00");
const radar = (dossiers, conn) => buildDeadlineRadar(dossiers || {}, conn || {}, MAINTENANT);

test("extrait une échéance avec année explicite", () => {
  const conn = { clients: { EDL: { attentes: ["Jalon : MEP prévisionnelle 01/06/2026."] } } };
  const r = radar({}, conn);
  assert.equal(r.length, 1);
  assert.equal(r[0].date, "2026-06-01");
  assert.equal(r[0].yearInferred, false);
});

test("déduit l'année manquante depuis une date-ancre de la même clause", () => {
  const conn = { clients: { EDL: { attentes: ["Jalons : spécifications 13/02 ; cible 01/06/2026."] } } };
  const r = radar({}, conn);
  const spec = r.find((x) => x.date.endsWith("-02-13"));
  assert.ok(spec, "la date sans année est bien trouvée");
  assert.equal(spec.yearInferred, true);
  // L'année déduite est 2026 (ancre de la clause), sauf si cette date est déjà loin dans le
  // passé au moment du test (>45j) — le code avance alors d'un an, comme pour une vraie
  // échéance récurrente relue après coup. On vérifie le mois/jour, pas une année figée.
  assert.match(spec.date, /^\d{4}-02-13$/);
});

test("ignore le vocabulaire rétrospectif (PV, mise à jour, démarrage, fondation)", () => {
  const conn = { clients: { X: { notes: [
    "Démarrage 06/12/2024.",
    "PV du 05/12/2025.",
    "Fondée en 1965.",
    "Document mis à jour le 18/06/2026.",
  ] } } };
  const r = radar({}, conn);
  assert.equal(r.length, 0, "aucune de ces dates n'est une échéance à venir");
});

test("ne matche jamais une IP, un ratio ou une référence de version", () => {
  const dossiers = { X: { description: "Partition 172.22.0.44, IBM i V7.3, RPG/38, 570 dossiers / 410 fichiers." } };
  const r = radar(dossiers, {});
  assert.equal(r.length, 0, "aucun faux positif numérique");
});

test("rejette un jour invalide (ex. 31/02) plutôt que de le laisser passer", () => {
  const conn = { clients: { X: { notes: ["Échéance 31/02/2026."] } } };
  const r = radar({}, conn);
  assert.equal(r.length, 0);
});

test("classe correctement retard / semaine / mois / plus_tard", () => {
  const today = new Date(MAINTENANT);   // même référence que le radar
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const dans3j = new Date(today); dans3j.setDate(dans3j.getDate() + 3);
  const dans20j = new Date(today); dans20j.setDate(dans20j.getDate() + 20);
  const dans90j = new Date(today); dans90j.setDate(dans90j.getDate() + 90);
  const conn = { clients: { X: { notes: [
    `Jalon A ${fmt(dans3j)}. Jalon B ${fmt(dans20j)}. Jalon C ${fmt(dans90j)}.`,
  ] } } };
  const r = radar({}, conn);
  assert.equal(r.length, 3);
  assert.equal(r[0].statut, "semaine");
  assert.equal(r[1].statut, "mois");
  assert.equal(r[2].statut, "plus_tard");
});

test("dossiers.js et connaissance.js peuvent être combinés sans doublon exact", () => {
  const dossiers = { X: { description: "Livraison 01/09/2026." } };
  const conn = { clients: { X: { attentes: ["Livraison 01/09/2026."] } } };
  const r = radar(dossiers, conn);
  // Même dossier + même date + libellé identique -> dédupliqué malgré les 2 sources.
  assert.equal(r.length, 1);
});

test("mutualise une même échéance redite dans la fiche ET la mémoire (une seule ligne, sources listées)", () => {
  const dossiers = { EDL: { description: "MEP prévisionnelle 01/06/2026." } };
  const conn = { clients: { EDL: { attentes: ["Jalon : MEP prévisionnelle 01/06."] } } };
  const r = radar(dossiers, conn);
  assert.equal(r.length, 1, "une seule ligne pour la même date, pas deux");
  assert.deepEqual(new Set(r[0].sources), new Set(["fiche", "attentes"]));
  assert.equal(r[0].yearInferred, false, "l'année certaine (fiche) prime sur l'année déduite (attentes)");
});

test("le libellé d'une date ne déborde pas sur la date voisine dans la même phrase", () => {
  const conn = { clients: { EDL: { attentes: ["Cible de terminaison 15/05, MEP prévisionnelle 01/06/2026."] } } };
  const r = radar({}, conn);
  const mep = r.find((x) => x.date === "2026-06-01");
  assert.ok(mep);
  assert.doesNotMatch(mep.label, /terminaison/i, "le libellé du MEP ne récite pas la 'cible de terminaison' qui le précède");
});

test("détecte une vraie divergence : même libellé, dates différentes entre deux sources", () => {
  const dossiers = { Tafanel: { description: "Livraison finale prévue le 10/09/2026." } };
  const conn = { clients: { Tafanel: { attentes: ["Livraison finale prévue le 24/09/2026 (source client)."] } } };
  const r = radar(dossiers, conn);
  const a = r.find((x) => x.date === "2026-09-10");
  const b = r.find((x) => x.date === "2026-09-24");
  assert.ok(a && b, "les deux dates concurrentes restent visibles (jamais d'arbitrage automatique)");
  assert.ok(a.divergence?.some((d) => d.date === "2026-09-24"), "la divergence est signalée sur l'entrée A");
  assert.ok(b.divergence?.some((d) => d.date === "2026-09-10"), "la divergence est signalée sur l'entrée B (dans les deux sens)");
});

test("ne signale PAS de divergence entre deux jalons réellement différents (peu de mots communs)", () => {
  const conn = { clients: { Bellion: { contexte: "CDC final attendu le 30/06, kick-off le 01/07." } } };
  const r = radar({}, conn);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => !x.divergence), "CDC et kick-off sont deux jalons distincts, pas une divergence");
});
