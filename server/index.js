// index.js — script de démarrage. La construction de l'app (middlewares, ~70 routes)
// vit dans app.js ; ce fichier ne fait que restaurer l'état au démarrage et écouter.
// Volontairement minimal : c'est la partie qu'on ne teste pas (juste un appel à
// app.listen), toute la logique testable est dans app.js et les modules métier.
import { app, sessions, initSessions, PORT, ALLOW_DEMO, AUTH_ENABLED, runDigest } from "./app.js";
import { startDigestScheduler } from "./scheduler.js";
import { purgeSessions } from "./auth-core.js";
import { initMemory } from "./connaissance.js";
import { initImports } from "./import.js";
import { isConfigured } from "./jira.js";
import { aiAvailable } from "./ai.js";
import { ME } from "./config.js";
import { dataDirInfo } from "./paths.js";
import { persistenceActive } from "./persist.js";

const isPersistent = () => dataDirInfo().persistent || persistenceActive();

// ---- Garde-fou de démarrage ------------------------------------------------
// AUTH_ENABLED est faux dès que AUTH_EMAIL ou AUTH_PASSWORD manque, et guard()
// accorde alors le rôle owner à TOUT LE MONDE (pratique en local, catastrophique
// en ligne). Une variable effacée par erreur sur Render ouvrait donc l'application
// en grand, en silence. On préfère refuser de démarrer : une panne visible vaut
// mieux qu'une fuite invisible. PERMETTRE_SANS_AUTH=1 laisse une porte de secours
// explicite si tu as un jour besoin de démarrer sans authentification en ligne.
if (process.env.NODE_ENV === "production" && !AUTH_ENABLED && process.env.PERMETTRE_SANS_AUTH !== "1") {
  console.error("[sécurité] ARRÊT : AUTH_EMAIL et AUTH_PASSWORD sont obligatoires en production.");
  console.error("[sécurité] Sans eux, l'API serait ouverte en lecture et en écriture à tout visiteur.");
  console.error("[sécurité] Renseigne ces variables sur Render, ou pose PERMETTRE_SANS_AUTH=1 en connaissance de cause.");
  process.exit(1);
}

try { const restored = await initMemory(); if (restored) console.log("[connaissance] mémoire restaurée depuis la base durable."); } catch (e) { console.error("initMemory:", e.message); }
try { const ri = await initImports(); if (ri) console.log("[import] historique et datasets restaurés depuis la base durable."); } catch (e) { console.error("initImports:", e.message); }
try { const rs = await initSessions(); if (rs) console.log(`[sessions] ${sessions.size} session(s) restaurée(s) — pas de déconnexion forcée après ce déploiement.`); } catch (e) { console.error("initSessions:", e.message); }

app.listen(PORT, () => {
  console.log(`CPwire API sur http://localhost:${PORT}`);
  console.log(`Auth: ${AUTH_ENABLED ? "oui" : "non"} | Jira: ${isConfigured() ? "oui" : (ALLOW_DEMO ? "démo" : "non configuré")} | IA: ${aiAvailable() ? "oui" : "gabarit"} | moi: ${ME}`);
  if (!AUTH_ENABLED) {
    console.warn("[sécurité] ⚠ AUTH DÉSACTIVÉE (AUTH_EMAIL / AUTH_PASSWORD non définis) : l'API est OUVERTE en lecture/écriture. À configurer impérativement en production.");
  }
  if (!(process.env.ALLOWED_ORIGINS || "").trim()) {
    console.warn("[sécurité] ⚠ ALLOWED_ORIGINS vide : CORS permissif (toutes origines acceptées). Définis la liste blanche en production.");
  }
  const _d = dataDirInfo();
  console.log(`Données: ${_d.dir} | persistance: ${isPersistent() ? (persistenceActive() ? "OUI (base Neon)" : "OUI (disque persistant)") : "NON (éphémère — définir DATABASE_URL ou DATA_DIR)"}`);
  try { startDigestScheduler(runDigest); } catch (e) { console.error("[digest] planificateur non démarré :", e && e.message ? e.message : e); }
  // Purge quotidienne des sessions inactives (le démarrage en fait déjà une).
  // unref() : ce minuteur n'empêche jamais le process de s'arrêter proprement.
  setInterval(() => {
    try {
      const n = purgeSessions();
      if (n) console.log(`[sessions] ${n} session(s) inactive(s) purgée(s).`);
    } catch (e) { console.error("[sessions] purge impossible :", e && e.message ? e.message : e); }
  }, 24 * 60 * 60 * 1000).unref();
});
