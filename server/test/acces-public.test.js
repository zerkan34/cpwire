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

// --- Régression du 28/08/2026 --------------------------------------------
// Le cookie n'était posé qu'à la connexion. Les personnes DÉJÀ connectées au
// moment du déploiement se voyaient refuser ShareFly avec un
// « {"error":"Authentification requise."} » brut en pleine page.

test("une session existante récupère le cookie au premier appel d'API", async () => {
  const lg = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.AUTH_EMAIL, password: process.env.AUTH_PASSWORD }),
  });
  const jeton = (await lg.json()).token;

  // Appel d'API ordinaire, jeton en en-tête, sans cookie : c'est le cas de
  // quelqu'un dont l'onglet était déjà ouvert avant le déploiement.
  const r = await fetch(`${base}/api/sharefly/state`, { headers: { "x-access-token": jeton } });
  assert.equal(r.status, 200);
  const pose = (r.headers.get("set-cookie") || "").split(";")[0];
  assert.match(pose, /^cpw_tok=/, "le cookie doit être posé au passage");

  // Et ce cookie ouvre bien ShareFly, sans reconnexion.
  const sf = await fetch(`${base}/sharefly/`, { headers: { cookie: pose }, redirect: "manual" });
  assert.equal(sf.status, 200);
});

test("une navigation non authentifiée mène à la connexion, pas à du JSON brut", async () => {
  const r = await fetch(`${base}/sharefly/`, { headers: { accept: "text/html" }, redirect: "manual" });
  assert.equal(r.status, 302, "une page doit rediriger, pas renvoyer une erreur JSON");
  assert.match(r.headers.get("location") || "", /^\/\?retour=/, "l'adresse demandée est mémorisée");
});

test("un appel d'API non authentifié reste du JSON", async () => {
  // La redirection ne doit concerner que les navigations : un appel d'API qui
  // recevrait du HTML casserait le front sans message clair.
  const r = await fetch(`${base}/api/sharefly/state`);
  assert.equal(r.status, 401);
  assert.match(r.headers.get("content-type") || "", /application\/json/);
});

// --- Régression du 28/08/2026 (seconde) ----------------------------------
// Le router ShareFly est monté SANS chemin : il reçoit toutes les requêtes.
// Un router.use(guard) sans chemin protégeait donc aussi la racine « / », qui
// redirigeait vers « /?retour=/ », lui-même intercepté : ERR_TOO_MANY_REDIRECTS,
// application entièrement inaccessible.

test("la racine n'est JAMAIS redirigée : sinon l'application boucle", async () => {
  for (const url of ["/", "/?retour=%2Fsharefly%2F", "/index.html"]) {
    const r = await fetch(base + url, { headers: { accept: "text/html" }, redirect: "manual" });
    assert.notEqual(r.status, 302,
      `${url} ne doit pas rediriger : c'est la page de connexion elle-même`);
  }
});

test("la page de connexion reste atteignable sans compte", async () => {
  // Évidence à vérifier : si elle exigeait un compte, personne ne pourrait
  // jamais se connecter.
  const r = await fetch(base + "/", { headers: { accept: "text/html" }, redirect: "manual" });
  assert.ok(r.status === 200 || r.status === 404,
    "200 si le front est construit, 404 sinon — mais jamais 401 ni 302");
});
