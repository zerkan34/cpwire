// sessions.test.js — reproduit en automatique la vérification manuelle faite plus tôt :
// une session créée par un vrai /api/login doit survivre à un redémarrage complet du
// process. On simule le redémarrage en vidant la Map en mémoire puis en rappelant
// initSessions() — exactement ce que fait index.js au boot réel.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpwire-test-sess-"));

const { app, sessions, initSessions } = await import("../app.js");

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test("une session créée via /api/login survit à un redémarrage simulé", async () => {
  const loginRes = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(loginRes.status, 200);
  const { token } = await loginRes.json();
  assert.ok(token, "un jeton a bien été émis");
  assert.equal(sessions.has(token), true, "la session existe en mémoire juste après le login");

  const before1 = await fetch(`${base}/api/session`, { headers: { "x-access-token": token } });
  assert.equal(before1.status, 200);

  sessions.clear();
  assert.equal(sessions.has(token), false, "la map mémoire est bien vidée");

  const restored = await initSessions();
  assert.equal(restored, true, "initSessions() rapporte une restauration réussie");
  assert.equal(sessions.has(token), true, "le jeton est de retour en mémoire après restauration");

  const after1 = await fetch(`${base}/api/session`, { headers: { "x-access-token": token } });
  assert.equal(after1.status, 200);
});

test("le fichier sessions.json existe bien sur disque après un login", async () => {
  const file = path.join(process.env.DATA_DIR, "sessions.json");
  assert.equal(fs.existsSync(file), true);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.ok(Array.isArray(raw) && raw.length > 0, "le fichier contient au moins une session");
});
