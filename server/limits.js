// limits.js — fabrique de rate limiting (comptage par IP, fenêtre glissante). Module à
// part pour que auth-core.js et app.js (et les futurs routeurs) puissent chacun définir
// leurs propres limiteurs sans dépendre l'un de l'autre.
export function rateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, reset }
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || "?";
    let e = hits.get(ip);
    if (!e || now > e.reset) { e = { count: 0, reset: now + windowMs }; hits.set(ip, e); }
    e.count++;
    if (hits.size > 5000) { for (const [k, v] of hits) if (now > v.reset) hits.delete(k); } // purge légère
    if (e.count > max) {
      const retry = Math.ceil((e.reset - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: message || "Trop de tentatives, réessayez plus tard.", retryAfter: retry });
    }
    next();
  };
}
