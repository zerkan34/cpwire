// engagements.test.js — registre des actions et décisions.
// Le « maintenant » est injecté partout : ces tests ne pourriront pas avec le calendrier
// (leçon tirée du radar d'échéances, dont trois tests étaient devenus rouges tout seuls).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-eng-"));
const reg = await import("../engagements.js");

const LE_15_JANVIER = new Date("2026-01-15T09:00:00");

test("une action sans échéance est signalée, jamais datée d'office", () => {
  const e = reg.enrichir({ nature: "action", statut: "a_faire", quoi: "x" }, LE_15_JANVIER);
  assert.equal(e.echeance, undefined);
  assert.equal(e.joursRestants, null);
  assert.equal(e.urgence, "sans_echeance");
});

test("le classement d'urgence suit l'échéance", () => {
  const u = (d) => reg.enrichir({ nature: "action", statut: "a_faire", quoi: "x", echeance: d }, LE_15_JANVIER).urgence;
  assert.equal(u("2026-01-10"), "retard");
  assert.equal(u("2026-01-16"), "imminent");
  assert.equal(u("2026-01-20"), "semaine");
  assert.equal(u("2026-03-01"), "plus_tard");
});

test("une décision ne passe jamais en retard : elle se rappelle, elle ne s'exécute pas", () => {
  const e = reg.enrichir({ nature: "decision", statut: "a_faire", quoi: "report MEP", echeance: "2026-01-01" }, LE_15_JANVIER);
  assert.equal(e.urgence, "aucune");
});

test("une action close n'est plus en retard", () => {
  const e = reg.enrichir({ nature: "action", statut: "fait", quoi: "x", echeance: "2026-01-01" }, LE_15_JANVIER);
  assert.equal(e.clos, true);
  assert.equal(e.urgence, "aucune");
});

test("création, modification tracée, suppression", async () => {
  const { engagement } = await reg.creer({ quoi: "Relancer Catherine sur la volumétrie", qui: "Nikko", client: "Belmet", echeance: "2026-02-02" });
  assert.ok(engagement.id);
  assert.equal(engagement.statut, "a_faire");
  const { engagement: maj } = await reg.modifier(engagement.id, { statut: "fait" });
  assert.equal(maj.statut, "fait");
  assert.ok(maj.historique.some((h) => /statut/.test(h.quoi)), "le changement de statut est tracé");
  await reg.supprimer(engagement.id);
  assert.equal((await reg.liste()).find((e) => e.id === engagement.id), undefined);
});

test("l'intitulé est obligatoire, l'échéance doit être une vraie date", async () => {
  await assert.rejects(() => reg.creer({ quoi: "   " }), /obligatoire/);
  await assert.rejects(() => reg.creer({ quoi: "x", echeance: "avant vendredi" }), /AAAA-MM-JJ/);
});

test("import depuis un CR : « avant vendredi » ne devient PAS une date inventée", async () => {
  const cr = {
    actions: [
      { quoi: "Envoyer le modèle de données", qui: "Frédéric", quand: "2026-02-10" },
      { quoi: "Confirmer le périmètre WMS", qui: "", quand: "avant vendredi" },
    ],
    decisions: ["Report de la bascule à septembre 2027"],
  };
  const r = await reg.importerDepuisCr(cr, { client: "Belmet", reunionId: "reu_1", origine: "COPROJ" });
  assert.equal(r.ajoutes, 3);
  const tout = await reg.liste({ client: "Belmet" });
  const flou = tout.find((e) => /périmètre WMS/.test(e.quoi));
  assert.equal(flou.echeance, "", "aucune date inventée");
  assert.equal(flou.note, "avant vendredi", "le texte d'origine est conservé tel quel");
  const nette = tout.find((e) => /modèle de données/.test(e.quoi));
  assert.equal(nette.echeance, "2026-02-10");
  assert.equal(tout.find((e) => /septembre 2027/.test(e.quoi)).nature, "decision");
});

test("réimporter le même CR ne duplique rien", async () => {
  const cr = { actions: [{ quoi: "Action unique", qui: "Nikko", quand: "" }], decisions: [] };
  const ctx = { client: "IMA", reunionId: "reu_9" };
  const a = await reg.importerDepuisCr(cr, ctx);
  const b = await reg.importerDepuisCr(cr, ctx);
  assert.equal(a.ajoutes, 1);
  assert.equal(b.ajoutes, 0, "deuxième import : rien de nouveau");
});

test("le tri met le retard en tête et le sans-échéance en fin", async () => {
  await reg.creer({ quoi: "Tardif", client: "Z", echeance: "2020-01-01" });
  await reg.creer({ quoi: "Flottant", client: "Z" });
  await reg.creer({ quoi: "Bientôt", client: "Z", echeance: "2099-01-01" });
  const l = await reg.liste({ client: "Z" });
  assert.equal(l[0].quoi, "Tardif");
  assert.equal(l[l.length - 1].quoi, "Flottant");
});

test("les compteurs distinguent ouverts, retard et décisions", async () => {
  const c = await reg.compteurs();
  assert.equal(typeof c.ouverts, "number");
  assert.ok(c.decisions >= 1);
  assert.ok(c.total >= c.ouverts);
});
