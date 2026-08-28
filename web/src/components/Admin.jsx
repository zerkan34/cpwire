import React, { useEffect, useState, useCallback } from "react";
import { adminInvite, fetchAdminUsers, removeAdminUser, adminConfirmUser, dolibarrStatus, dolibarrProbe, importAnalyze, importApply, fetchHealth, getToken } from "../api.js";

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
  const [expApercu, setExpApercu] = useState(null);   // récapitulatif avant téléchargement
  const [expEtat, setExpEtat] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const [linkUntil, setLinkUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Options d'invitation
  const [unit, setUnit] = useState("days");      // "days" | "hours"
  const [amount, setAmount] = useState(14);
  const [indefinite, setIndefinite] = useState(false);
  const [asAdmin, setAsAdmin] = useState(false);
  const [dol, setDol] = useState(null);          // { configured, base }
  const [dolRes, setDolRes] = useState(null);     // résultat de la sonde
  const [dolBusy, setDolBusy] = useState(false);
  const [dolErr, setDolErr] = useState("");
  const [impFile, setImpFile] = useState(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impProp, setImpProp] = useState(null);
  const [impErr, setImpErr] = useState("");
  const [impDone, setImpDone] = useState("");
  const [health, setHealth] = useState(null); // { persistent, dataDir, authEnabled, jiraConfigured, ai }

  const load = useCallback(() => {
    fetchAdminUsers().then((r) => setUsers(r.users || [])).catch((e) => setErr(e.message || "Erreur")).finally(() => setLoading(false));
  }, []);
  // Rafraîchit la présence régulièrement (sans rien afficher à l'invité).
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);
  useEffect(() => { dolibarrStatus().then(setDol).catch(() => setDol({ configured: false })); }, []);
  useEffect(() => { fetchHealth().then(setHealth).catch(() => setHealth(null)); }, []);

  const probeDolibarr = async () => {
    setDolBusy(true); setDolErr(""); setDolRes(null);
    try { setDolRes(await dolibarrProbe()); }
    catch (e) {
      console.error("[Admin]", e && e.message ? e.message : e); setDolErr(e.message || "Erreur"); }
    finally { setDolBusy(false); }
  };

  const invite = async () => {
    setBusy(true); setErr(""); setCopied(false);
    try {
      const role = asAdmin ? "admin" : "consultation";
      const n = Math.max(1, Number(amount) || 1);
      const opts = indefinite ? { indefinite: true, role } : (unit === "hours" ? { hours: n, role } : { days: n, role });
      const r = await adminInvite(opts);
      const l = `${window.location.origin}/?invite=${encodeURIComponent(r.token)}`;
      setLink(l);
      setLinkUntil(r.indefinite ? "indéfiniment" : new Date(r.expiresAt).toLocaleDateString("fr-FR", { dateStyle: "long" }));
      try { await navigator.clipboard.writeText(l); setCopied(true); } catch { /* copie manuelle */ }
    } catch (e) {
      console.error("[Admin]", e && e.message ? e.message : e); setErr(e.message || "Erreur"); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* */ } };
  const revoke = async (email) => {
    if (!window.confirm(`Révoquer l'accès de ${email} ? La personne sera déconnectée immédiatement.`)) return;
    try { await removeAdminUser(email); load(); } catch (e) {
      console.error("[Admin]", e && e.message ? e.message : e); setErr(e.message || "Erreur"); }
  };

  const confirmUser = async (email) => {
    if (!window.confirm(`Valider manuellement le compte ${email} ? La personne pourra se connecter sans confirmer son e-mail.`)) return;
    try { await adminConfirmUser(email); load(); } catch (e) {
      console.error("[Admin]", e && e.message ? e.message : e); setErr(e.message || "Erreur"); }
  };

  const onPickImport = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setImpFile(f); setImpProp(null); setImpErr(""); setImpDone(""); setImpBusy(true);
    try { setImpProp(await importAnalyze(f)); }
    catch (e2) {
      console.error("[Admin]", e2 && e2.message ? e2.message : e2); setImpErr(e2.message || "Analyse impossible"); }
    finally { setImpBusy(false); }
  };
  const applyImport = async () => {
    if (!impProp || !impProp.proposal) return;
    setImpBusy(true); setImpErr("");
    try {
      await importApply({ filename: impProp.filename, proposal: impProp.proposal, apercu: impProp.apercu, dataset: impProp.dataset, diff: impProp.diff });
      setImpDone(impProp.dataset ? "Import validé — l'écran concerné est mis à jour ✓" : "Import validé et enregistré ✓"); setImpProp(null); setImpFile(null);
    } catch (e2) {
      console.error("[Admin]", e2 && e2.message ? e2.message : e2); setImpErr(e2.message || "Validation impossible"); }
    finally { setImpBusy(false); }
  };
  const cancelImport = () => { setImpProp(null); setImpFile(null); setImpErr(""); };

  return (
    <div className="adm">
      <div className="section-title">Administration — accès & présence</div>
      <p className="hint">
        Invitez un collègue : il recevra un lien, créera lui-même son email et son mot de passe, et n'aura accès qu'en
        <b> consultation</b> — aucun récap, aucun compte rendu, aucune modification.
      </p>

      {health && (
        <div className="panel adm-status">
          <h3>État du système</h3>
          <div className="adm-status-grid">
            <div className={`adm-status-i ${health.persistent ? "ok" : "warn"}`}>
              <span className="adm-status-dot" />
              <div>
                <b>{health.persistent ? "Mémoire durable active" : "Mémoire éphémère"}</b>
                <span>{health.persistent ? "Connaissance et sessions survivent aux redéploiements." : "Sans DATABASE_URL ni disque persistant : tout repart à zéro au prochain déploiement."}</span>
              </div>
            </div>
            <div className={`adm-status-i ${health.jiraConfigured ? "ok" : "warn"}`}>
              <span className="adm-status-dot" />
              <div><b>Jira</b><span>{health.jiraConfigured ? "Connecté" : "Non configuré"}</span></div>
            </div>
            <div className={`adm-status-i ${health.ai ? "ok" : "neutral"}`}>
              <span className="adm-status-dot" />
              <div><b>IA</b><span>{health.ai ? "Clé configurée" : "Mode gabarit (aucune clé)"}</span></div>
            </div>
            <div className={`adm-status-i ${health.authEnabled ? "ok" : "neutral"}`}>
              <span className="adm-status-dot" />
              <div><b>Authentification</b><span>{health.authEnabled ? "Active" : "Désactivée (accès direct)"}</span></div>
            </div>
          </div>
          {health.dataDir ? <p className="adm-status-dir">Données : <code>{health.dataDir}</code></p> : null}
        </div>
      )}

      {/* Export complet : une passation, un audit ou une sauvegarde avant
          manipulation risquée ne doivent pas exiger un accès à Render. */}
      <div className="panel adm-export">
        <h3>Exporter toutes les données</h3>
        <p className="adm-sub">
          Une archive ZIP contenant l&apos;intégralité des données de cp|WIRE : engagements,
          réunions et leurs transcriptions, plannings, mémoire, dossiers, comptes.
          En JSON brut, en CSV ouvrable dans Excel, et en fiches lisibles telles quelles.
        </p>
        <p className="adm-sub adm-export-note">
          L&apos;archive ne contient <b>aucun secret ni mot de passe</b>, même haché. Elle contient
          en revanche des comptes rendus et des données client : à traiter comme un document interne.
        </p>

        <div className="adm-export-btns">
          <button type="button" className="btn" disabled={expEtat === "apercu"} onClick={async () => {
            setExpEtat("apercu"); setExpApercu(null);
            try {
              const r = await fetch("/api/admin/export/apercu", { headers: { "x-access-token": getToken() } });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
              setExpApercu(d);
            } catch (e) { setExpApercu({ erreur: e.message }); }
            finally { setExpEtat(""); }
          }}>
            {expEtat === "apercu" ? "Analyse…" : "Voir ce que contient l'export"}
          </button>

          <button type="button" className="btn primary" disabled={expEtat === "zip"} onClick={async () => {
            setExpEtat("zip");
            try {
              // Le jeton voyage en en-tête : on ne peut donc pas se contenter d'un lien.
              // On récupère l'archive puis on déclenche l'enregistrement.
              const r = await fetch("/api/admin/export", { headers: { "x-access-token": getToken() } });
              if (!r.ok) throw new Error(`Erreur ${r.status}`);
              const blob = await r.blob();
              const nom = (r.headers.get("content-disposition") || "").match(/filename="?([^"]+)"?/)?.[1]
                || `cpwire-export-${new Date().toISOString().slice(0, 10)}.zip`;
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = nom;
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
            } catch (e) { setExpApercu({ erreur: "Export impossible : " + e.message }); }
            finally { setExpEtat(""); }
          }}>
            {expEtat === "zip" ? "Préparation de l'archive…" : "Télécharger l'archive ZIP"}
          </button>
        </div>

        {expApercu && (expApercu.erreur ? (
          <div className="adm-export-err">{expApercu.erreur}</div>
        ) : (
          <div className="adm-export-recap">
            <div className="adm-export-tot">
              {(expApercu.octets / 1024).toFixed(0)} Ko · {expApercu.fichiers} fichiers
            </div>
            <ul className="adm-export-list">
              {Object.entries(expApercu.contenu || {}).sort().map(([k, n]) => (
                <li key={k}><b>{k}</b><span>{n}</span></li>
              ))}
            </ul>
            {expApercu.persistance && !expApercu.persistance.baseDurable && (
              <p className="adm-export-warn">
                Base durable inactive : cet export reflète le contenu du dossier de données,
                qui peut être effacé au prochain redéploiement.
              </p>
            )}
            {(expApercu.absents || []).length > 0 && (
              <p className="adm-export-warn">
                Non repris : {expApercu.absents.map((a) => a.chemin).join(", ")}.
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="panel adm-invite">
        <h3>Inviter quelqu'un</h3>
        <p className="adm-sub">Génère un lien d'invitation. La personne l'ouvre, crée son email et son mot de passe.</p>

        <div className="adm-inv-opts">
          <div className="adm-opt-row">
            <span className="adm-opt-lbl">Durée d'accès</span>
            <div className={`adm-dur ${indefinite ? "off" : ""}`}>
              <input type="number" min="1" value={amount} disabled={indefinite}
                onChange={(e) => setAmount(e.target.value)} className="adm-num" />
              <div className="adm-seg">
                <button type="button" className={unit === "days" ? "on" : ""} disabled={indefinite} onClick={() => setUnit("days")}>jours</button>
                <button type="button" className={unit === "hours" ? "on" : ""} disabled={indefinite} onClick={() => setUnit("hours")}>heures</button>
              </div>
            </div>
            <label className="adm-check">
              <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} />
              <span>Indéfiniment</span>
            </label>
          </div>

          <div className="adm-opt-row">
            <span className="adm-opt-lbl">Niveau d'accès</span>
            <label className={`adm-toggle ${asAdmin ? "danger" : ""}`}>
              <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
              <span>Administrateur — droits complets (comme moi)</span>
            </label>
          </div>
          {asAdmin && <p className="adm-warn">⚠️ Cette personne pourra tout faire : récaps, comptes rendus, modifications, et inviter/révoquer d'autres comptes.</p>}
          {!asAdmin && <p className="adm-sub" style={{ margin: "2px 0 0" }}>Accès en <b>consultation</b> : lecture seule, sans récap ni compte rendu.</p>}
        </div>

        <button className="btn cn-save" onClick={invite} disabled={busy} style={{ marginTop: 14 }}>{busy ? "Génération…" : "Générer le lien d'invitation"}</button>
        {link && (
          <div className="adm-link">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn cn-ghost" onClick={copy}>{copied ? "Copié ✓" : "Copier"}</button>
            <span className="adm-link-meta">{asAdmin ? "Administrateur" : "Consultation"} · valable {linkUntil}</span>
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>Comptes & présence</div>
      <p className="hint">Vous voyez ici qui a un accès et qui est connecté en ce moment. L'information n'est visible que par vous.</p>
      {loading ? <div className="empty">Chargement…</div> : (
        <div className="adm-table-wrap">
          <table className="cpw-tbl data adm-table">
            <thead><tr><th>Personne</th><th>Rôle</th><th>État</th><th>Dernière activité</th><th></th></tr></thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={5} className="adm-muted">Aucun compte invité pour l'instant.</td></tr>}
              {users.map((u) => (
                <tr key={u.email}>
                  <td><b>{u.email}</b>{u.confirmed === false && <span className="adm-pending" style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--amber)", background: "rgba(176,116,35,.12)", border: "1px solid var(--amber)", borderRadius: 999, padding: "1px 8px" }}>En attente d'e-mail</span>}</td>
                  <td>{u.role === "admin" ? <span className="adm-role-admin">Administrateur</span> : "Consultation"}</td>
                  <td>{u.online ? <span className="adm-on">● En ligne</span> : <span className="adm-off">○ Hors ligne</span>}</td>
                  <td>{u.online ? "maintenant" : sinceLabel(u.lastSeen)}</td>
                  <td className="r">
                    {u.confirmed === false && <button className="adm-revoke" style={{ marginRight: 8, color: "#2F7D4F", borderColor: "#2F7D4F" }} onClick={() => confirmUser(u.email)}>Confirmer</button>}
                    <button className="adm-revoke" onClick={() => revoke(u.email)}>Révoquer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {err && <p className="cn-err">{err}</p>}

      <div className="section-title" style={{ marginTop: 28 }}>Importer un document</div>
      <div className="imp-card">
        <p className="hint" style={{ marginTop: 0 }}>
          Dépose un fichier depuis ton ordinateur (CSV, TSV, TXT, JSON, MD). L'IA reconnaît ce que c'est et
          propose ce que ça mettrait à jour. <b>Rien n'est appliqué sans ta validation</b> — aucune écriture silencieuse.
        </p>
        <div className="imp-pickrow">
          <label className={`btn cn-save imp-pick ${impBusy ? "is-busy" : ""}`}>
            {impBusy && !impProp ? "Analyse en cours…" : "Choisir un fichier…"}
            <input type="file" accept=".csv,.tsv,.txt,.json,.md,.log" style={{ display: "none" }} onChange={onPickImport} disabled={impBusy} />
          </label>
          {impFile ? <span className="imp-fname">{impFile.name}</span> : null}
        </div>
        {impErr ? <p className="cn-err">{impErr}</p> : null}
        {impDone ? <p className="imp-done">{impDone}</p> : null}
        {impProp && impProp.proposal ? (
          <div className="imp-prop">
            <div className="imp-prop-h">
              Proposition de l'IA
              <span className={`imp-conf c-${impProp.proposal.confiance || "faible"}`}>confiance {impProp.proposal.confiance || "?"}</span>
            </div>
            <table className="imp-prop-t"><tbody>
              <tr><th>Type</th><td>{impProp.proposal.type || "—"}</td></tr>
              <tr><th>Client</th><td>{impProp.proposal.client || "indéterminé"}</td></tr>
              <tr><th>Mettrait à jour</th><td>{impProp.proposal.cible || "—"}</td></tr>
              <tr><th>Résumé</th><td>{impProp.proposal.resume || "—"}</td></tr>
            </tbody></table>
            {Array.isArray(impProp.proposal.details) && impProp.proposal.details.length ? (
              <ul className="imp-details">{impProp.proposal.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
            ) : null}
            {impProp.diff && !impProp.diff.premiereFois ? (
              <div className="imp-diff">
                <div className="imp-diff-row">
                  <span className="imp-diff-pill add">+{impProp.diff.added} ajouté{impProp.diff.added > 1 ? "s" : ""}</span>
                  <span className="imp-diff-pill mod">~{impProp.diff.modified} modifié{impProp.diff.modified > 1 ? "s" : ""}</span>
                  <span className="imp-diff-pill del">−{impProp.diff.removed} supprimé{impProp.diff.removed > 1 ? "s" : ""}</span>
                </div>
                {Array.isArray(impProp.diff.sample) && impProp.diff.sample.length ? (
                  <ul className="imp-diff-list">
                    {impProp.diff.sample.map((s, i) => (
                      <li key={i} className={s.kind === "ajout" ? "add" : "mod"}><b>{s.kind === "ajout" ? "+" : "~"}</b> {s.nom}{s.dossier ? <span className="imp-diff-d"> · {s.dossier}</span> : null}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {impProp.diff && impProp.diff.premiereFois ? (
              <p className="imp-diff-first">Premier dépôt : {impProp.diff.total} éléments enregistrés comme référence. Les prochains imports n'afficheront que les changements.</p>
            ) : null}
            <p className="imp-meta">{impProp.lignes} ligne(s) · {impProp.chars} caractères analysés</p>
            <div className="imp-actions">
              <button className="btn cn-save" onClick={applyImport} disabled={impBusy}>{impBusy ? "Validation…" : "Valider la mise à jour"}</button>
              <button className="btn cn-ghost" onClick={cancelImport} disabled={impBusy}>Annuler</button>
            </div>
          </div>
        ) : null}
      </div>

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
