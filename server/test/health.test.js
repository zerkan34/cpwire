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

test("GET /api/health est minimal et ne divulgue aucune configuration", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.app, "CPwire");
  // La sonde publique ne doit rien révéler de plus : ni le chemin de données,
  // ni les intégrations branchées (reconnaissance offerte à un attaquant).
  assert.equal(body.dataDir, undefined);
  assert.equal(body.jiraConfigured, undefined);
  assert.equal(body.persistent, undefined);
});

test("GET /api/health/detail renvoie la configuration complète", async () => {
  // Ici AUTH_ENABLED vaut false (pas de .env en test) : guard laisse passer en owner.
  const res = await fetch(`${base}/api/health/detail`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
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

// Ce test n'a de sens QUE si le front a été construit : le repli SPA sert web/dist/index.html,
// que app.js ne monte pas si le dossier n'existe pas. Sans cette garde, le test échouait
// systématiquement chez qui lance `npm test` sans avoir fait `npm run build` avant, ce qui
// use la confiance dans la suite (« il y a toujours un rouge, on ne regarde plus »).
const DIST = path.join(process.cwd(), "..", "web", "dist", "index.html");
test("une route front inconnue continue de servir l'app (SPA fallback)", { skip: !fs.existsSync(DIST) && "front non construit (web/dist absent) : lance npm run build dans web/" }, async () => {
  const res = await fetch(`${base}/peu-importe-le-chemin`, { redirect: "manual" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
});

test("les en-têtes de sécurité de base sont présents", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
});

test("sans AUTH configurée, /api/session renvoie le rôle owner sans jeton", async () => {
  const res = await fetch(`${base}/api/session`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.role, "owner");
});
