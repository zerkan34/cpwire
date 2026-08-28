// commun.test.js — le socle partagé est testé, parce que toute l'app en dépend.
import { test } from "node:test"; import assert from "node:assert/strict";
const m = await import("../commun.js");
test("cle() rapproche accents et casse", () => {
  assert.equal(m.cle(" Bellion "), m.cle("bellion"));
  assert.equal(m.cle("École des Loisirs"), "ecole des loisirs");
  assert.equal(m.memeEntite("SEGUREL", " segurel "), true);
});
test("libelle() n'écrase que les espaces", () => {
  assert.equal(m.libelle("  Belmet "), "Belmet");
  assert.equal(m.libelle(null), "");
});
test("frDateCourte() gère ISO court, ISO long et invalide", () => {
  assert.equal(m.frDateCourte("2026-08-13"), "13/08/2026");
  assert.equal(m.frDateCourte(""), "");
  assert.equal(m.frDateCourte("pas-une-date"), "");
});
test("daysSince() compte les jours calendaires", () => {
  const hier = new Date(Date.now() - 86400000).toISOString();
  assert.equal(m.daysSince(hier), 1);
  assert.equal(m.daysSince(null), null);
});
test("joursOuvres() exclut samedi et dimanche", () => {
  // du vendredi 7 au lundi 10 août 2026 = 1 jour ouvré
  assert.equal(m.joursOuvres("2026-08-07", new Date("2026-08-10T12:00:00")), 1);
  // du lundi 10 au vendredi 14 = 4 jours ouvrés
  assert.equal(m.joursOuvres("2026-08-10", new Date("2026-08-14T12:00:00")), 4);
  assert.equal(m.joursOuvres("2026-08-10", new Date("2026-08-10T12:00:00")), 0);
});
test("nf() formate et encaisse le non-numérique", () => {
  assert.equal(m.nf(4800).replace(/\u202f|\u00a0| /g, ""), "4800");
  assert.equal(m.nf("x"), "—");
});
