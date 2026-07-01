import React, { useState } from "react";
import { login, loginGuest } from "../api.js";

export default function Login({ onSuccess, invite }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { const d = await login(email.trim(), password); onSuccess(d); }
    catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  // Connexion invité : on enregistre le jeton du lien et on entre en lecture seule.
  const enterGuest = () => {
    setBusy(true); setErr("");
    try { loginGuest(invite); onSuccess({ role: "guest" }); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };

  // --- Mode invité : un seul bouton, pas de mot de passe ---
  if (invite) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo"><img src="/cpwire-logo.png" alt="CPwire" /></div>
          <div className="login-tag">Cockpit de pilotage · chef de projet</div>
          <div className="invite-note">
            <span className="invite-badge">Accès invité · lecture seule</span>
            Vous avez été invité à consulter le cockpit. Vous pourrez tout voir, générer des comptes rendus
            et exporter, mais rien modifier ni supprimer.
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
