// scheduler.js — PLANIFICATEUR du digest du soir (in-process).
// -----------------------------------------------------------------------------
// Envoie le digest une fois par jour à l'heure configurée (fuseau Europe/Paris),
// SI un destinataire et Microsoft 365 sont en place. Sinon : dormant (log honnête).
//
// LIMITE À CONNAÎTRE : sur un hébergement qui met l'instance en veille (Render
// free tier), un minuteur in-process ne se déclenche pas pendant le sommeil. Pour
// une fiabilité garantie, utiliser un Render Cron Job qui appelle
// POST /api/cron/digest avec l'en-tête x-cron-secret. Ce planificateur reste utile
// sur une instance toujours active (plan payant / keep-alive).
//
// Réglages (variables d'environnement) :
//   DIGEST_TO            destinataire (obligatoire pour activer l'envoi)
//   DIGEST_AT            heure locale Paris "HH:MM" (défaut "18:30")
//   DIGEST_HOUR          repli si DIGEST_AT absent : heure pleine 0–23 (Paris)
//   DIGEST_TZ            fuseau (défaut "Europe/Paris")
//   DIGEST_SKIP_WEEKEND  "1" pour ne pas envoyer samedi/dimanche
//   DIGEST_ENABLED       "0" pour désactiver explicitement

const H = 3600000;

// "Maintenant" exprimé dans le fuseau donné (champs locaux = heure murale du fuseau)
// + décalage ms pour reconvertir une heure murale en instant réel.
function tzContext(tz) {
  const now = new Date();
  const wall = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const offset = now.getTime() - wall.getTime(); // réel - murale
  return { now, wall, offset };
}

// Prochain instant (ms epoch) correspondant à hh:mm dans le fuseau, éventuellement
// en sautant le week-end.
function nextFireMs(hh, mm, tz, skipWeekend) {
  const { now, wall, offset } = tzContext(tz);
  const target = new Date(wall);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() <= wall.getTime()) target.setDate(target.getDate() + 1);
  if (skipWeekend) {
    while (target.getDay() === 0 || target.getDay() === 6) target.setDate(target.getDate() + 1);
  }
  const real = target.getTime() + offset; // heure murale -> instant réel
  return { wait: real - now.getTime(), when: target };
}

export function startDigestScheduler(runDigest) {
  const to = process.env.DIGEST_TO || "";
  const enabled = process.env.DIGEST_ENABLED !== "0";
  const tz = process.env.DIGEST_TZ || "Europe/Paris";
  const skipWeekend = process.env.DIGEST_SKIP_WEEKEND === "1";

  // DIGEST_AT="HH:MM" prioritaire ; repli DIGEST_HOUR (heure pleine) ; défaut 18:30.
  let hh = 18, mm = 30;
  const at = String(process.env.DIGEST_AT || "").match(/^(\d{1,2}):(\d{2})$/);
  if (at) { hh = Math.min(23, +at[1]); mm = Math.min(59, +at[2]); }
  else if (process.env.DIGEST_HOUR != null && process.env.DIGEST_HOUR !== "") {
    hh = Math.min(23, Math.max(0, parseInt(process.env.DIGEST_HOUR, 10) || 18)); mm = 0;
  }

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
    const { wait, when } = nextFireMs(hh, mm, tz, skipWeekend);
    const t = setTimeout(async () => { await fire(); arm(); }, wait);
    if (t.unref) t.unref();
    const hm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const jour = when.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" });
    console.log(`[digest] planificateur armé : prochain envoi ${jour} ~${hm} (${tz}), dans ~${Math.round(wait / H)} h, vers ${to}.`);
  };
  arm();
}
