import React from "react";

// Filet de sécurité : si un composant plante, on affiche un écran de reprise
// avec un bouton « Relancer » plutôt qu'une page blanche figée.
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { try { console.error("cp|WIRE error:", error, info); } catch { /* */ } }

  reload = () => { try { window.location.reload(); } catch { /* */ } };
  hardReload = async () => {
    // Efface service workers ET caches, puis recharge depuis le réseau.
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
    } catch { /* */ }
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch { /* */ }
    try { window.location.reload(); } catch { /* */ }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <div className="crash-card">
            <img src="/cpwire-logo.png" alt="cp|WIRE" className="crash-logo" />
            <h2>Une erreur est survenue</h2>
            <p>L'application a rencontré un problème. Tes données ne sont pas perdues — relance simplement l'application.</p>
            <div className="crash-actions">
              <button className="btn-solid" onClick={this.reload}>⟳ Relancer l'application</button>
              <button className="btn-line" onClick={this.hardReload}>Vider le cache et relancer</button>
            </div>
            <p className="crash-hint">Si le problème persiste après relance, signale-le (capture d'écran utile).</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
