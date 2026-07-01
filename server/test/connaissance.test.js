// connaissance.test.js — l'historique des versions apprises (jamais d'écrasement
// silencieux) et la route qui permet d'oublier une source explicitement.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpwire-test-connaissance-"));

const { app } = await import("../app.js");
const { learnFromImport, knowledgeForPrompt } = await import("../connaissance.js");

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test("un ré-import de la même source garde l'ancienne version en historique", () => {
  learnFromImport("EDL", "import:test", "Version 1 — 10 tickets.");
  learnFromImport("EDL", "import:test", "Version 2 — 20 tickets.");
  const prompt = knowledgeForPrompt("EDL");
  assert.match(prompt, /20 tickets/, "la version courante nourrit le prompt IA");
  assert.doesNotMatch(prompt, /10 tickets/, "l'historique ne pollue pas le prompt IA");
});

test("POST /api/connaissance/appris/remove oublie une source apprise", async () => {
  learnFromImport("Tafanel", "import:atester", "Contenu à oublier.");
  let res = await fetch(`${base}/api/connaissance`);
  let k = await res.json();
  assert.ok(k.clients.Tafanel.appris.some((e) => e.source === "import:atester"));

  const rm = await fetch(`${base}/api/connaissance/appris/remove`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dossier: "Tafanel", source: "import:atester" }),
  });
  assert.equal(rm.status, 200);
  assert.equal((await rm.json()).ok, true);

  res = await fetch(`${base}/api/connaissance`);
  k = await res.json();
  assert.ok(!(k.clients.Tafanel.appris || []).some((e) => e.source === "import:atester"), "la source a bien disparu");
});

test("POST /api/connaissance/appris/remove sans dossier/source -> 400", async () => {
  const res = await fetch(`${base}/api/connaissance/appris/remove`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});
