import React, { useEffect, useState } from "react";

// Bouton discret pour installer CPwire sur l'écran d'accueil.
// Android/Chrome : utilise l'invite native. iPhone/Safari : affiche la marche à suivre.
export default function InstallPWA() {
  const [deferred, setDeferred] = useState(null);
  const [iosHelp, setIosHelp] = useState(false);

  const isStandalone =
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone)) || false;
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone) return null;            // déjà installée
  if (!deferred && !isIos) return null;     // navigateur sans installation possible

  const click = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      setDeferred(null);
    } else {
      setIosHelp((v) => !v);
    }
  };

  return (
    <>
      <button className="install-fab" onClick={click} aria-label="Installer l'application">
        ⬇ Installer l'appli
      </button>
      {iosHelp && (
        <div className="install-ios" onClick={() => setIosHelp(false)}>
          <div className="install-ios-box" onClick={(e) => e.stopPropagation()}>
            <b>Installer CPwire sur ton iPhone</b>
            <ol>
              <li>Appuie sur le bouton <b>Partager</b> <span aria-hidden>􀈂</span> (en bas de Safari).</li>
              <li>Choisis <b>« Sur l'écran d'accueil »</b>.</li>
              <li>Appuie sur <b>Ajouter</b> — l'icône Armonie apparaît sur ton écran.</li>
            </ol>
            <button className="btn-solid" onClick={() => setIosHelp(false)}>Compris</button>
          </div>
        </div>
      )}
    </>
  );
}
