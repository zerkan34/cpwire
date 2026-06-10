import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./theme.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Active la PWA (installation sur l'écran d'accueil + coquille hors-ligne).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
