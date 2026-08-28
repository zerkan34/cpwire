// routes/gantts.js — plannings GANTT partagés.
// Monté dans app.js : app.use(ganttsRouter({ guard, writeGuard }))

import express from "express";
import * as reg from "../gantts.js";

export function ganttsRouter({ guard, writeGuard } = {}) {
  const router = express.Router();
  const rien = (_q, _s, next) => next();
  const lire = guard || rien;
  const ecrire = writeGuard || rien;
  // Un planning chargé peut peser : phases, tâches, jalons.
  const corps = express.json({ limit: "4mb" });

  router.get("/api/gantts", lire, async (_req, res) => {
    try { res.json({ gantts: await reg.liste(), stockage: await reg.statut() }); }
    catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.get("/api/gantts/:id", lire, async (req, res) => {
    try {
      const g = await reg.lire(req.params.id);
      if (!g) return res.status(404).json({ error: "Planning introuvable." });
      res.json({ planning: g });
    } catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.post("/api/gantts", lire, ecrire, corps, async (req, res) => {
    try { res.json(await reg.enregistrer(req.body || {}, req.userEmail || "")); }
    catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.post("/api/gantts/:id/dupliquer", lire, ecrire, corps, async (req, res) => {
    try {
      const { client, projet } = req.body || {};
      res.json(await reg.dupliquer(req.params.id, client, projet, req.userEmail || ""));
    } catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.delete("/api/gantts/:id", lire, ecrire, async (req, res) => {
    try { await reg.supprimer(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  reg.initialiser().catch((e) => console.error("[gantts] init :", e.message));
  return router;
}
