import React, { useState } from "react";
import { login } from "../api.js";

export default function Login({ onSuccess }) {
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
