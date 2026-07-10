import React, { useEffect, useState } from "react";
import { PILOT_DATA_URI } from "../pilot.js";
import natachaWink from "../assets/natacha-wink.png";

// Intro d'accueil : Natacha apparaît quand la home s'affiche, fait un clin d'œil,
// puis disparaît. Ne joue QU'UNE fois par chargement de l'app.
// PLAYED n'est passé à true qu'À LA FIN de l'anim → robuste au double-montage de React.StrictMode (dev).
let PLAYED = false;

export default function NatachaIntro({ greet }) {
  const [show, setShow] = useState(!PLAYED);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (PLAYED) { setShow(false); return; }
    setShow(true);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduce ? 2600 : 5200;
    const t1 = setTimeout(() => setLeaving(true), hold);
    const t2 = setTimeout(() => { PLAYED = true; setShow(false); }, hold + 560);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!show) return null;

  return (
    <div className={`nti ${leaving ? "nti--leave" : ""}`} aria-hidden="true">
      <div className="nti-card">
        <div className="nti-ava">
          <img src={PILOT_DATA_URI} alt="" draggable="false" />
          <img className="nti-wink" src={natachaWink} alt="" aria-hidden="true" draggable="false" />
          <span className="nti-spark" />
        </div>
        <div className="nti-bubble">
          <b>Natacha</b>
          <span>{greet ? greet : "Bienvenue à bord"} — prêt au décollage&nbsp;😉</span>
        </div>
      </div>
    </div>
  );
}
