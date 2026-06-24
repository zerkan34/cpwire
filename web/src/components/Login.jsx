import React, { useState } from "react";
import { login, loginGuest, claimAccount } from "../api.js";

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
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  // Connexion invité (ancien lien lecture seule "g.") : on enregistre le jeton et on entre en lecture seule.
  const enterGuest = () => {
    setBusy(true); setErr("");
    try { loginGuest(invite); onSuccess({ role: "guest" }); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };

  // Activation d'un compte consultation (lien "i.") : la personne choisit son email + mot de passe.
  const activate = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const d = await claimAccount(invite, email.trim(), password);
      if (d && d.pending) { setNotice(d.message || "Compte créé. Confirmez votre e-mail pour activer l'accès."); setBusy(false); }
      else onSuccess(d);
    }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };

  const isAccountInvite = invite && invite.startsWith("i.");
  const isGuestInvite = invite && invite.startsWith("g.");

  // Compte créé : on affiche le message « confirmez votre e-mail » (pas de connexion tant que non confirmé).
  if (isAccountInvite && notice) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo"><img src="/cpwire-logo.png" alt="CPwire" /></div>
          <div className="login-tag">Cockpit de pilotage · chef de projet</div>
          <div className="invite-note" style={{ textAlign: "center" }}>
            <span className="invite-badge">Vérifiez votre e-mail</span>
            {notice}
          </div>
        </div>
      </div>
    );
  }

  // --- Activation d'un compte (lien d'invitation "consultation") ---
  if (isAccountInvite) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={activate}>
          <div className="login-logo"><img src="/cpwire-logo.png" alt="CPwire" /></div>
          <div className="login-tag">Cockpit de pilotage · chef de projet</div>
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
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum" required minLength={6} />
          </div>
          <button className="btn-solid" style={{ width: "100%", padding: "12px" }} disabled={busy}>
            {busy ? "Activation…" : "Activer mon accès"}
          </button>
          {err && <div className="warn-note">{err}</div>}
          <div className="login-foot">Armonie Group · accès consultation</div>
        </form>
      </div>
    );
  }

  // --- Ancien lien invité lecture seule ("g.") : un seul bouton ---
  if (isGuestInvite) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo"><img src="/cpwire-logo.png" alt="CPwire" /></div>
          <div className="login-tag">Cockpit de pilotage · chef de projet</div>
          <div className="invite-note">
            <span className="invite-badge">Accès invité · lecture seule</span>
            Vous avez été invité à consulter le cockpit. Vous pourrez tout voir et exporter, mais rien modifier.
          </div>
          <button className="btn-solid" style={{ width: "100%", padding: "12px" }} disabled={busy} onClick={enterGuest}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
          {err && <div className="warn-note">{err}</div>}
          <div className="login-foot">Armonie Group · accès en lecture seule</div>
        </div>
      </div>
    );
  }

  // --- Mode normal : identifiant + mot de passe ---
  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><img src="/cpwire-logo.png" alt="CPwire" /></div>
        <div className="login-tag">Cockpit de pilotage · chef de projet</div>
        <div className="field">
          <label>Identifiant</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" required />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <button className="btn-solid" style={{ width: "100%", padding: "12px" }} disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        {err && <div className="warn-note">{err}</div>}
        <div className="login-foot">Armonie Group · accès réservé</div>
      </form>
    </div>
  );
}
