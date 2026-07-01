// auth-enabled.test.js — cette fois AUTH_EMAIL/AUTH_PASSWORD sont définies avant l'import
// dynamique d'app.js, donc AUTH_ENABLED=true pour tout ce fichier (isolé dans son propre
// process par le test runner). Couvre le vrai chemin "compte invité" que le badge de
// statut système et la persistance des sessions protègent.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpwire-test-authon-"));
process.env.AUTH_EMAIL = "owner@armonie.local";
process.env.AUTH_PASSWORD = "ownerpassword123";

const { app } = await import("../app.js");
const { createUser, setUserConfirmed } = await import("../users.js");

let server, base;
before(async () => {
  await createUser("collegue@armonie.local", "motdepasse1234", "consultation", false);
  await setUserConfirmed("collegue@armonie.local");
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test("mauvais identifiants owner -> 401", async () => {
  const res = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@armonie.local", password: "mauvais" }),
  });
  assert.equal(res.status, 401);
});

test("bons identifiants owner -> jeton + rôle owner", async () => {
  const res = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@armonie.local", password: "ownerpassword123" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.role, "owner");
  assert.ok(body.token);
});

test("compte invité confirmé -> connexion en rôle consultation", async () => {
  const res = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "collegue@armonie.local", password: "motdepasse1234" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.role, "consultation");
  assert.ok(body.token);

  // Le jeton obtenu authentifie réellement les appels suivants.
  const check = await fetch(`${base}/api/session`, { headers: { "x-access-token": body.token } });
  assert.equal(check.status, 200);
  const checkBody = await check.json();
  assert.equal(checkBody.me, "collegue@armonie.local");
});

test("un jeton inventé est rejeté par le verrou d'authentification (guard)", async () => {
  const res = await fetch(`${base}/api/connaissance`, {
    method: "PUT", headers: { "x-access-token": "totalement-invente", "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(res.status, 401);
});

test("un consultant ne peut pas accéder aux routes interdites (verrou global)", async () => {
  const loginRes = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "collegue@armonie.local", password: "motdepasse1234" }),
  });
  const { token } = await loginRes.json();
  const res = await fetch(`${base}/api/cr/global`, { method: "POST", headers: { "x-access-token": token, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(res.status, 403);
});
