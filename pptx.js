// admin.test.js — routes d'invitation et d'administration des comptes. AUTH_ENABLED=false
// ⇒ guard/adminGuard/writeGuard laissent passer sans jeton (rôle owner automatique) :
// isole ce fichier du flux d'authentification complet (déjà couvert par auth-enabled.test.js).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpwire-test-admin-"));

const { app } = await import("../app.js");

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test("POST /api/ping répond ok", async () => {
  const res = await fetch(`${base}/api/ping`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("POST /api/invite génère un jeton invité borné à 30 jours max", async () => {
  const res = await fetch(`${base}/api/invite`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: 999999 }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.hours, 720); // plafonné à 30 jours (720h)
  assert.ok(body.token.startsWith("g."));
});

test("POST /api/admin/invite (rôle admin, indéfini) puis usage réel du lien", async () => {
  const inv = await fetch(`${base}/api/admin/invite`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", indefinite: true }),
  });
  assert.equal(inv.status, 200);
  const { token: inviteToken, role } = await inv.json();
  assert.equal(role, "admin");

  // Le lien est utilisé pour créer un compte réel (compte NON confirmé tant que non validé).
  const claim = await fetch(`${base}/api/account/claim`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: inviteToken, email: "nouveau@armonie.local", password: "motdepasse1234" }),
  });
  assert.equal(claim.status, 200);
  const claimBody = await claim.json();
  assert.equal(claimBody.pending, true);

  // Il apparaît dans la liste admin, non confirmé.
  const list = await fetch(`${base}/api/admin/users`);
  const { users } = await list.json();
  const u = users.find((x) => x.email === "nouveau@armonie.local");
  assert.ok(u, "le compte créé apparaît dans la liste");
  assert.equal(u.confirmed, false);

  // Validation manuelle par un admin (chemin de secours si l'e-mail n'est pas configuré).
  const confirm = await fetch(`${base}/api/admin/users/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nouveau@armonie.local" }),
  });
  assert.equal(confirm.status, 200);
  assert.equal((await confirm.json()).ok, true);
});

test("un jeton d'invitation invalide est rejeté par /api/account/claim", async () => {
  const res = await fetch(`${base}/api/account/claim`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "i.9999999999999.consultation.signature-fausse", email: "x@y.local", password: "motdepasse1234" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/account/confirm avec un jeton invalide affiche la page d'échec (HTML, pas de crash)", async () => {
  const res = await fetch(`${base}/api/account/confirm?token=invalide`);
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.match(text, /invalide ou expiré/i);
});

test("POST /api/admin/users/remove supprime un compte et coupe ses sessions", async () => {
  // Crée puis supprime, vérifie sa disparition de la liste.
  const inv = await fetch(`${base}/api/admin/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 1 }) });
  const { token: inviteToken } = await inv.json();
  await fetch(`${base}/api/account/claim`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: inviteToken, email: "aeffacer@armonie.local", password: "motdepasse1234" }),
  });
  const remove = await fetch(`${base}/api/admin/users/remove`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "aeffacer@armonie.local" }),
  });
  assert.equal(remove.status, 200);
  const list = await fetch(`${base}/api/admin/users`);
  const { users } = await list.json();
  assert.ok(!users.some((u) => u.email === "aeffacer@armonie.local"), "le compte a bien disparu");
});
