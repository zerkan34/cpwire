// projections.test.js — le rythme de résorption doit être calculé sur l'historique
// réel, et rester null (pas de projection inventée) quand les données manquent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-proj-"));
process.env.DATA_DIR = dir;
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const mk = (done, reste) => ({
  miseEnProd: [], termine: Array.from({ length: done }, (_, i) => "T" + i),
  recetteClient: [], recetteArmonie: [], encours: Array.from({ length: reste }, (_, i) => "E" + i),
  retourTest: [], attenteClient: [],
});
fs.writeFileSync(path.join(dir, "point-history.json"), JSON.stringify({
  DIAPAR: { "": { [day(3)]: mk(10, 30), [day(2)]: mk(16, 24), [day(1)]: mk(22, 18), [day(0)]: mk(28, 12) } },
  NEUF: { "": { [day(0)]: mk(2, 8) } },
}));
const { buildProjections } = await import("../projections.js");
const P = buildProjections();
const by = Object.fromEntries((P.dossiers || []).map((d) => [d.dossier, d]));

test("rythme de résorption positif calculé sur l'historique", () => {
  assert.ok(by.DIAPAR, "DIAPAR présent");
  assert.ok(typeof by.DIAPAR.rythme === "number" && by.DIAPAR.rythme > 0, "rythme > 0");
});

test("zéro-invention : 1 seul point ⇒ pas de rythme projeté", () => {
  if (by.NEUF) assert.ok(by.NEUF.rythme == null, "rythme absent (null ou undefined)");
});
