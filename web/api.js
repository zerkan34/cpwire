// modalNav.js — fermeture FIABLE des modales : croix, clic à l'extérieur, flèche retour, touche Échap.
// On gère une petite pile pour que "fermer" agisse toujours sur la modale du dessus
// (ex. ticket ouvert depuis une fiche dev -> on ferme le ticket, pas la fiche).
// Note : on ne dépend plus de l'historique du navigateur (history.back), qui pouvait
// laisser une modale "collée" et geler l'appli. La fermeture appelle directement onClose.
import { useEffect, useRef } from "react";

const stack = [];

// Hook : enregistre la modale dans la pile ; la touche Échap ferme celle du dessus.
export function useModalBack(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = { close: () => { if (ref.current) ref.current(); } };
    stack.push(entry);
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); backOut(); } };
    window.addEventListener("keydown", onKey);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

// Appelée par la croix, la flèche retour et le clic à l'extérieur : ferme la modale du dessus.
export function backOut() {
  const entry = stack[stack.length - 1];
  if (entry) entry.close();
}
