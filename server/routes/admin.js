// routes/admin.js — gestion des comptes invités (owner/admin uniquement) : génération
// de liens d'invitation à rôle, liste + présence, révocation, validation manuelle.
import express from "express";
import { listUsers, removeUser, setUserConfirmed } from "../users.js";
import { guard, adminGuard, sessions, saveSessions, makeInviteToken } from "../auth-core.js";

export const adminRouter = express.Router();

// Génère un lien d'invitation à copier. La personne l'ouvre et crée son email + mot de passe.
// Durée : soit `hours`, soit `days`, soit `indefinite` (validité ~1000 ans). Rôle : "consultation"
// (lecture seule, par défaut) ou "admin" (droits complets, comme l'owner).
adminRouter.post("/admin/invite", guard, adminGuard, (req, res) => {
  const b = req.body || {};
  const role = b.role === "admin" ? "admin" : "consultation";
  let expMs, scope;
  if (b.indefinite) {
    expMs = Date.now() + 1000 * 365 * 86400000; // ~1000 ans = pratiquement « indéfiniment »
    scope = { indefinite: true };
  } else if (Number.isFinite(Number(b.hours))) {
    const hours = Math.min(Math.max(Number(b.hours), 1), 8760); // 1 h … 1 an
    expMs = Date.now() + hours * 3600 * 1000;
    scope = { hours };
  } else {
    const days = Math.min(Math.max(Number.isFinite(Number(b.days)) ? Number(b.days) : 14, 1), 365); // 1 … 365 j
    expMs = Date.now() + days * 86400000;
    scope = { days };
  }
  res.json({ token: makeInviteToken(expMs, role), expiresAt: new Date(expMs).toISOString(), role, ...scope });
});

// Liste des comptes + présence (qui est en ligne / vu pour la dernière fois). Silencieux côté invité.
adminRouter.get("/admin/users", guard, adminGuard, async (_req, res) => {
  const now = Date.now();
  const seen = {};
  for (const s of sessions.values()) {
    if (s.email && (!seen[s.email] || s.lastSeen > seen[s.email])) seen[s.email] = s.lastSeen;
  }
  try {
    const list = await listUsers();
    const users = list.map((u) => ({
      ...u,
      lastSeen: seen[u.email] || null,
      online: seen[u.email] ? now - seen[u.email] < 75000 : false,
    }));
    res.json({ users });
  } catch (e) {
    console.error("[GET /api/admin/users]", e && e.message ? e.message : e); res.status(502).json({ error: "Base de comptes indisponible : " + String(e.message || e) }); }
});

// Révoque un compte invité (et coupe ses sessions en cours).
adminRouter.post("/admin/users/remove", guard, adminGuard, async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  try { await removeUser(email); } catch (e) {
    console.error("[POST /api/admin/users/remove]", e && e.message ? e.message : e); return res.status(502).json({ error: String(e.message || e) }); }
  for (const [t, s] of sessions) if (s.email === email) sessions.delete(t);
  saveSessions();
  res.json({ ok: true });
});

// Validation manuelle d'un compte en attente (si l'e-mail n'est pas configuré, ou pour débloquer).
adminRouter.post("/admin/users/confirm", guard, adminGuard, async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  try { const ok = await setUserConfirmed(email); res.json({ ok }); }
  catch (e) {
    console.error("[POST /api/admin/users/confirm]", e && e.message ? e.message : e); res.status(502).json({ error: String(e.message || e) }); }
});

// ---------------------------------------------------------------------------
// Export complet des données, en une archive ZIP.
//
// Réservé aux administrateurs : l'archive contient des comptes rendus de
// réunion, des noms de personnes et des données client. Elle n'inclut en
// revanche aucun secret ni aucun mot de passe, même haché (voir export.js).
//
// L'archive est construite en mémoire puis envoyée : sur les volumes en jeu
// (quelques mégaoctets), c'est plus simple et plus sûr qu'un fichier temporaire
// qu'il faudrait penser à nettoyer.
adminRouter.get("/admin/export", guard, adminGuard, async (req, res) => {
  try {
    const { construireExport } = await import("../export.js");
    const { buffer, nom, resume } = await construireExport({ demandePar: req.userEmail || "" });
    console.log(`[export] ${nom} · ${(buffer.length / 1024).toFixed(0)} Ko · ${resume.fichiers.length} fichiers · demandé par ${req.userEmail || "?"}`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${nom}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "no-store");   // une sauvegarde ne se met pas en cache
    res.end(buffer);
  } catch (e) {
    console.error("[GET /api/admin/export]", e && e.message ? e.message : e);
    res.status(500).json({ error: "Export impossible : " + (e.message || e) });
  }
});

// Aperçu de ce que contiendrait l'export, sans le produire : de quoi afficher
// un récapitulatif avant de lancer un téléchargement de plusieurs mégaoctets.
adminRouter.get("/admin/export/apercu", guard, adminGuard, async (req, res) => {
  try {
    const { construireExport } = await import("../export.js");
    const { buffer, resume } = await construireExport({ demandePar: req.userEmail || "" });
    res.json({ octets: buffer.length, contenu: resume.contenu, fichiers: resume.fichiers.length,
               absents: resume.absents, nonExporte: resume.nonExporte, persistance: resume.persistance });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
