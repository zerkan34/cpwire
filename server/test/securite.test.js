// securite.test.js — vérifie les correctifs de l'audit du 13/08/2026 :
// rôle invité soumis aux interdits, expiration des sessions dormantes, secret cron
// en en-tête seulement, sonde /api/health muette, rendu PDF réservé aux comptes en
// écriture. Chaque test correspond à un point du rapport d'audit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import os from "os"; import path from "path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cpw-verif-"));
process.env.AUTH_EMAIL = "nikko@test.fr";
process.env.AUTH_PASSWORD = "motdepasse-de-test-long";

const auth = await import("../auth-core.js");
const { app } = await import("../app.js");

const server = app.listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://localhost:${server.address().port}`;

test("le rôle invité est maintenant bloqué sur les routes interdites", async () => {
  const jeton = auth.makeGuestToken(Date.now() + 3600e3);
  const r = await fetch(`${base}/api/recap`, { headers: { "x-access-token": jeton } });
  assert.equal(r.status, 403, "un lien invité ne doit plus atteindre /api/recap");
});

test("le rôle invité garde l'accès aux routes normales", async () => {
  const jeton = auth.makeGuestToken(Date.now() + 3600e3);
  const r = await fetch(`${base}/api/dossiers`, { headers: { "x-access-token": jeton } });
  assert.notEqual(r.status, 403, "un invité doit toujours pouvoir lire les dossiers");
});

test("/api/reunion/ est couvert par l'interdit", async () => {
  const jeton = auth.makeGuestToken(Date.now() + 3600e3);
  const r = await fetch(`${base}/api/reunion/health`, { headers: { "x-access-token": jeton } });
  assert.equal(r.status, 403);
});

test("une session dormante est refusée et retirée", async () => {
  const t = "jeton-dormant";
  auth.sessions.set(t, { role: "consultation", email: "vieux@test.fr", lastSeen: Date.now() - 31 * 24 * 3600e3 });
  const r = await fetch(`${base}/api/dossiers`, { headers: { "x-access-token": t } });
  assert.equal(r.status, 401, "session inactive depuis 31 jours -> refusée");
  assert.equal(auth.sessions.has(t), false, "et retirée de la mémoire");
});

test("une session active reste valable", async () => {
  const t = "jeton-actif";
  auth.sessions.set(t, { role: "consultation", email: "actif@test.fr", lastSeen: Date.now() - 3600e3 });
  const r = await fetch(`${base}/api/dossiers`, { headers: { "x-access-token": t } });
  assert.notEqual(r.status, 401);
  assert.equal(auth.sessions.has(t), true);
});

test("purgeSessions retire les dormantes et garde les actives", () => {
  auth.sessions.clear();
  auth.sessions.set("v", { role: "consultation", email: "v@t.fr", lastSeen: Date.now() - 40 * 24 * 3600e3 });
  auth.sessions.set("n", { role: "consultation", email: "n@t.fr", lastSeen: Date.now() });
  assert.equal(auth.purgeSessions(), 1);
  assert.equal(auth.sessions.has("v"), false);
  assert.equal(auth.sessions.has("n"), true);
});

test("le secret cron n'est plus accepté en paramètre d'URL", async () => {
  process.env.CRON_SECRET = "secret-cron-de-test";
  const r = await fetch(`${base}/api/cron/digest?secret=secret-cron-de-test`, { method: "POST" });
  assert.equal(r.status, 401, "le paramètre d'URL ne doit plus authentifier");
});

test("/api/health public ne divulgue rien", async () => {
  const r = await fetch(`${base}/api/health`);
  const b = await r.json();
  assert.equal(b.dataDir, undefined);
  assert.equal(b.jiraConfigured, undefined);
});

test("/api/health/detail exige un compte", async () => {
  const r = await fetch(`${base}/api/health/detail`);
  assert.equal(r.status, 401);
});

test("le rendu PDF est refusé aux rôles en lecture seule", async () => {
  const jeton = auth.makeGuestToken(Date.now() + 3600e3);
  const r = await fetch(`${base}/api/pdf/render`, { method: "POST",
    headers: { "x-access-token": jeton, "Content-Type": "application/json" },
    body: JSON.stringify({ html: "<p>x</p>" }) });
  assert.equal(r.status, 403, "writeGuard doit bloquer");
});

test.after(() => server.close());
