import React, { useEffect, useRef } from "react";
import skyMp4 from "../assets/cockpit-fly.mp4";
import warpMp4 from "../assets/cockpit-warp.mp4";
import skyPoster from "../assets/cockpit-fly-poster.jpg";

// Fond « flight-deck » GLOBAL : vidéo cockpit en boucle derrière TOUTE l'app.
// Clic-maintenu dans le vide (hors carte/contrôle/modale) → bascule en warp
// (accélération), relâchement → retour au calme. Écoute sur tout le document.
export default function CockpitSky() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // On ne déclenche PAS sur un conteneur, un contrôle, un tableau, un onglet, une modale…
    const CONTAINERS = ".pc2-card,.card,.panel,.login-card,.pc2-scope,.pc2-tk,.pc2-kpis,.pc2-kpi,.tabs,.subtabs,.owner-bar,.hdr-controls,.hdr-top,button,a,input,select,textarea,label,table,.modal,.overlay,.cwa-overlay,.cwa-panel,.notif-panel,.drawer,.nti-card,.pc2-menu,svg";
    const isBg = (t) => !(t && t.closest && t.closest(CONTAINERS));
    const boost = (e) => { if (e.type === "mousedown" && e.button) return; if (isBg(e.target)) el.classList.add("boost"); };
    const relax = () => el.classList.remove("boost");
    document.addEventListener("mousedown", boost);
    document.addEventListener("touchstart", boost, { passive: true });
    window.addEventListener("mouseup", relax);
    window.addEventListener("touchend", relax);
    window.addEventListener("blur", relax);
    return () => {
      document.removeEventListener("mousedown", boost);
      document.removeEventListener("touchstart", boost);
      window.removeEventListener("mouseup", relax);
      window.removeEventListener("touchend", relax);
      window.removeEventListener("blur", relax);
    };
  }, []);

  return (
    <div className="cockpit-sky" ref={ref} aria-hidden="true" style={{ backgroundImage: `url(${skyPoster})` }}>
      <video className="csky-vid" autoPlay muted loop playsInline preload="auto" poster={skyPoster}>
        <source src={skyMp4} type="video/mp4" />
      </video>
      <video className="csky-vid csky-warp" autoPlay muted loop playsInline preload="auto">
        <source src={warpMp4} type="video/mp4" />
      </video>
      <div className="csky-veil" />
    </div>
  );
}
