import React, { useState } from "react";
import { login, loginGuest, claimAccount } from "../api.js";
import CockpitSky from "./CockpitSky.jsx";
import { PILOT_DATA_URI } from "../pilot.js";
import natachaWink from "../assets/natacha-wink.png";

// Habillage commun : fond cockpit animé + accueil Natacha + carte en verre.
function LoginShell({ children }) {
  return (
    <div className="login-screen login-sky">
      <CockpitSky />
      <div className="login-card">
        <div className="login-nat">
          <div className="login-nat-ava" aria-hidden="true">
            <img src={PILOT_DATA_URI} alt="Natacha" draggable="false" />
            <img className="login-nat-wink" src={natachaWink} alt="" draggable="false" />
          </div>
          <div className="login-nat-hello">
            <b>Bonjour, je suis Natacha</b>
            <span>votre hôtesse de bord — connectez-vous pour décoller ✈</span>
          </div>
        </div>
        <div className="login-brand"><img src="/cpwire-logo.png" alt="cp|WIRE" /></div>
        <div className="login-tag">Cockpit de pilotage · chef de projet</div>
        {children}
      </div>
    </div>
  );
}

export default function Login({ onSuccess, invite }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { const d = await login(email.trim(), password); onSuccess(d); }
    catch (e2) { console.error("[Login]", e2 && e2.message ? e2.message : e2); setErr(e2.message); }
    finally { setBusy(false); }
  };

  const enterGuest = () => {
    setBusy(true); setErr("");
    try { loginGuest(invite); onSuccess({ role: "guest" }); }
    catch (e2) { console.error("[Login]", e2 && e2.message ? e2.message : e2); setErr(e2.message); setBusy(false); }
  };

  const activate = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const d = await claimAccount(invite, email.trim(), password);
      if (d && d.pending) { setNotice(d.message || "Compte créé. Confirmez votre e-mail pour activer l'accès."); setBusy(false); }
      else onSuccess(d);
    }
    catch (e2) { console.error("[Login]", e2 && e2.message ? e2.message : e2); setErr(e2.message); setBusy(false); }
  };

  const isAccountInvite = invite && invite.startsWith("i.");
  const isGuestInvite = invite && invite.startsWith("g.");

  // Compte créé : message « confirmez votre e-mail ».
  if (isAccountInvite && notice) {
    return (
      <LoginShell>
        <div className="invite-note" style={{ textAlign: "center" }}>
          <span className="invite-badge">Vérifiez votre e-mail</span>
          {notice}
        </div>
        <div className="login-foot">Armonie Group · accès consultation</div>
      </LoginShell>
    );
  }

  // Activation d'un compte (invitation « consultation »).
  if (isAccountInvite) {
    return (
      <LoginShell>
        <form onSubmit={activate}>
          <div className="invite-note">
            <span className="invite-badge">Activation de votre accès</span>
            Vous avez été invité à consulter le cockpit. Choisissez votre email et un mot de passe : ils vous serviront à vous reconnecter.
          </div>
          <div className="field">
            <label>Votre email</label>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@armonie.group" required />
          </div>
          <div className="field">
            <label>Choisir un mot de passe</label>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="10 caractères minimum" required minLength={10} />
          </div>
          <button className="btn-solid login-go" disabled={busy}>{busy ? "Activation…" : "Activer mon accès"}</button>
          {err && <div className="warn-note">{err}</div>}
        </form>
        <div className="login-foot">Armonie Group · accès consultation</div>
      </LoginShell>
    );
  }

  // Ancien lien invité lecture seule (« g. »).
  if (isGuestInvite) {
    return (
      <LoginShell>
        <div className="invite-note">
          <span className="invite-badge">Accès invité · lecture seule</span>
          Vous avez été invité à consulter le cockpit. Vous pourrez tout voir et exporter, mais rien modifier.
        </div>
        <button className="btn-solid login-go" disabled={busy} onClick={enterGuest}>{busy ? "Connexion…" : "Se connecter"}</button>
        {err && <div className="warn-note">{err}</div>}
        <div className="login-foot">Armonie Group · accès en lecture seule</div>
      </LoginShell>
    );
  }

  // Mode normal : identifiant + mot de passe.
  return (
    <LoginShell>
      <form onSubmit={submit}>
        <div className="field">
          <label>Identifiant</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" required />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <button className="btn-solid login-go" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
        {err && <div className="warn-note">{err}</div>}
      </form>
      <div className="login-foot">Armonie Group · accès réservé</div>
    </LoginShell>
  );
}
