import React from "react";

// ShareFly — l'annexe documentaire de cp|WIRE.
// L'app ShareFly (catalogue + journal + rôles) est servie en statique par le
// serveur Express sur /sharefly/ (voir server/sharefly.js). On l'affiche ici
// en plein cadre, dans le layout de cp|WIRE.
export default function ShareFly() {
  return (
    <div className="sharefly-wrap">
      <iframe title="ShareFly" src="/sharefly/" className="sharefly-frame" />
    </div>
  );
}
