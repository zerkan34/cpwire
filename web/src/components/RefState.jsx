import React from "react";

// État d'affichage propre (chargement / vide / erreur), à la charte.
// Remplace les messages bruts type « Erreur : 500 » par un message lisible,
// avec le détail technique discret et un bouton Réessayer optionnel.
export function RefState({ kind = "empty", title, message, detail, onRetry }) {
  const ic = kind === "err" ? "!" : kind === "load" ? "\u25CC" : "\u2728";
  return (
    <div className={`ref-state ${kind}`}>
      <div className="rs-ic">{ic}</div>
      {title ? <div className="rs-t">{title}</div> : null}
      {message ? <div className="rs-m">{message}</div> : null}
      {detail ? <div className="rs-d">{detail}</div> : null}
      {onRetry ? <button className="rs-retry" onClick={onRetry}>Réessayer</button> : null}
    </div>
  );
}

// Garde-fou : si une vue plante, on affiche un état propre au lieu d'une page blanche.
export class RefBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch() { /* silencieux : l'état propre suffit à l'utilisateur */ }
  render() {
    if (this.state.err) {
      return (
        <RefState
          kind="err"
          title="Cette vue a rencontré un souci"
          message="Un élément n'a pas pu s'afficher. Réessayez, ou changez de vue le temps que ça revienne."
          detail={String(this.state.err.message || this.state.err)}
          onRetry={() => this.setState({ err: null })}
        />
      );
    }
    return this.props.children;
  }
}

export default RefState;
