// sw.js — service worker CPwire.
// Objectif : rendre l'appli installable (PWA) et rapide, SANS jamais mettre en
// cache les données Jira (les appels /api passent toujours par le réseau).
const CACHE = "cpwire-shell-v18";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // jamais les POST/PUT (login, rapports, push)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // on laisse passer les CDN (polices)
  if (url.pathname.startsWith("/api")) return;            // JAMAIS les données Jira en cache

  // Navigation : réseau d'abord, repli sur la coquille en cache (mode hors-ligne).
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put("/", c)); return r; })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Ressources statiques (JS/CSS/images, noms hashés) : cache d'abord, sinon réseau.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((r) => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)); }
        return r;
      })
    )
  );
});
