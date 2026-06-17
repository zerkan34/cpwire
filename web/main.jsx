import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./theme.css";

// Mode desktop : si l'app tourne dans la coquille Tauri (fenêtre installée) OU si on
// ajoute ?desktop=1 / #desktop dans l'URL (pour tester dans un navigateur), on bascule
// le fond en verre translucide. Sans effet en usage web normal.
try {
  const params = new URLSearchParams(window.location.search);
  const isDesktop = !!(window.__TAURI_INTERNALS__ || window.__TAURI__) ||
    params.get("desktop") === "1" || window.location.hash.includes("desktop");
  if (isDesktop) document.documentElement.classList.add("is-desktop");
} catch { /* no-op */ }

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Active la PWA (installation sur l'écran d'accueil + coquille hors-ligne).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
