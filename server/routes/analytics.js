// routes/analytics.js — routes de lecture analytiques extraites d'app.js (v347)
// pour alléger le monolithe. Chemins et comportements STRICTEMENT identiques.
// Fabrique : reçoit d'app.js les helpers qui y restent définis (getIssues,
// withoutDeletedDevs) ; le reste est importé directement depuis les modules.
import { Router } from "express";
import { guard } from "../auth-core.js";
import { deriveFromPointHistory } from "../pointHistory.js";
import { monthlyPortfolio } from "../pointHistory.js";
import { buildSlaReport } from "../sla.js";
import { readConnaissance } from "../connaissance.js";
import { readAll as readDossiers } from "../dossiers.js";
import { buildDeadlineRadar } from "../deadlines.js";
import { buildProjections } from "../projections.js";
import { buildCoherence } from "../coherence.js";
import { buildRiskScores } from "../risk.js";
import { buildCharge } from "../charge.js";
import { buildQuotes } from "../quotes.js";
import { readSignals, signalsStats } from "../signals.js";

export function analyticsRouter({ getIssues, withoutDeletedDevs }) {
  const r = Router();

  // Radar des échéances : lit ce qui est déjà écrit (fiches + mémoire) — zéro invention.
  r.get("/api/deadlines", guard, (_req, res) => {
    try {
      res.json({ radar: buildDeadlineRadar(readDossiers(), readConnaissance()) });
    } catch (err) {
      console.error("[GET /api/deadlines]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
  });

  // Journal de signaux : historique des régressions/SLA/stagnation/divergences (fait réel archivé).
  r.get("/api/signals", guard, (req, res) => {
    try {
      const days = Math.min(60, Math.max(1, parseInt(req.query.days, 10) || 30));
      res.json({ rows: readSignals(days), stats: signalsStats(days) });
    } catch (err) {
      console.error("[GET /api/signals]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
  });

  // Projections ancrées sur l'historique (pointHistory) : rythme, tendance, ETA.
  r.get("/api/projections", guard, (_req, res) => {
    try { res.json(buildProjections()); }
    catch (err) { console.error("[GET /api/projections]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
  });

  // Audit de cohérence : contradictions internes Jira + croisements externes (statut honnête).
  r.get("/api/coherence", guard, async (_req, res) => {
    try {
      const got = await getIssues(false);
      if (!got) return res.status(409).json({ error: "Jira non configuré." });
      res.json(buildCoherence(withoutDeletedDevs(got.issues)));
    } catch (err) {
      console.error("[GET /api/coherence]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
  });

  // Score de risque par dossier — condensé de tous les signaux, tracé à des faits réels.
  r.get("/api/risk", guard, async (_req, res) => {
    try {
      const got = await getIssues(false);
      if (!got) return res.status(409).json({ error: "Jira non configuré." });
      const issues = withoutDeletedDevs(got.issues);
      const slaReport = buildSlaReport(issues);
      const radar = buildDeadlineRadar(readDossiers(), readConnaissance());
      const coherence = buildCoherence(issues);
      const pointDerived = deriveFromPointHistory();
      res.json(buildRiskScores({ issues, slaReport, radar, coherence, pointDerived }));
    } catch (err) {
      console.error("[GET /api/risk]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
  });

  // Charge & capacité par développeur — tiré des assignations Jira réelles.
  r.get("/api/charge", guard, async (_req, res) => {
    try {
      const got = await getIssues(false);
      if (!got) return res.status(409).json({ error: "Jira non configuré." });
      res.json(buildCharge(withoutDeletedDevs(got.issues)));
    } catch (err) {
      console.error("[GET /api/charge]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
  });

  // La cote du portefeuille — synthèse « marché » (variation, courbe, volume, indice, téléscripteur).
  r.get("/api/quotes", guard, async (_req, res) => {
    try {
      const got = await getIssues(false);
      if (!got) return res.status(409).json({ error: "Jira non configuré." });
      const issues = withoutDeletedDevs(got.issues);
      const pointDerived = deriveFromPointHistory();
      const projections = buildProjections();
      const slaReport = buildSlaReport(issues);
      const radar = buildDeadlineRadar(readDossiers(), readConnaissance());
      const coherence = buildCoherence(issues);
      const risk = buildRiskScores({ issues, slaReport, radar, coherence, pointDerived });
      res.json(buildQuotes({ pointDerived, projections, risk }));
    } catch (err) {
      console.error("[GET /api/quotes]", err && err.message ? err.message : err); res.status(502).json({ error: String(err.message || err) }); }
  });

  // Cumul mensuel du portefeuille (barres temporelles réelles) — se remplit avec le temps.
  r.get("/api/portfolio-monthly", guard, (_req, res) => {
    try { res.json({ months: monthlyPortfolio() }); }
    catch (err) { console.error("[GET /api/portfolio-monthly]", err && err.message ? err.message : err); res.status(500).json({ error: String(err.message || err) }); }
  });

  return r;
}
