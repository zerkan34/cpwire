// digest.test.js — le point du soir doit refléter Jira ET les engagements pris en séance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, digestText, digestHtml } from "../digest.js";
import { ARMONIE_PALETTE } from "../../shared/armonie-palette.js";

const engagements = [
  { nature: "action", clos: false, urgence: "retard", quoi: "Relancer Catherine sur la volumétrie", qui: "Nikko", client: "Belmet", joursRestants: -8 },
  { nature: "action", clos: false, urgence: "semaine", quoi: "Confirmer le périmètre WMS", qui: "Guy", client: "Belmet", joursRestants: 4 },
  { nature: "action", clos: true, urgence: "aucune", quoi: "Déjà fait", qui: "X", client: "EDL" },
  { nature: "decision", clos: false, urgence: "aucune", quoi: "Report de la bascule", client: "Belmet" },
];

test("les engagements ouverts entrent dans le digest, pas les clos ni les décisions", () => {
  const d = buildDigest({ engagements });
  assert.equal(d.engagements.ouverts, 2, "seules les actions ouvertes comptent");
  assert.equal(d.engagements.retard.length, 1);
  assert.equal(d.engagements.semaine.length, 1);
  assert.equal(d.engagements.retard[0].qui, "Nikko", "le porteur est conservé : c'est l'intérêt");
});

test("un digest sans rien du tout est marqué vide", () => {
  assert.equal(buildDigest({}).vide, true);
});

test("un digest qui n'a QUE des engagements en retard n'est pas vide", () => {
  const d = buildDigest({ engagements: [engagements[0]] });
  assert.equal(d.vide, false, "sinon le mail du soir ne partirait pas alors qu'il y a un retard");
});

test("la version texte cite les engagements en retard avec leur porteur", () => {
  const t = digestText(buildDigest({ engagements }));
  assert.match(t, /Engagements en retard : 1/);
  assert.match(t, /Relancer Catherine/);
  assert.match(t, /Nikko/);
});

test("la version HTML affiche la section et n'a plus de palette codée en dur", () => {
  const h = digestHtml(buildDigest({ engagements }));
  assert.match(h, /Engagements pris en séance/);
  assert.match(h, /Confirmer le périmètre WMS/);
  assert.ok(h.includes(ARMONIE_PALETTE.navy), "les teintes viennent de la palette partagée");
  assert.ok(!h.includes("#b23b46"), "l'ancien rouge divergent a disparu");
});

test("un digest sans engagements reste valide (rétrocompatibilité)", () => {
  const d = buildDigest({ recurrences: [] });
  assert.equal(d.engagements.ouverts, 0);
  assert.doesNotThrow(() => digestText(d));
  assert.doesNotThrow(() => digestHtml(d));
});
