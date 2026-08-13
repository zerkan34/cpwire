// routes/reunion.js — module Réunion : transcription du son de l'ordinateur.
//
// Monté dans app.js par :  app.use(reunionRouter({ guard, aiLimiter }))
// Les chemins sont absolus (/api/reunion/...), comme shareflyRouter.
//
// Variables d'environnement :
//   GEMINI_API_KEY  (obligatoire)  — clé du moteur, jamais exposée au navigateur
//   GEMINI_MODEL    (optionnel)    — défaut gemini-2.5-flash
//   REUNION_STORE   (optionnel)    — force un fichier au lieu de la base durable

import express from "express";
import * as store from "../reunionStore.js";

const MODELE = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CLE = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

const MIMES_AUDIO = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
]);

/* ---------------------------------------------------------------- */
/* Appel au moteur                                                   */
/* ---------------------------------------------------------------- */

async function appelGemini(parts, { temperature = 0.1, maxTokens = 4096 } = {}) {
  if (!CLE) {
    const e = new Error("GEMINI_API_KEY absente côté serveur");
    e.statut = 503;
    throw e;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`;
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), 120000);
  let rep;
  try {
    rep = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": CLE },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
      signal: ctl.signal,
    });
  } catch (err) {
    clearTimeout(minuteur);
    const e = new Error(
      err.name === "AbortError" ? "Délai dépassé côté moteur de transcription" : err.message
    );
    e.statut = 504;
    throw e;
  }
  clearTimeout(minuteur);

  if (!rep.ok) {
    const corps = await rep.text().catch(() => "");
    console.error("[reunion] Gemini", rep.status, corps.slice(0, 400));
    const e = new Error(
      rep.status === 429
        ? "Quota du moteur atteint, réessaie dans un instant"
        : `Moteur de transcription indisponible (${rep.status})`
    );
    e.statut = rep.status === 429 ? 429 : 502;
    throw e;
  }

  const data = await rep.json();
  const cand = data?.candidates?.[0];
  return Array.isArray(cand?.content?.parts)
    ? cand.content.parts.map((p) => p.text || "").join("").trim()
    : "";
}

const CONSIGNE_TRANSCRIPTION = [
  "Tu transcris l'audio d'une réunion professionnelle en français.",
  "",
  "Règles strictes :",
  "- Restitue uniquement ce qui est réellement dit. N'invente rien, ne complète rien, ne reformule pas.",
  "- Si un passage est inaudible, écris [inaudible]. Si l'extrait ne contient aucune parole, réponds exactement : (silence)",
  "- Si plusieurs voix sont distinguables, préfixe chaque prise de parole par « Locuteur A : », « Locuteur B : », etc.",
  "- Ponctue normalement, garde les termes techniques et les noms propres tels que prononcés.",
  "- Ne produis aucun commentaire, aucun titre, aucune balise : uniquement la transcription.",
].join("\n");

const CONSIGNE_CR = [
  "Tu es chef de projet et tu rédiges le compte rendu d'une réunion à partir de sa transcription.",
  "",
  "Règle absolue : zéro invention. Chaque élément doit être appuyé par la transcription.",
  "Aucune date, aucun chiffre, aucun nom qui n'a pas été prononcé. Si une information manque, laisse la valeur vide.",
  "",
  "Contraintes de rédaction :",
  "- Français professionnel, phrases courtes, langage clair, pas de jargon.",
  "- Pas de tirets cadratins.",
  "- Une décision est un choix acté pendant la réunion, pas une intention.",
  "- Une action a un porteur et si possible une échéance ; si le porteur n'est pas nommé, laisse « qui » vide.",
  "",
  "Réponds UNIQUEMENT par un objet JSON valide, sans texte autour et sans balises de code :",
  '{"titre":"","resume":"","participants":[],"sujets":[{"titre":"","points":[""]}],',
  '"decisions":[""],"actions":[{"quoi":"","qui":"","quand":""}],"points_ouverts":[""],"risques":[""]}',
].join("\n");

/* ---------------------------------------------------------------- */
/* Router                                                            */
/* ---------------------------------------------------------------- */

export function reunionRouter({ guard, aiLimiter } = {}) {
  const router = express.Router();
  const rien = (_req, _res, next) => next();
  const protege = guard || rien;
  const bride = aiLimiter || rien;

  // Les segments audio arrivent en base64 : limite propre à ce router,
  // indépendante du express.json global de l'application.
  const corpsAudio = express.json({ limit: "30mb" });

  // 1. Transcription d'un segment
  router.post("/api/reunion/transcribe", protege, bride, corpsAudio, async (req, res) => {
    try {
      const { audio, mime, contexte } = req.body || {};
      if (typeof audio !== "string" || audio.length < 100) {
        return res.status(400).json({ erreur: "Segment audio manquant ou vide" });
      }
      if (audio.length > 20 * 1024 * 1024) {
        return res.status(413).json({ erreur: "Segment audio trop volumineux" });
      }
      const base = String(mime || "").split(";")[0].toLowerCase();
      const typeAudio = MIMES_AUDIO.has(base) ? base : "audio/webm";

      const parts = [{ text: CONSIGNE_TRANSCRIPTION }];
      if (contexte && String(contexte).trim()) {
        parts.push({
          text:
            "Fin de la transcription précédente, uniquement pour la continuité du sens. Ne la répète pas :\n« " +
            String(contexte).slice(-600) +
            " »",
        });
      }
      parts.push({ inline_data: { mime_type: typeAudio, data: audio } });

      let texte = await appelGemini(parts, { temperature: 0, maxTokens: 2048 });
      if (/^\(?\s*silence\s*\)?$/i.test(texte)) texte = "";
      res.json({ texte });
    } catch (e) {
      res.status(e.statut || 500).json({ erreur: e.message });
    }
  });

  // 2. Compte rendu structuré
  router.post("/api/reunion/cr", protege, bride, express.json({ limit: "8mb" }), async (req, res) => {
    try {
      const { transcript, titre, client, date, reperes } = req.body || {};
      if (typeof transcript !== "string" || transcript.trim().length < 40) {
        return res.status(400).json({ erreur: "Transcription trop courte pour un compte rendu" });
      }
      const entete = [
        titre ? `Réunion : ${titre}` : null,
        client ? `Dossier / client : ${client}` : null,
        date ? `Date : ${date}` : null,
        Array.isArray(reperes) && reperes.length
          ? "Repères posés en séance par le chef de projet :\n" +
            reperes.map((r) => `- [${r.type}] ${r.texte}`).join("\n")
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      const brut = await appelGemini(
        [
          { text: CONSIGNE_CR },
          { text: (entete ? entete + "\n\n" : "") + "Transcription :\n" + transcript.slice(0, 400000) },
        ],
        { temperature: 0.2, maxTokens: 6144 }
      );

      const nettoye = brut.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      let cr = null;
      try {
        cr = JSON.parse(nettoye);
      } catch (e) {
        const d = nettoye.indexOf("{");
        const f = nettoye.lastIndexOf("}");
        if (d >= 0 && f > d) {
          try {
            cr = JSON.parse(nettoye.slice(d, f + 1));
          } catch (e2) {
            cr = null;
          }
        }
      }
      if (!cr) return res.status(502).json({ erreur: "Compte rendu illisible, relance la génération" });
      res.json({ cr });
    } catch (e) {
      res.status(e.statut || 500).json({ erreur: e.message });
    }
  });

  // 3. Réunions enregistrées
  router.get("/api/reunion/sessions", protege, async (_req, res) => {
    try {
      res.json({ sessions: await store.liste() });
    } catch (e) {
      res.status(500).json({ erreur: e.message });
    }
  });

  router.get("/api/reunion/sessions/:id", protege, async (req, res) => {
    try {
      const r = await store.lire(req.params.id);
      if (!r) return res.status(404).json({ erreur: "Réunion introuvable" });
      res.json({ reunion: r });
    } catch (e) {
      res.status(500).json({ erreur: e.message });
    }
  });

  router.post("/api/reunion/sessions", protege, express.json({ limit: "8mb" }), async (req, res) => {
    try {
      const { id, titre, client, date, dureeMs, transcript, cr, reperes } = req.body || {};
      if (!transcript || !String(transcript).trim()) {
        return res.status(400).json({ erreur: "Transcription absente" });
      }
      const r = await store.enregistrer({
        id,
        titre: titre || "Réunion sans titre",
        client: client || "",
        date: date || new Date().toISOString().slice(0, 10),
        dureeMs: dureeMs || 0,
        transcript: String(transcript),
        cr: cr || null,
        reperes: Array.isArray(reperes) ? reperes : [],
      });
      res.json(r);
    } catch (e) {
      res.status(500).json({ erreur: e.message });
    }
  });

  router.delete("/api/reunion/sessions/:id", protege, async (req, res) => {
    try {
      await store.supprimer(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erreur: e.message });
    }
  });

  router.get("/api/reunion/health", protege, async (_req, res) => {
    const st = await store
      .statut()
      .catch(() => ({ mode: "inconnu", durable: false, detail: "" }));
    res.json({ ok: true, moteur: !!CLE, modele: MODELE, stockage: st });
  });

  // Détermine le mode de stockage au démarrage, avec les autres logs de persistance.
  store.initialiser().catch((e) => console.error("[reunion] init stockage :", e.message));

  return router;
}
