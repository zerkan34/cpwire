// sw.js — service worker cp|WIRE.
// Objectif : appli installable (PWA), rapide, avec MISE À JOUR CONTRÔLÉE (un
// bouton « Actualiser » dans l'app au lieu d'un vidage de cache manuel) — et
// SANS jamais mettre en cache les données Jira (/api passe toujours par le réseau).
const CACHE = "cpwire-shell-v31";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

// --- Push en arrière-plan (appli fermée, quand le backend Web Push sera branché) ---
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text ? e.data.text() : "" }; }
  const opts = {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: d.tag || "cpwire-push",
    data: { url: d.url || "/" },
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(d.title || "cp|WIRE", opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cl) => {
      for (const c of cl) { if ("focus" in c) { c.navigate(target); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// Mise à jour à la demande : l'app envoie SKIP_WAITING quand l'utilisateur clique « Actualiser ».
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Installation : on précharge la coquille (hors-ligne immédiat). PAS de skipWaiting auto
// → la nouvelle version attend que l'utilisateur l'accepte (pas de rechargement surprise).
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // jamais POST/PUT (login, rapports, push)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // CDN (polices) : on laisse passer
  if (url.pathname.startsWith("/api")) return;            // JAMAIS les données Jira en cache

  // Navigation : réseau d'abord, repli sur la coquille en cache (hors-ligne).
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put("/", c)); return r; })
        .catch(() => caches.match("/").then((hit) => hit || caches.match(req)))
    );
    return;
  }

  // Statiques (JS/CSS/images hashés) : cache d'abord, sinon réseau (et on met en cache).
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((r) => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)); }
        return r;
      })
    )
  );
});
