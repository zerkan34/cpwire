// users.js — Comptes invités (rôle « consultation »). Mots de passe hachés (scrypt + sel).
//
// PERSISTANCE :
//   • Si la variable d'environnement DATABASE_URL est définie (base Neon gratuite) → les comptes
//     y sont stockés durablement : ils survivent aux déploiements ET aux mises en veille Render.
//   • Sinon → repli sur un fichier local (éphémère sur Render gratuit). Le code marche dans les deux cas.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { dataDir } from "./paths.js";

const norm = (e) => String(e || "").trim().toLowerCase();
const hashPw = (password, salt) => crypto.scryptSync(String(password), salt, 64).toString("hex");
function tsafe(aHex, bHex) {
  try { const a = Buffer.from(aHex, "hex"), b = Buffer.from(bHex, "hex"); return a.length === b.length && crypto.timingSafeEqual(a, b); }
  catch { return false; }
}
function validate(email, password) {
  const e = norm(email);
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Email invalide.");
  if (!password || String(password).length < 6) throw new Error("Mot de passe trop court (6 caractères minimum).");
  return e;
}

// ---- Backend Postgres (Neon) si DATABASE_URL, sinon fichier ----
const DB_URL = process.env.DATABASE_URL || "";
let pgPool = null, pgReady = null;
async function pg() {
  if (!DB_URL) return null;
  if (!pgPool) {
    const mod = await import("pg");                 // import dynamique : pg n'est chargé que si une base est configurée
    const { Pool } = mod.default || mod;
    pgPool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000 });
    pgReady = pgPool.query(`CREATE TABLE IF NOT EXISTS cpwire_users (
      email TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'consultation',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  }
  await pgReady;
  return pgPool;
}

// ---- Backend fichier (repli) ----
const FILE = path.join(dataDir(), "users.json");
function fread() {
  try { const d = JSON.parse(fs.readFileSync(FILE, "utf-8")); return Array.isArray(d.users) ? d.users : []; }
  catch { return []; }
}
function fwrite(users) {
  try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify({ users }, null, 2)); }
  catch (e) { console.error("[users] écriture impossible:", e.message); }
}

// ---- API publique (asynchrone) ----
export async function listUsers() {
  const pool = await pg();
  if (pool) {
    const r = await pool.query("SELECT email, role, created_at FROM cpwire_users ORDER BY created_at");
    return r.rows.map((x) => ({ email: x.email, role: x.role, createdAt: x.created_at }));
  }
  return fread().map((u) => ({ email: u.email, role: u.role, createdAt: u.createdAt }));
}

export async function findUser(email) {
  const e = norm(email);
  const pool = await pg();
  if (pool) { const r = await pool.query("SELECT * FROM cpwire_users WHERE email = $1", [e]); return r.rows[0] || null; }
  return fread().find((u) => u.email === e) || null;
}

export async function createUser(email, password, role = "consultation") {
  const e = validate(email, password);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPw(password, salt);
  const pool = await pg();
  if (pool) {
    try { await pool.query("INSERT INTO cpwire_users(email, salt, hash, role) VALUES($1,$2,$3,$4)", [e, salt, hash, role]); }
    catch (err) {
      if (/duplicate|unique/i.test(String(err.message))) throw new Error("Un compte existe déjà avec cet email. Connectez-vous.");
      throw err;
    }
    return { email: e, role };
  }
  const users = fread();
  if (users.some((u) => u.email === e)) throw new Error("Un compte existe déjà avec cet email. Connectez-vous.");
  users.push({ email: e, salt, hash, role, createdAt: new Date().toISOString() });
  fwrite(users);
  return { email: e, role };
}

export async function verifyUser(email, password) {
  const u = await findUser(email);
  if (!u) return null;
  if (!tsafe(hashPw(password, u.salt), u.hash)) return null;
  return { email: u.email, role: u.role };
}

export async function removeUser(email) {
  const e = norm(email);
  const pool = await pg();
  if (pool) { await pool.query("DELETE FROM cpwire_users WHERE email = $1", [e]); return true; }
  fwrite(fread().filter((u) => u.email !== e));
  return true;
}
