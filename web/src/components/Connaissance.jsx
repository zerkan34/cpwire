import React, { useEffect, useMemo, useState } from "react";
import { fetchConnaissance, saveConnaissance, learnConnaissance, fetchHealth, removeAppris } from "../api.js";
import { RefState } from "./RefState.jsx";
import { buildMemoireDoc } from "../refDoc.js";
import { printHtml, downloadHtml } from "../utils.js";
import LearningHistory from "./LearningHistory.jsx";

const arrToText = (a) => (Array.isArray(a) ? a.join("\n") : "");
const textToArr = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const glossToText = (a) => (Array.isArray(a) ? a.map((g) => `${g.terme}${g.sens ? " = " + g.sens : ""}`).join("\n") : "");
const textToGloss = (s) => String(s || "").split("\n").map((l) => {
  const i = l.indexOf("=");
  return i < 0 ? { terme: l.trim(), sens: "" } : { terme: l.slice(0, i).trim(), sens: l.slice(i + 1).trim() };
}).filter((g) => g.terme);

export default function Connaissance({ issues = [], onTicket, onDev }) {
  const [k, setK] = useState(null);
  const [showHist, setShowHist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [persistent, setPersistent] = useState(null);
  useEffect(() => { fetchHealth().then((h) => setPersistent(!!h.persistent)).catch(() => {}); }, []);
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
  const [apprisOpen, setApprisOpen] = useState({}); // source -> historique déplié ?
  const [forgetting, setForgetting] = useState(""); // source en cours de suppression

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
    catch (e) {
      console.error("[Connaissance]", e && e.message ? e.message : e); setErr(e.message || "Échec de l'enregistrement"); }
    finally { setSaving(false); }
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "connaissance.json"; a.click();
    URL.revokeObjectURL(url);
  };

  // Export charté (PDF / Web) — on enrichit la charge éditable avec les blocs « appris » (auto).
  const docPayload = () => {
    const p = buildPayload();
    Object.keys(p.clients).forEach((key) => { if (k.clients[key] && k.clients[key].auto) p.clients[key].auto = k.clients[key].auto; });
    return p;
  };
  const exportPdf = () => { const { html, filename } = buildMemoireDoc(docPayload()); printHtml(html, filename); };
  const exportWeb = () => { const { html, filename } = buildMemoireDoc(docPayload()); downloadHtml(html, filename.replace(/\.pdf$/, ".html")); };

  // Déclenche l'apprentissage IA tout de suite (sinon il tourne seul en tâche de fond).
  const onLearn = async () => {
    setLearning(true); setMsg(""); setErr("");
    try {
      const r = await learnConnaissance();
      if (r.connaissance) setK(r.connaissance);
      const n = (r.learned || []).length;
      setMsg(n ? `Mémoire enrichie automatiquement pour ${n} client${n > 1 ? "s" : ""}.` : "Apprentissage à jour (rien de neuf à analyser).");
    } catch (e) {
      console.error("[Connaissance]", e && e.message ? e.message : e); setErr(e.message || "Apprentissage impossible"); }
    finally { setLearning(false); }
  };

  const fmtAt = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } };

  const onForget = async (source) => {
    if (!sel || !source) return;
    if (!window.confirm(`Oublier définitivement « ${source} » pour ${sel} ?\nL'IA n'en tiendra plus compte dans les comptes rendus.`)) return;
    setForgetting(source); setErr("");
    try {
      await removeAppris(sel, source);
      setNonce((n) => n + 1); // recharge tout depuis le serveur, y compris la liste à jour
      setMsg(`Source « ${source} » oubliée pour ${sel}.`);
    } catch (e) {
      console.error("[Connaissance]", e && e.message ? e.message : e); setErr(e.message || "Suppression impossible");
    } finally { setForgetting(""); }
  };

  if (loading) return <RefState kind="load" title="Chargement de la mémoire d'équipe…" message="Récupération des conventions, du glossaire et du contexte appris par l'IA." />;
  if (err && !k) return <RefState kind="err" title="La mémoire n'a pas pu se charger" message="La base de connaissance est momentanément indisponible. Réessayez dans un instant." detail={err} onRetry={retry} />;
  if (!k) return null;

  return (
    <div className="cn">
      <div className="section-title">Mémoire d'équipe — ce que l'assistant sait de votre façon de travailler</div>
      <div className="cn-explain">
        <b>À quoi ça sert ?</b> La mémoire, c'est le <b>cerveau de contexte</b> de cp|WIRE. Tout ce qui est écrit ici est <b>relu par l'assistant à chaque compte rendu, analyse ou réponse</b> — pour qu'il parle <i>votre</i> langage et connaisse <i>vos</i> clients, au lieu de repartir de zéro à chaque fois.
        <ul>
          <li><b>Conventions</b> : vos règles d'écriture (ex. « chez EDL, les commerciaux sont des “animateurs” »). L'assistant les applique partout.</li>
          <li><b>Glossaire</b> : vos sigles et termes métier (ex. « PTAF = projet Tafanel »), pour qu'ils soient compris et bien employés.</li>
          <li><b>Par client</b> : contexte, attentes, vocabulaire et notes — ce qu'il faut garder en tête pour chacun.</li>
          <li><b>🤖 Appris de Jira</b> : cp|WIRE observe l'activité et résume tout seul le contexte de chaque client (périmètre, intervenants, charge). Vous n'avez rien à faire.</li>
        </ul>
        Concrètement : plus la mémoire est riche, plus les CR et analyses sortent <b>justes et personnalisés</b>, sans avoir à tout réexpliquer.
      </div>
      <p className="hint">Astuce : une ligne par règle. Glossaire : « terme = définition » par ligne.</p>

      <div className="cn-hist-bar">
        <button type="button" className={`cn-hist-btn ${showHist ? "on" : ""}`} onClick={() => setShowHist((v) => !v)}>
          📈 Historique d'apprentissage{showHist ? " — masquer" : ""}
        </button>
        <span className="cn-hist-sub">Courbe de ce que cp|WIRE connaît dans le temps, par client (jour / semaine / mois / année).</span>
      </div>
      {showHist ? (
        <div className="panel cn-block cn-hist-panel">
          <LearningHistory issues={issues} k={k} onTicket={onTicket} onDev={onDev}
            actions={{ onSave, onLearn, onExport, exportPdf, exportWeb, saving, learning }} />
        </div>
      ) : null}

      {persistent === true ? (
        <div className="cn-ok">
          <b>✓ Mémoire persistante (base durable).</b> Vos ajouts sont enregistrés <b>automatiquement</b> et conservés après chaque redéploiement — rien à faire. Le bouton <b>Exporter</b> sert uniquement à garder une copie de sauvegarde.
        </div>
      ) : persistent === false ? (
        <div className="cn-warn">
          <b>Mémoire éphémère.</b> Pour conserver vos ajouts, définissez <code>DATABASE_URL</code> (base Neon gratuite) — la sauvegarde devient alors automatique. À défaut : cliquez <b>Exporter</b>, remplacez <code>server/data/connaissance.json</code> dans le dépôt, et redéployez.
        </div>
      ) : null}

      <div className="panel cn-block">
        <h3>Conventions générales</h3>
        <textarea className="cn-ta" rows={6} value={conv} onChange={(e) => setConv(e.target.value)} placeholder="Une règle par ligne…" />
        <h3>Glossaire général</h3>
        <textarea className="cn-ta" rows={5} value={glossG} onChange={(e) => setGlossG(e.target.value)} placeholder="terme = définition (une par ligne)" />
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>Par client</div>
      <p className="hint" style={{ marginTop: -6 }}>
        En plus de ce que vous écrivez, cp|WIRE <b>apprend tout seul</b> : il observe l'activité Jira de chaque client et met à jour un « contexte observé » (bloc 🤖 plus bas), automatiquement et en tâche de fond — <b>avec l'IA</b> si une clé est configurée, <b>sinon par extraction directe de Jira</b> (chiffres et intervenants réels). Vous n'avez rien à faire.
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
          {(k.clients[sel]?.appris || []).length > 0 && (
            <div className="cn-auto cn-appris">
              <h3>📥 Sources apprises (Import sources) <span className="cn-auto-meta">— {k.clients[sel].appris.length} source{k.clients[sel].appris.length > 1 ? "s" : ""}</span></h3>
              <p className="cn-auto-note">Ce que les fichiers importés ont durablement appris à cp|WIRE pour {sel}. Relu par l'IA à chaque compte rendu — vérifiable et corrigeable ici, pas une boîte noire.</p>
              <ul className="cn-appris-list">
                {k.clients[sel].appris.slice().reverse().map((e) => {
                  const hist = Array.isArray(e.history) ? e.history : [];
                  const open = !!apprisOpen[e.source];
                  return (
                    <li key={e.source} className="cn-appris-item">
                      <div className="cn-appris-hd">
                        <span className="cn-appris-src">{e.source.replace(/^import:/, "")}</span>
                        <span className="cn-appris-at">{fmtAt(e.at)}</span>
                        {hist.length > 0 && (
                          <button type="button" className="cn-appris-toggle" onClick={() => setApprisOpen((p) => ({ ...p, [e.source]: !p[e.source] }))}>
                            {open ? "▾" : "▸"} historique ({hist.length})
                          </button>
                        )}
                        <button type="button" className="cn-appris-forget" disabled={forgetting === e.source}
                          onClick={() => onForget(e.source)} title="Oublier définitivement cette source">
                          {forgetting === e.source ? "…" : "🗑 Oublier"}
                        </button>
                      </div>
                      <p className="cn-appris-text">{e.text}</p>
                      {open && hist.length > 0 && (
                        <ul className="cn-appris-hist">
                          {hist.map((h, i) => (
                            <li key={i}><span className="cn-appris-at">{fmtAt(h.at)}</span><span className="cn-appris-histtext">{h.text}</span></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="cn-actions">
        <button className="btn cn-save" onClick={onSave} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la mémoire"}</button>
        <button className="btn cn-ghost" onClick={onLearn} disabled={learning} title="Forcer l'analyse IA de tous les clients maintenant">{learning ? "Apprentissage…" : "🤖 Mettre à jour l'apprentissage"}</button>
        <button className="btn cn-ghost" onClick={onExport}>Exporter (connaissance.json)</button>
        <button className="btn cn-ghost" onClick={exportPdf} title="Télécharger la mémoire en PDF (charte Armonie)">⤓ PDF</button>
        <button className="btn cn-ghost" onClick={exportWeb} title="Télécharger la mémoire en page web cliquable">🌐 Web</button>
        {msg && <span className="cn-ok">{msg}</span>}
        {err && <span className="cn-err">{err}</span>}
      </div>
    </div>
  );
}
