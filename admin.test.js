// health.test.js — sanité de base de l'app (AUTH_ENABLED=false, comme en dev sans .env).
// Chaque fichier de test tourne dans son propre process Node (comportement par défaut
// de `node --test` sur un dossier), donc les variables d'environnement définies ici
// n'affectent aucun autre fichier de test.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpwire-test-health-"));

const { app } = await import("../app.js");

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test("GET /api/health renvoie la forme attendue", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.app, "CPwire");
  assert.equal(typeof body.persistent, "boolean");
  assert.equal(typeof body.dataDir, "string");
});

test("une route /api/ inconnue renvoie du JSON 404, pas du HTML", async () => {
  const res = await fetch(`${base}/api/ceci-nexiste-pas`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  const body = await res.json();
  assert.match(body.error, /Route inconnue/);
});

test("une route front inconnue continue de servir l'app (SPA fallback)", async () => {
  const res = await fetch(`${base}/peu-importe-le-chemin`, { redirect: "manual" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
});

test("les en-têtes de sécurité de base sont présents", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
});

test("sans AUTH configurée, /api/session renvoie le rôle owner sans jeton", async () => {
  const res = await fetch(`${base}/api/session`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.role, "owner");
});
