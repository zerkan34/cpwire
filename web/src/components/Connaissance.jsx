import React, { useEffect, useMemo, useState } from "react";
import { fetchConnaissance, saveConnaissance, learnConnaissance } from "../api.js";
import { RefState } from "./RefState.jsx";

const arrToText = (a) => (Array.isArray(a) ? a.join("\n") : "");
const textToArr = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const glossToText = (a) => (Array.isArray(a) ? a.map((g) => `${g.terme}${g.sens ? " = " + g.sens : ""}`).join("\n") : "");
const textToGloss = (s) => String(s || "").split("\n").map((l) => {
  const i = l.indexOf("=");
  return i < 0 ? { terme: l.trim(), sens: "" } : { terme: l.slice(0, i).trim(), sens: l.slice(i + 1).trim() };
}).filter((g) => g.terme);

export default function Connaissance() {
  const [k, setK] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [learning, setLearning] = useState(false);
  const [nonce, setNonce] = useState(0);
  const retry = () => { setErr(""); setLoading(true); setNonce((n) => n + 1); };

  const [conv, setConv] = useState("");
  const [glossG, setGlossG] = useState("");
  const [sel, setSel] = useState(null);
  const [ctx, setCtx] = useState({});
  const [att, setAtt] = useState({});
  const [notes, setNotes] = useState({});
  const [glossC, setGlossC] = useState({});

  useEffect(() => {
    let alive = true; setLoading(true); setErr("");
    fetchConnaissance()
      .then((d) => {
        if (!alive) return;
        setK(d);
        setConv(arrToText(d.global?.conventions));
        setGlossG(glossToText(d.global?.glossaire));
        const keys = Object.keys(d.clients || {});
        const c = {}, a = {}, n = {}, g = {};
        keys.forEach((key) => { const cl = d.clients[key] || {}; c[key] = cl.contexte || ""; a[key] = arrToText(cl.attentes); n[key] = arrToText(cl.notes); g[key] = glossToText(cl.glossaire); });
        setCtx(c); setAtt(a); setNotes(n); setGlossC(g);
        setSel(keys[0] || null);
      })
      .catch((e) => { if (alive) setErr(e.message || "Erreur"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [nonce]);

  const clientKeys = useMemo(() => (k ? Object.keys(k.clients || {}) : []), [k]);

  const buildPayload = () => ({
    global: { conventions: textToArr(conv), glossaire: textToGloss(glossG) },
    clients: Object.fromEntries(clientKeys.map((key) => [key, {
      contexte: ctx[key] || "",
      attentes: textToArr(att[key]),
      notes: textToArr(notes[key]),
      glossaire: textToGloss(glossC[key]),
    }])),
  });

  const onSave = async () => {
    setSaving(true); setMsg(""); setErr("");
    try { await saveConnaissance(buildPayload()); setMsg("Mémoire enregistrée. L'assistant en tient compte dès le prochain rapport."); }
    catch (e) { setErr(e.message || "Échec de l'enregistrement"); }
    finally { setSaving(false); }
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "connaissance.json"; a.click();
    URL.revokeObjectURL(url);
  };

  // Déclenche l'apprentissage IA tout de suite (sinon il tourne seul en tâche de fond).
  const onLearn = async () => {
    setLearning(true); setMsg(""); setErr("");
    try {
      const r = await learnConnaissance();
      if (r.connaissance) setK(r.connaissance);
      const n = (r.learned || []).length;
      setMsg(n ? `Mémoire enrichie automatiquement pour ${n} client${n > 1 ? "s" : ""}.` : "Apprentissage à jour (rien de neuf à analyser).");
    } catch (e) { setErr(e.message || "Apprentissage impossible"); }
    finally { setLearning(false); }
  };

  const fmtAt = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } };

  if (loading) return <RefState kind="load" title="Chargement de la mémoire d'équipe…" message="Récupération des conventions, du glossaire et du contexte appris par l'IA." />;
  if (err && !k) return <RefState kind="err" title="La mémoire n'a pas pu se charger" message="La base de connaissance est momentanément indisponible. Réessayez dans un instant." detail={err} onRetry={retry} />;
  if (!k) return null;

  return (
    <div className="cn">
      <div className="section-title">Mémoire d'équipe — ce que l'assistant sait de votre façon de travailler</div>
      <p className="hint">
        Tout ce qui est ici est relu par l'IA à chaque rapport. Plus vous l'enrichissez, plus les comptes rendus collent à vos usages.
        Astuce : une ligne par règle. Glossaire : « terme = définition » par ligne.
      </p>

      <div className="cn-warn">
        Pour rendre des ajouts <b>permanents</b> : cliquez <b>Exporter</b>, puis remplacez <code>server/data/connaissance.json</code> dans le dépôt — l'application le recharge automatiquement au déploiement suivant. Avec un disque persistant <code>DATA_DIR</code>, la sauvegarde est immédiate et rien n'est à faire.
      </div>

      <div className="panel cn-block">
        <h3>Conventions générales</h3>
        <textarea className="cn-ta" rows={6} value={conv} onChange={(e) => setConv(e.target.value)} placeholder="Une règle par ligne…" />
        <h3>Glossaire général</h3>
        <textarea className="cn-ta" rows={5} value={glossG} onChange={(e) => setGlossG(e.target.value)} placeholder="terme = définition (une par ligne)" />
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>Par client</div>
      <p className="hint" style={{ marginTop: -6 }}>
        En plus de ce que vous écrivez, l'IA <b>apprend toute seule</b> : elle observe l'activité Jira de chaque client et met à jour un « contexte observé » (bloc 🤖 plus bas), automatiquement et en tâche de fond. Vous n'avez rien à faire.
      </p>
      <div className="enc-toggle cn-clients" role="tablist">
        {clientKeys.map((key) => (
          <button key={key} className={`enc-tg ${sel === key ? "on" : ""}`} onClick={() => setSel(key)}>{key}</button>
        ))}
      </div>

      {sel && (
        <div className="panel cn-block">
          <h3>{sel} — contexte</h3>
          <textarea className="cn-ta" rows={3} value={ctx[sel] || ""} onChange={(e) => setCtx((p) => ({ ...p, [sel]: e.target.value }))} placeholder="En une phrase : qui est ce client, quelle application…" />
          <h3>Attentes (livrables, SLA, exigences)</h3>
          <textarea className="cn-ta" rows={4} value={att[sel] || ""} onChange={(e) => setAtt((p) => ({ ...p, [sel]: e.target.value }))} placeholder="Une attente par ligne…" />
          <h3>Vocabulaire propre au client</h3>
          <textarea className="cn-ta" rows={3} value={glossC[sel] || ""} onChange={(e) => setGlossC((p) => ({ ...p, [sel]: e.target.value }))} placeholder="terme = définition (une par ligne)" />
          <h3>Notes / consignes</h3>
          <textarea className="cn-ta" rows={4} value={notes[sel] || ""} onChange={(e) => setNotes((p) => ({ ...p, [sel]: e.target.value }))} placeholder="Tout ce que l'assistant doit garder en tête pour ce client…" />
          {k.clients[sel]?.auto?.points?.length > 0 && (
            <div className="cn-auto">
              <h3>🤖 Appris automatiquement par l'IA <span className="cn-auto-meta">— mis à jour le {fmtAt(k.clients[sel].auto.at)}</span></h3>
              <ul className="cn-auto-list">
                {k.clients[sel].auto.points.map((p, idx) => <li key={idx}>{p}</li>)}
              </ul>
              <p className="cn-auto-note">Observé à partir de l'activité Jira — indicatif, non modifiable. L'IA le réactualise toute seule et en tient compte dans les comptes rendus.</p>
            </div>
          )}
        </div>
      )}

      <div className="cn-actions">
        <button className="btn cn-save" onClick={onSave} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la mémoire"}</button>
        <button className="btn cn-ghost" onClick={onLearn} disabled={learning} title="Forcer l'analyse IA de tous les clients maintenant">{learning ? "Apprentissage…" : "🤖 Mettre à jour l'apprentissage"}</button>
        <button className="btn cn-ghost" onClick={onExport}>Exporter (connaissance.json)</button>
        {msg && <span className="cn-ok">{msg}</span>}
        {err && <span className="cn-err">{err}</span>}
      </div>
    </div>
  );
}
