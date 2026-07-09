import React, { useEffect, useRef, useState } from "react";
import { PILOT_DATA_URI } from "../pilot.js";

// Intro d'accueil : Natacha apparaît quand la home s'affiche, fait un clin d'œil,
// puis disparaît. Ne joue QU'UNE fois par chargement de l'app (pas à chaque retour).
let PLAYED = false;

export default function NatachaIntro() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    if (PLAYED) return;
    PLAYED = true;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduce ? 1500 : 2900;     // durée à l'écran avant la sortie
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), hold);
    const t2 = setTimeout(() => setShow(false), hold + 560);
    timers.current.push(t1, t2);
    return () => timers.current.forEach(clearTimeout);
  }, []);

  if (!show) return null;

  return (
    <div className={`nti ${leaving ? "nti--leave" : ""}`} aria-hidden="true">
      <div className="nti-card">
        <div className="nti-ava">
          <img src={PILOT_DATA_URI} alt="" draggable="false" />
          <span className="nti-lid" />
          <span className="nti-spark" />
        </div>
        <div className="nti-bubble">
          <b>Natacha</b>
          <span>Bienvenue à bord — prêt au décollage&nbsp;😉</span>
        </div>
      </div>
    </div>
  );
}
