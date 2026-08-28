// acces-public.test.js — aucune surface ne doit être atteignable sans compte.
//
// Contexte : l'audit de départ (13/08/2026) a trouvé que le router ShareFly n'avait
// AUCUN garde, et que /flux était servi en statique sans authentification. Étaient
// donc publics : le catalogue des 14 333 documents (propositions commerciales,
// chiffrages, RH), la redirection vers le contenu réel des fichiers SharePoint, et
// les livrables client Belmet. Ces tests existent pour que ça ne se reproduise pas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-acces-"));
process.env.AUTH_EMAIL = "test@armonie.group";
process.env.AUTH_PASSWORD = "motdepasse-de-test-long";

const { app } = await import("../app.js");
let server, base, cookie;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
  const r = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.AUTH_EMAIL, password: process.env.AUTH_PASSWORD }),
  });
  cookie = (r.headers.get("set-cookie") || "").split(";")[0];
});
after(() => server && server.close());

const PROTEGEES = [
  "/sharefly/",
  "/api/sharefly/catalogue",
  "/api/sharefly/state",
  "/api/sharefly/spfile?name=quelconque.pdf",
  "/flux/",
];

for (const url of PROTEGEES) {
  test(`sans compte, ${url} est refusé`, async () => {
    const r = await fetch(base + url, { redirect: "manual" });
    assert.equal(r.status, 401, `${url} ne doit PAS être public`);
  });
}

test("le catalogue ShareFly n'est pas divulgué sans compte", async () => {
  const r = await fetch(`${base}/api/sharefly/catalogue`);
  const txt = await r.text();
  assert.equal(r.status, 401);
  assert.ok(!/\.docx|\.pptx|proposition/i.test(txt), "aucun nom de document ne doit fuiter");
});

test("une fois connecté, ShareFly reste accessible en navigation pleine page", async () => {
  // Le cas réel : le navigateur ouvre /sharefly/ directement, sans en-tête
  // personnalisé. C'est le cookie de session qui doit prendre le relais.
  for (const url of ["/sharefly/", "/flux/"]) {
    const r = await fetch(base + url, { headers: { cookie }, redirect: "manual" });
    assert.equal(r.status, 200, `${url} doit rester accessible une fois connecté`);
  }
});

test("le cookie de session est httpOnly et SameSite=Strict", async () => {
  const r = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.AUTH_EMAIL, password: process.env.AUTH_PASSWORD }),
  });
  const sc = r.headers.get("set-cookie") || "";
  assert.match(sc, /HttpOnly/i, "inaccessible au JavaScript");
  assert.match(sc, /SameSite=Strict/i, "jamais envoyé depuis un autre site : pas de CSRF");
});
