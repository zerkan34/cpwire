// modalNav.js — fait fonctionner le bouton "retour" (navigateur / téléphone) avec les modales empilées.
// Chaque modale empile un état d'historique ; "retour" ferme la modale du dessus
// (ex. ticket ouvert depuis une fiche dev -> retour revient sur la fiche, pas sur la liste).
import { useEffect, useRef } from "react";

const stack = [];
let started = false;

function onPop() {
  const entry = stack.pop();
  if (entry) entry.onClose();
}

function pushModal(onClose) {
  if (!started) { started = true; window.addEventListener("popstate", onPop); }
  const entry = { onClose };
  stack.push(entry);
  try { window.history.pushState({ cpModal: true }, ""); } catch { /* ignore */ }
  return entry;
}

function unregister(entry) {
  const i = stack.lastIndexOf(entry);
  if (i !== -1) stack.splice(i, 1);
}

// À appeler par la croix, le clic à l'extérieur et la flèche retour : on passe par l'historique
// pour que le bouton "retour" du téléphone et la croix se comportent à l'identique.
export function backOut() {
  try { window.history.back(); } catch { /* ignore */ }
}

// Hook : enregistre la modale dans la pile et la retire au démontage.
export function useModalBack(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = pushModal(() => ref.current && ref.current());
    return () => unregister(entry);
  }, []);
}
