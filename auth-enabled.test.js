// rate-limit.test.js — vérifie les seuils réels des limiteurs ajoutés, et l'absence
// de faux positif sur une route non concernée. AUTH_ENABLED=false ⇒ guard/writeGuard
// laissent passer sans jeton (rôle owner automatique), ce qui isole le test du flux
// d'authentification complet.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpwire-test-rl-"));

const { app } = await import("../app.js");

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test("learnLimiter bloque au 7e appel (max=6) avec le bon message", async () => {
  const codes = [];
  for (let i = 0; i < 7; i++) {
    const res = await fetch(`${base}/api/connaissance/learn`, { method: "POST" });
    codes.push(res.status);
    if (res.status === 429) {
      const body = await res.json();
      assert.match(body.error, /Apprentissage/);
      assert.equal(typeof body.retryAfter, "number");
    }
  }
  assert.equal(codes.filter((c) => c === 429).length, 1, "un seul 429, sur le 7e appel");
  assert.equal(codes[6], 429, "c'est bien le 7e appel qui est bloqué");
  assert.notEqual(codes[5], 429, "le 6e appel doit encore passer");
});

test("une route non limitée (/api/session) encaisse 10 appels sans 429", async () => {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${base}/api/session`);
    assert.notEqual(res.status, 429);
  }
});
