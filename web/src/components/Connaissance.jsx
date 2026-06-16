import React, { useEffect, useMemo, useState } from "react";
import { fetchConnaissance, saveConnaissance } from "../api.js";

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
  }, []);

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

  if (loading) return <div className="empty">Chargement de la mémoire d'équipe…</div>;
  if (err && !k) return <div className="empty">Mémoire indisponible : {err}</div>;
  if (!k) return null;

  return (
    <div className="cn">
      <div className="section-title">Mémoire d'équipe — ce que l'assistant sait de votre façon de travailler</div>
      <p className="hint">
        Tout ce qui est ici est relu par l'IA à chaque rapport. Plus vous l'enrichissez, plus les comptes rendus collent à vos usages.
        Astuce : une ligne par règle. Glossaire : « terme = définition » par ligne.
      </p>

      <div className="cn-warn">
        ⚠ Sur Render gratuit, les ajouts faits ici sont effacés au prochain déploiement. Cliquez <b>Exporter</b> et remplacez le fichier
        <code> server/data/connaissance.json</code> dans votre dépôt pour les rendre permanents (ou définissez un disque persistant <code>DATA_DIR</code>).
      </div>

      <div className="panel cn-block">
        <h3>Conventions générales</h3>
        <textarea className="cn-ta" rows={6} value={conv} onChange={(e) => setConv(e.target.value)} placeholder="Une règle par ligne…" />
        <h3>Glossaire général</h3>
        <textarea className="cn-ta" rows={5} value={glossG} onChange={(e) => setGlossG(e.target.value)} placeholder="terme = définition (une par ligne)" />
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>Par client</div>
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
        </div>
      )}

      <div className="cn-actions">
        <button className="btn cn-save" onClick={onSave} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la mémoire"}</button>
        <button className="btn cn-ghost" onClick={onExport}>Exporter (connaissance.json)</button>
        {msg && <span className="cn-ok">{msg}</span>}
        {err && <span className="cn-err">{err}</span>}
      </div>
    </div>
  );
}
