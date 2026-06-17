// modalNav.js — fermeture FIABLE des modales (croix, clic extérieur, Échap) + verrouillage du scroll de l'arrière-plan.
// La pile garantit que "fermer" agit sur la modale du dessus (ex. ticket ouvert depuis une fiche -> ferme le ticket).
import { useEffect, useRef } from "react";

const stack = [];

// --- Verrou de scroll partagé : tant qu'au moins une modale est ouverte, le body ne défile pas. ---
let lockCount = 0;
let prevOverflow = "";
let prevPad = "";
function lockScroll() {
  if (lockCount === 0) {
    prevOverflow = document.body.style.overflow;
    prevPad = document.body.style.paddingRight;
    // compense la disparition de la scrollbar pour éviter un saut de mise en page
    const sb = window.innerWidth - document.documentElement.clientWidth;
    if (sb > 0) document.body.style.paddingRight = sb + "px";
    document.body.style.overflow = "hidden";
  }
  lockCount++;
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPad;
  }
}

// Hook : enregistre la modale dans la pile, gère Échap, et verrouille le scroll de fond.
export function useModalBack(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = { close: () => { if (ref.current) ref.current(); } };
    stack.push(entry);
    lockScroll();
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); backOut(); } };
    window.addEventListener("keydown", onKey);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, []);
}

// Hook léger : verrouille seulement le scroll de fond (pour les modales qui gèrent Échap elles-mêmes).
export function useScrollLock() {
  useEffect(() => { lockScroll(); return () => unlockScroll(); }, []);
}

// Ferme la modale du dessus (croix, flèche retour, clic extérieur).
export function backOut() {
  const entry = stack[stack.length - 1];
  if (entry) entry.close();
}
