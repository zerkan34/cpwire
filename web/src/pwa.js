// pwa.js — couche PWA de cp|WIRE.
// - Enregistre le service worker.
// - MISE À JOUR CONTRÔLÉE : quand une nouvelle version est prête, on prévient
//   l'app (événement) au lieu de recharger en douce → l'utilisateur clique
//   « Actualiser » (fini le « vider le cache PWA » à la main).
// - Capture l'invite d'installation native (Android/Chrome/Edge).
//
// Événements émis sur window :
//   "pwa:updateready" → nouvelle version installée et en attente (→ applyUpdate())
//   "pwa:installable" → installation possible (→ promptInstall())
//   "pwa:installed"   → l'app vient d'être installée
let _reg = null;
let _deferredPrompt = null;
let _refreshing = false;

// L'app tourne-t-elle déjà en mode installé (plein écran) ?
export function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  } catch { return false; }
}

export function hasInstallPrompt() { return !!_deferredPrompt; }

// Applique la mise à jour : on demande au worker en attente de prendre la main ;
// le rechargement se fait automatiquement via « controllerchange ».
export async function applyUpdate() {
  const w = _reg && _reg.waiting;
  if (w) { w.postMessage({ type: "SKIP_WAITING" }); return true; }
  window.location.reload(); // pas de worker en attente : on recharge simplement
  return false;
}

// Déclenche l'invite d'installation native. Renvoie true si l'invite a été montrée.
export async function promptInstall() {
  if (!_deferredPrompt) return false;
  const p = _deferredPrompt;
  _deferredPrompt = null;
  p.prompt();
  try { await p.userChoice; } catch { /* ignoré */ }
  return true;
}

export function registerPwa() {
  if (typeof window === "undefined") return;

  // Invite d'installation (Android/Chrome/Edge) : on la capture pour la déclencher
  // depuis NOTRE bouton, au bon moment.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    window.dispatchEvent(new CustomEvent("pwa:installable"));
  });
  window.addEventListener("appinstalled", () => {
    _deferredPrompt = null;
    window.dispatchEvent(new CustomEvent("pwa:installed"));
  });

  if (!("serviceWorker" in navigator)) return;

  // Rechargement unique quand le nouveau worker prend le contrôle.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_refreshing) return;
    _refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      _reg = await navigator.serviceWorker.register("/sw.js");

      // Une version est déjà installée et en attente ? → mise à jour prête.
      if (_reg.waiting && navigator.serviceWorker.controller) {
        window.dispatchEvent(new CustomEvent("pwa:updateready"));
      }

      // Nouvelle version détectée pendant la session.
      _reg.addEventListener("updatefound", () => {
        const nw = _reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("pwa:updateready"));
          }
        });
      });

      // Vérifie SOUVENT (60 s) + au retour sur l'onglet/app → la MAJ est proposée
      // rapidement, sans relancer l'application.
      const check = () => { try { _reg && _reg.update(); } catch { /* ignoré */ } };
      setInterval(check, 60 * 1000);
      window.addEventListener("focus", check);
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    } catch { /* SW indisponible : l'app fonctionne quand même */ }
  });

  // Filet de sécurité : détecte AUSSI un nouveau déploiement même si le service
  // worker n'a pas changé (nouveau bundle hashé dans index.html) → propose la MAJ.
  startVersionWatch();
}

// --- Détection de nouvelle version déployée (poll du bundle principal hashé) ---
let _buildRef = null;
async function fetchBuildRef() {
  try {
    const r = await fetch("/?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/\/assets\/[A-Za-z0-9_.-]*index[A-Za-z0-9_.-]*\.js/) || html.match(/\/assets\/[A-Za-z0-9_.-]+\.js/);
    return m ? m[0] : null;
  } catch { return null; }
}
async function versionCheck() {
  const ref = await fetchBuildRef();
  if (!ref) return;
  if (_buildRef == null) { _buildRef = ref; return; }          // référence initiale
  if (ref !== _buildRef) { _buildRef = ref; window.dispatchEvent(new CustomEvent("pwa:updateready")); }
}
function startVersionWatch() {
  if (typeof window === "undefined") return;
  versionCheck();
  setInterval(versionCheck, 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) versionCheck(); });
  window.addEventListener("focus", versionCheck);
  window.addEventListener("online", versionCheck);
}
