import React, { useEffect, useState } from "react";
import { applyUpdate, promptInstall, isStandalone } from "../pwa.js";

// Couche PWA de cp|WIRE (montée une fois) :
//  - bandeau « Nouvelle version » avec mise à jour en un clic ;
//  - carte d'installation discrète (Android/Chrome/Edge) + aide iOS ;
//  - pastille « Hors-ligne ».
// Tout est à la charte Armonie et respecte les zones sûres (encoche mobile).

const HIDE_KEY = "cpwire_pwa_install_hide";
const HIDE_DAYS = 14;

function injectCss() {
  if (document.getElementById("cpw-pwa-css")) return;
  const s = document.createElement("style");
  s.id = "cpw-pwa-css";
  s.textContent = `
  @keyframes cpwPwaUp{from{transform:translate(-50%,140%);opacity:0}to{transform:translate(-50%,0);opacity:1}}
  @keyframes cpwPwaCard{from{transform:translateY(140%);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes cpwPwaPulse{0%,100%{opacity:1}50%{opacity:.35}}
  .pwa-update{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);
    z-index:2147483600;display:flex;align-items:center;gap:14px;max-width:min(540px,94vw);
    padding:11px 12px 11px 18px;border-radius:14px;color:#fff;font-family:Inter,system-ui,Arial,sans-serif;
    background:var(--hd-logo);box-shadow:0 16px 44px rgba(31,27,51,.42);
    animation:cpwPwaUp .34s cubic-bezier(.2,.9,.3,1.2)}
  .pwa-update .dot{width:8px;height:8px;border-radius:50%;background:#E6B85C;flex:none;animation:cpwPwaPulse 1.6s ease-in-out infinite}
  .pwa-update .tx{font-size:13.5px;font-weight:600;line-height:1.25;flex:1}
  .pwa-update .tx small{display:block;font-weight:500;color:rgba(255,255,255,.72);font-size:11.5px;margin-top:1px}
  .pwa-update .go{flex:none;border:0;cursor:pointer;font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:13px;
    color:var(--indigo);background:linear-gradient(180deg,#E6B85C,#C99A3F);padding:9px 16px;border-radius:10px}
  .pwa-update .go:hover{filter:brightness(1.05)}
  .pwa-update .x{flex:none;width:30px;height:30px;border:0;border-radius:9px;cursor:pointer;font-size:17px;line-height:1;
    color:rgba(255,255,255,.8);background:rgba(255,255,255,.12)}
  .pwa-update .x:hover{background:rgba(255,255,255,.2)}

  .pwa-install{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));
    z-index:2147483590;width:min(360px,calc(100vw - 28px));background:#fff;border:1px solid #E7E5F1;border-radius:16px;
    box-shadow:0 20px 56px rgba(31,27,51,.20);font-family:Inter,system-ui,Arial,sans-serif;color:#1F1B33;overflow:hidden;
    animation:cpwPwaCard .34s cubic-bezier(.2,.9,.3,1.2)}
  .pwa-install .top{height:4px;background:var(--hd-logo)}
  .pwa-install .bd{padding:15px 17px 16px;display:flex;gap:13px}
  .pwa-install .mk{flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;
    background:var(--hd-logo);color:#fff;font-family:Poppins,Inter,sans-serif;font-weight:800;font-size:13px;letter-spacing:.3px}
  .pwa-install .cn{flex:1;min-width:0}
  .pwa-install .t{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:15px;color:var(--indigo);margin:1px 0 3px}
  .pwa-install .s{font-size:12.5px;color:#6E6A86;line-height:1.5;margin:0 0 12px}
  .pwa-install .row{display:flex;gap:9px}
  .pwa-install .pri{flex:none;border:0;cursor:pointer;font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:13px;
    color:var(--indigo);background:linear-gradient(180deg,#E6B85C,#C99A3F);padding:9px 16px;border-radius:10px}
  .pwa-install .pri:hover{filter:brightness(1.05)}
  .pwa-install .sec{flex:none;border:0;cursor:pointer;font-size:13px;font-weight:600;color:#6E6A86;background:transparent;padding:9px 10px;border-radius:10px}
  .pwa-install .sec:hover{background:var(--purple-soft);color:var(--indigo)}

  .pwa-ios{position:fixed;inset:0;z-index:2147483610;display:flex;align-items:flex-end;justify-content:center;
    background:rgba(31,27,51,.5);backdrop-filter:blur(2px);padding:0 12px env(safe-area-inset-bottom)}
  .pwa-ios-box{background:#fff;border-radius:18px 18px 14px 14px;max-width:440px;width:100%;margin-bottom:14px;
    padding:20px 20px 18px;font-family:Inter,system-ui,Arial,sans-serif;color:#1F1B33;box-shadow:0 -10px 50px rgba(31,27,51,.3)}
  .pwa-ios-box b.h{display:block;font-family:Poppins,Inter,sans-serif;font-size:16px;color:var(--indigo);margin-bottom:10px}
  .pwa-ios-box ol{margin:0 0 14px;padding-left:20px;font-size:13.5px;line-height:1.7;color:#3a3553}
  .pwa-ios-box .pri{border:0;cursor:pointer;width:100%;font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:14px;
    color:#fff;background:var(--hd-logo);padding:11px;border-radius:11px}

  .pwa-offline{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));
    z-index:2147483580;display:flex;align-items:center;gap:7px;background:#FBEFE0;color:#A85A1A;border:1px solid #F0D8BE;
    font-family:Inter,system-ui,Arial,sans-serif;font-size:12px;font-weight:600;padding:7px 12px;border-radius:99px;box-shadow:0 6px 20px rgba(31,27,51,.12)}
  .pwa-offline .d{width:7px;height:7px;border-radius:50%;background:#C2691A}
  @media (max-width:560px){ .pwa-install{left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));width:auto} }
  `;
  document.head.appendChild(s);
}

const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const installRecentlyHidden = () => {
  try {
    const t = Number(localStorage.getItem(HIDE_KEY) || 0);
    return t && (Date.now() - t < HIDE_DAYS * 86400000);
  } catch { return false; }
};

export default function InstallPWA() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updateHidden, setUpdateHidden] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [installHidden, setInstallHidden] = useState(installRecentlyHidden());
  const [iosOpen, setIosOpen] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    injectCss();
    const onUpd = () => setUpdateReady(true);
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => { setInstallable(false); try { localStorage.setItem(HIDE_KEY, String(Date.now())); } catch {} };
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("pwa:updateready", onUpd);
    window.addEventListener("pwa:installable", onInstallable);
    window.addEventListener("pwa:installed", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("pwa:updateready", onUpd);
      window.removeEventListener("pwa:installable", onInstallable);
      window.removeEventListener("pwa:installed", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const standalone = isStandalone();
  const ios = isIos();

  const dismissInstall = () => { setInstallHidden(true); try { localStorage.setItem(HIDE_KEY, String(Date.now())); } catch {} };
  const doInstall = async () => { const ok = await promptInstall(); if (!ok && ios) setIosOpen(true); };

  // La carte d'installation : Android/Chrome (invite native) OU iPhone (aide manuelle),
  // jamais si déjà installée, récemment masquée, ou si le bandeau de MAJ est affiché.
  const showInstall = !standalone && !installHidden && (installable || ios) && !(updateReady && !updateHidden);

  return (
    <>
      {offline && (
        <div className="pwa-offline" role="status"><span className="d" />Hors-ligne — les données ne se rafraîchissent pas</div>
      )}

      {updateReady && !updateHidden && (
        <div className="pwa-update" role="status">
          <span className="dot" />
          <span className="tx">Nouvelle version disponible<small>Actualisez pour en profiter — vos données sont conservées.</small></span>
          <button className="go" onClick={() => applyUpdate()}>Actualiser</button>
          <button className="x" aria-label="Plus tard" title="Plus tard" onClick={() => setUpdateHidden(true)}>×</button>
        </div>
      )}

      {showInstall && !iosOpen && (
        <div className="pwa-install" role="dialog" aria-label="Installer cp|WIRE">
          <div className="top" />
          <div className="bd">
            <div className="mk">cp|W</div>
            <div className="cn">
              <div className="t">Installer cp|WIRE</div>
              <p className="s">Accès direct depuis le bureau, en plein écran, et consultable même hors-ligne.</p>
              <div className="row">
                <button className="pri" onClick={doInstall}>Installer</button>
                <button className="sec" onClick={dismissInstall}>Plus tard</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {iosOpen && (
        <div className="pwa-ios" onClick={() => setIosOpen(false)}>
          <div className="pwa-ios-box" onClick={(e) => e.stopPropagation()}>
            <b className="h">Installer cp|WIRE sur votre iPhone</b>
            <ol>
              <li>Touchez le bouton <b>Partager</b> dans la barre de Safari.</li>
              <li>Choisissez <b>« Sur l'écran d'accueil »</b>.</li>
              <li>Touchez <b>Ajouter</b> — l'icône apparaît sur votre écran.</li>
            </ol>
            <button className="pri" onClick={() => { setIosOpen(false); dismissInstall(); }}>Compris</button>
          </div>
        </div>
      )}
    </>
  );
}
