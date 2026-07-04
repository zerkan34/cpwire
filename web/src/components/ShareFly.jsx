import React, { useEffect } from "react";

// ShareFly s'ouvre en PLEINE PAGE (hors chrome cp|WIRE), avec un bouton
// « ← cp|WIRE » dans son propre en-tête pour revenir. On redirige donc le
// navigateur vers la page autonome /sharefly/ dès que l'onglet est activé.
export default function ShareFly() {
  useEffect(() => { window.location.href = "/sharefly/"; }, []);
  return (
    <div className="sharefly-wrap" style={{ padding: 32, color: "var(--muted, #6E6A86)" }}>
      Ouverture de ShareFly en plein écran…{" "}
      <a href="/sharefly/" style={{ color: "var(--indigo, #3B2E8C)", fontWeight: 600 }}>
        cliquer ici si rien ne se passe
      </a>.
    </div>
  );
}
