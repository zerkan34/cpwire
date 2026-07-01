// scheduler.js — PLANIFICATEUR du digest du soir (in-process).
// -----------------------------------------------------------------------------
// Envoie le digest une fois par jour à l'heure configurée, SI un destinataire et
// Microsoft 365 sont en place. Sinon : dormant, aucun effet (log honnête).
//
// LIMITE À CONNAÎTRE : sur un hébergement qui met l'instance en veille (Render
// free tier), un minuteur in-process ne se déclenche pas pendant le sommeil. Pour
// une fiabilité garantie, utiliser un Render Cron Job qui appelle
// POST /api/cron/digest avec l'en-tête x-cron-secret. Ce planificateur reste utile
// sur une instance toujours active (plan payant / keep-alive).
//
// Réglages (variables d'environnement) :
//   DIGEST_TO      destinataire (obligatoire pour activer l'envoi)
//   DIGEST_HOUR    heure locale serveur, 0–23 (défaut 18)
//   DIGEST_ENABLED "0" pour désactiver explicitement même si DIGEST_TO est défini

const H = 3600000, DAY = 86400000;

function msUntilNext(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY);
  return next.getTime() - now.getTime();
}

export function startDigestScheduler(runDigest) {
  const to = process.env.DIGEST_TO || "";
  const enabled = process.env.DIGEST_ENABLED !== "0";
  const hour = Math.min(23, Math.max(0, parseInt(process.env.DIGEST_HOUR, 10) || 18));

  if (!enabled) { console.log("[digest] planificateur désactivé (DIGEST_ENABLED=0)."); return; }
  if (!to) { console.log("[digest] planificateur dormant : aucun DIGEST_TO défini (l'envoi manuel reste possible)."); return; }

  const fire = async () => {
    try {
      const r = await runDigest({ send: true });
      if (r && r.envoi && r.envoi.envoye) console.log(`[digest] envoyé à ${r.envoi.to} (${r.digest.date}).`);
      else console.log(`[digest] non envoyé : ${r && r.envoi ? r.envoi.raison : "raison inconnue"}.`);
    } catch (e) { console.error("[digest] échec de l'envoi planifié :", e && e.message ? e.message : e); }
  };

  const arm = () => {
    const wait = msUntilNext(hour);
    const t = setTimeout(async () => { await fire(); arm(); }, wait);
    if (t.unref) t.unref();
    const hh = String(hour).padStart(2, "0");
    console.log(`[digest] planificateur armé : prochain envoi vers ${hh}h00 (heure serveur), dans ~${Math.round(wait / H)} h, vers ${to}.`);
  };
  arm();
}
