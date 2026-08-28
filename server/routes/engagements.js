// routes/engagements.js — registre des actions et décisions.
// Monté dans app.js : app.use(engagementsRouter({ guard, writeGuard }))

import express from "express";
import * as reg from "../engagements.js";

export function engagementsRouter({ guard, writeGuard } = {}) {
  const router = express.Router();
  const rien = (_q, _s, next) => next();
  const lire = guard || rien;
  const ecrire = writeGuard || rien;
  const corps = express.json({ limit: "2mb" });

  router.get("/api/engagements", lire, async (req, res) => {
    try {
      const f = {
        client: req.query.client, qui: req.query.qui, nature: req.query.nature,
        statut: req.query.statut,
        ouverts: req.query.ouverts === "1", enRetard: req.query.retard === "1",
      };
      res.json({
        engagements: await reg.liste(f),
        compteurs: await reg.compteurs(),
        stockage: await reg.statut(),
      });
    } catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.post("/api/engagements", lire, ecrire, corps, async (req, res) => {
    try { res.json(await reg.creer(req.body || {})); }
    catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.put("/api/engagements/:id", lire, ecrire, corps, async (req, res) => {
    try { res.json(await reg.modifier(req.params.id, req.body || {})); }
    catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  router.delete("/api/engagements/:id", lire, ecrire, async (req, res) => {
    try { await reg.supprimer(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  // Versement des actions et décisions d'un compte rendu de réunion.
  router.post("/api/engagements/depuis-cr", lire, ecrire, corps, async (req, res) => {
    try {
      const { cr, client, origine, reunionId } = req.body || {};
      if (!cr || typeof cr !== "object") return res.status(400).json({ error: "Compte rendu manquant." });
      res.json(await reg.importerDepuisCr(cr, { client, origine, reunionId }));
    } catch (e) { res.status(e.statut || 500).json({ error: e.message }); }
  });

  reg.initialiser().catch((e) => console.error("[engagements] init :", e.message));
  return router;
}
