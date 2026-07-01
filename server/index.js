// index.js — script de démarrage. La construction de l'app (middlewares, ~70 routes)
// vit dans app.js ; ce fichier ne fait que restaurer l'état au démarrage et écouter.
// Volontairement minimal : c'est la partie qu'on ne teste pas (juste un appel à
// app.listen), toute la logique testable est dans app.js et les modules métier.
import { app, sessions, initSessions, PORT, ALLOW_DEMO, AUTH_ENABLED, runDigest } from "./app.js";
import { startDigestScheduler } from "./scheduler.js";
import { initMemory } from "./connaissance.js";
import { initImports } from "./import.js";
import { isConfigured } from "./jira.js";
import { aiAvailable } from "./ai.js";
import { ME } from "./config.js";
import { dataDirInfo } from "./paths.js";
import { persistenceActive } from "./persist.js";

const isPersistent = () => dataDirInfo().persistent || persistenceActive();

try { const restored = await initMemory(); if (restored) console.log("[connaissance] mémoire restaurée depuis la base durable."); } catch (e) { console.error("initMemory:", e.message); }
try { const ri = await initImports(); if (ri) console.log("[import] historique et datasets restaurés depuis la base durable."); } catch (e) { console.error("initImports:", e.message); }
try { const rs = await initSessions(); if (rs) console.log(`[sessions] ${sessions.size} session(s) restaurée(s) — pas de déconnexion forcée après ce déploiement.`); } catch (e) { console.error("initSessions:", e.message); }

app.listen(PORT, () => {
  console.log(`CPwire API sur http://localhost:${PORT}`);
  console.log(`Auth: ${AUTH_ENABLED ? "oui" : "non"} | Jira: ${isConfigured() ? "oui" : (ALLOW_DEMO ? "démo" : "non configuré")} | IA: ${aiAvailable() ? "oui" : "gabarit"} | moi: ${ME}`);
  const _d = dataDirInfo();
  console.log(`Données: ${_d.dir} | persistance: ${isPersistent() ? (persistenceActive() ? "OUI (base Neon)" : "OUI (disque persistant)") : "NON (éphémère — définir DATABASE_URL ou DATA_DIR)"}`);
  try { startDigestScheduler(runDigest); } catch (e) { console.error("[digest] planificateur non démarré :", e && e.message ? e.message : e); }
});
