import React, { useEffect, useState, useCallback } from "react";
import { adminInvite, fetchAdminUsers, removeAdminUser, dolibarrStatus, dolibarrProbe } from "../api.js";

const sinceLabel = (ts) => {
  if (!ts) return "jamais connecté";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
};

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [linkUntil, setLinkUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dol, setDol] = useState(null);          // { configured, base }
  const [dolRes, setDolRes] = useState(null);     // résultat de la sonde
  const [dolBusy, setDolBusy] = useState(false);
  const [dolErr, setDolErr] = useState("");

  const load = useCallback(() => {
    fetchAdminUsers().then((r) => setUsers(r.users || [])).catch((e) => setErr(e.message || "Erreur")).finally(() => setLoading(false));
  }, []);
  // Rafraîchit la présence régulièrement (sans rien afficher à l'invité).
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);
  useEffect(() => { dolibarrStatus().then(setDol).catch(() => setDol({ configured: false })); }, []);

  const probeDolibarr = async () => {
    setDolBusy(true); setDolErr(""); setDolRes(null);
    try { setDolRes(await dolibarrProbe()); }
    catch (e) { setDolErr(e.message || "Erreur"); }
    finally { setDolBusy(false); }
  };

  const invite = async () => {
    setBusy(true); setErr(""); setCopied(false);
    try {
      const r = await adminInvite(14);
      const l = `${window.location.origin}/?invite=${encodeURIComponent(r.token)}`;
      setLink(l);
      setLinkUntil(new Date(r.expiresAt).toLocaleDateString("fr-FR", { dateStyle: "long" }));
      try { await navigator.clipboard.writeText(l); setCopied(true); } catch { /* copie manuelle */ }
    } catch (e) { setErr(e.message || "Erreur"); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* */ } };
  const revoke = async (email) => {
    if (!window.confirm(`Révoquer l'accès de ${email} ? La personne sera déconnectée immédiatement.`)) return;
    try { await removeAdminUser(email); load(); } catch (e) { setErr(e.message || "Erreur"); }
  };

  return (
    <div className="adm">
      <div className="section-title">Administration — accès & présence</div>
      <p className="hint">
        Invitez un collègue : il recevra un lien, créera lui-même son email et son mot de passe, et n'aura accès qu'en
        <b> consultation</b> — aucun récap, aucun compte rendu, aucune modification.
      </p>

      <div className="panel adm-invite">
        <h3>Inviter quelqu'un</h3>
        <p className="adm-sub">Génère un lien d'invitation valable 14 jours. Copiez-le et envoyez-le à la personne.</p>
        <button className="btn cn-save" onClick={invite} disabled={busy}>{busy ? "Génération…" : "Générer un lien d'invitation"}</button>
        {link && (
          <div className="adm-link">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn cn-ghost" onClick={copy}>{copied ? "Copié ✓" : "Copier"}</button>
            <span className="adm-link-meta">Valable jusqu'au {linkUntil}</span>
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>Comptes & présence</div>
      <p className="hint">Vous voyez ici qui a un accès et qui est connecté en ce moment. L'information n'est visible que par vous.</p>
      {loading ? <div className="empty">Chargement…</div> : (
        <div className="adm-table-wrap">
          <table className="data adm-table">
            <thead><tr><th>Personne</th><th>Rôle</th><th>État</th><th>Dernière activité</th><th></th></tr></thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={5} className="adm-muted">Aucun compte invité pour l'instant.</td></tr>}
              {users.map((u) => (
                <tr key={u.email}>
                  <td><b>{u.email}</b></td>
                  <td>Consultation</td>
                  <td>{u.online ? <span className="adm-on">● En ligne</span> : <span className="adm-off">○ Hors ligne</span>}</td>
                  <td>{u.online ? "maintenant" : sinceLabel(u.lastSeen)}</td>
                  <td className="r"><button className="adm-revoke" onClick={() => revoke(u.email)}>Révoquer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {err && <p className="cn-err">{err}</p>}

      <div className="section-title" style={{ marginTop: 28 }}>Connecteur Dolibarr (lecture seule)</div>
      <p className="hint">
        Branche cp|WIRE sur ton Dolibarr pour récupérer clients, contrats, factures et projets.
        Configure <b>DOLIBARR_URL</b> et <b>DOLIBARR_API_KEY</b> côté Render, puis teste ci-dessous.
        Cette sonde ne lit que des <b>noms de champs</b> — aucune valeur client ne quitte ton instance.
      </p>
      <div className="panel">
        <div className="dol-state">
          {dol == null ? <span className="adm-muted">Vérification…</span>
            : dol.configured
              ? <><span className="adm-on">● Configuré</span><span className="adm-link-meta"> {dol.base}</span></>
              : <span className="adm-off">○ Non configuré — ajoute DOLIBARR_URL et DOLIBARR_API_KEY dans Render</span>}
        </div>
        <button className="btn cn-save" style={{ marginTop: 12 }} onClick={probeDolibarr} disabled={dolBusy || !(dol && dol.configured)}>
          {dolBusy ? "Test en cours…" : "Tester la connexion & découvrir les modules"}
        </button>
        {dolErr && <p className="cn-err">{dolErr}</p>}
        {dolRes && dolRes.modules && (
          <div className="dol-mods">
            {dolRes.modules.map((m) => (
              <div key={m.module} className={`dol-mod ${m.ok ? "ok" : "ko"}`}>
                <div className="dol-mod-hd">
                  <span className="dol-mod-name">{m.label}</span>
                  {m.ok
                    ? <span className="dol-badge on">{m.hasData ? "données présentes" : "vide"}</span>
                    : <span className="dol-badge off">erreur</span>}
                </div>
                {m.ok && m.sampleFields && m.sampleFields.length > 0 && (
                  <div className="dol-fields">{m.sampleFields.map((c) => <span key={c} className="dol-f">{c}</span>)}</div>
                )}
                {!m.ok && <div className="dol-mod-err">{m.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
