import React, { useEffect } from "react";

// L'Atelier de flux (Belmet ERP26) est une page autonome interactive (éditeur de
// flux + GANTT + livrables), hors chrome cp|WIRE. On redirige le navigateur vers
// /flux/ dès que l'onglet est activé (même principe que ShareFly).
export default function Flux() {
  useEffect(() => { window.location.href = "/flux/"; }, []);
  return (
    <div className="sharefly-wrap" style={{ padding: 32, color: "var(--muted, #6E6A86)" }}>
      Ouverture de l'Atelier de flux en plein écran{" "}
      <a href="/flux/" style={{ color: "var(--indigo, #3B2E8C)", fontWeight: 600 }}>
        cliquer ici si rien ne se passe
      </a>.
    </div>
  );
}
