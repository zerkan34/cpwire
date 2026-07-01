import React, { useEffect, useState } from "react";
import { spStatus, spList, spPreview, spListItems } from "../api.js";
import { openExternal } from "../utils.js";

const OFFICE = ["xlsx", "xls", "xlsm", "csv", "docx", "doc", "pptx", "ppt", "pdf"];
const fmtSize = (n) => (!n ? "" : n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1)} Mo`);
const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }); };
function icon(it) {
  if (it.isFolder) return "📁";
  if (["xlsx", "xls", "xlsm", "csv"].includes(it.ext)) return "🟩";
  if (["docx", "doc"].includes(it.ext)) return "🟦";
  if (["pptx", "ppt"].includes(it.ext)) return "🟧";
  if (it.ext === "pdf") return "📕";
  return "📄";
}

export default function SharePointFiles() {
  const [configured, setConfigured] = useState(null);
  const [path, setPath] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState(null); // { name, ext, webUrl, previewUrl, mode:'apercu'|'edit' }

  // Test « liste TMA en direct » (Graph) — GUID issu du .iqy, pré-rempli.
  const [listId, setListId] = useState("235b08a7-1e15-4040-bd5c-481c01713d02");
  const [tBusy, setTBusy] = useState(false);
  const [tRes, setTRes] = useState(null);
  const [tErr, setTErr] = useState("");
  const testList = async () => {
    setTBusy(true); setTErr(""); setTRes(null);
    try { const r = await spListItems(listId.trim(), 5); setTRes(r); }
    catch (e) {
      console.error("[SharePointFiles]", e && e.message ? e.message : e); setTErr(e.message || "Erreur"); }
    finally { setTBusy(false); }
  };

  useEffect(() => { spStatus().then((s) => setConfigured(!!s.configured)).catch(() => setConfigured(false)); }, []);
  useEffect(() => { if (configured) load(path); /* eslint-disable-next-line */ }, [configured, path]);

  const load = async (p) => {
    setLoading(true); setErr("");
    try { const r = await spList(p); setItems(r.items || []); }
    catch (e) {
      console.error("[SharePointFiles]", e && e.message ? e.message : e); setErr(e.message || "Erreur"); setItems([]); }
    finally { setLoading(false); }
  };

  const crumbs = path ? path.split("/") : [];
  const enter = (name) => setPath(path ? `${path}/${name}` : name);
  const goCrumb = (idx) => setPath(idx < 0 ? "" : crumbs.slice(0, idx + 1).join("/"));

  const openFile = async (it) => {
    if (OFFICE.includes(it.ext)) {
      setView({ name: it.name, ext: it.ext, webUrl: it.webUrl, previewUrl: "", mode: "apercu" });
      try { const r = await spPreview(it.id); setView((v) => v && v.name === it.name ? { ...v, previewUrl: r.url } : v); }
      catch (e) { setErr(e.message || "Aperçu indisponible"); }
    } else { openExternal(it.webUrl); }
  };

  const shown = items.filter((it) => !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="page-hero hero-with-search">
        <div className="ph-main">
          <span className="page-hero-k">Documents</span>
          <h2>Fichiers SharePoint</h2>
          <p>Les fichiers de l'espace SharePoint — dont les Excel des développeurs — consultables en direct, et modifiables dans Excel en ligne sans quitter cp|WIRE.</p>
        </div>
        <div className="page-search on-hero">
          <span className="ps-ic">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un fichier…" aria-label="Rechercher un fichier" />
          {q && <button className="ps-x" onClick={() => setQ("")} title="Effacer">×</button>}
        </div>
      </div>

      {configured === false && (
        <div className="panel sp-config">
          <h3>Connexion SharePoint à activer</h3>
          <p>Pour afficher les fichiers, l'application doit être reliée à votre SharePoint via une application Microsoft (Azure / Entra). À renseigner côté serveur (variables d'environnement) :</p>
          <ul className="sp-vars">
            <li><code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code> — l'application Azure (permission Graph <b>Sites.ReadWrite.All</b>, consentement administrateur).</li>
            <li><code>SP_SITE_ID</code> — l'identifiant du site SharePoint (et éventuellement <code>SP_DRIVE_ID</code> pour une bibliothèque précise).</li>
          </ul>
          <p className="hint">Une fois ces valeurs en place sur Render, cet écran liste automatiquement les fichiers — rien d'autre à faire.</p>
        </div>
      )}

      {configured && (
        <div className="panel sp-list-test">
          <h3 style={{ margin: "0 0 4px" }}>Liste TMA en direct (Graph)</h3>
          <p className="hint" style={{ margin: "0 0 8px" }}>Test de lecture directe de la liste SharePoint (pour remplacer l'export CSV manuel). Affiche les colonnes réelles.</p>
          <div className="sp-test-row">
            <input value={listId} onChange={(e) => setListId(e.target.value)} placeholder="GUID de la liste" aria-label="GUID de la liste" style={{ flex: 1, minWidth: 220 }} />
            <button className="btn-line on" onClick={testList} disabled={tBusy}>{tBusy ? "Lecture…" : "Lire la liste"}</button>
          </div>
          {tErr && <div className="warn-note" style={{ marginTop: 8 }}>{tErr}</div>}
          {tRes && (
            <div className="sp-test-res">
              <p><b>{tRes.count}</b> élément(s) lus. Colonnes détectées :</p>
              <div className="sp-test-cols">{(tRes.sampleFields || []).map((f) => <code key={f}>{f}</code>)}</div>
              {tRes.items && tRes.items[0] ? <p className="hint" style={{ marginTop: 6 }}>1er élément : {tRes.items[0].name || "—"}{tRes.items[0].modified ? ` · ${fmtDate(tRes.items[0].modified)}` : ""}</p> : null}
            </div>
          )}
        </div>
      )}

      {configured && (
        <div className="panel sp-panel">
          <div className="sp-crumbs">
            <button className="sp-crumb" onClick={() => goCrumb(-1)} disabled={!path}>🏠 Racine</button>
            {crumbs.map((c, i) => (
              <span key={i} className="sp-crumb-wrap"><span className="sp-sep">›</span>
                <button className="sp-crumb" onClick={() => goCrumb(i)} disabled={i === crumbs.length - 1}>{c}</button>
              </span>
            ))}
            <button className="sp-refresh" onClick={() => load(path)} title="Actualiser">↻</button>
          </div>

          {err && <div className="warn-note">{err}</div>}
          {loading ? <div className="sp-empty">Chargement…</div> : shown.length === 0 ? (
            <div className="sp-empty">{q ? "Aucun fichier ne correspond." : "Dossier vide."}</div>
          ) : (
            <ul className="sp-list">
              {shown.map((it) => (
                <li key={it.id} className={`sp-row ${it.isFolder ? "is-folder" : ""}`}
                  onClick={() => it.isFolder ? enter(it.name) : openFile(it)}
                  title={it.isFolder ? "Ouvrir le dossier" : (OFFICE.includes(it.ext) ? "Aperçu en direct" : "Ouvrir")}>
                  <span className="sp-ic">{icon(it)}</span>
                  <span className="sp-name">{it.name}</span>
                  <span className="sp-meta">{it.isFolder ? `${it.childCount ?? ""} élément(s)` : fmtSize(it.size)}</span>
                  <span className="sp-meta sp-by">{it.by}{it.modified ? ` · ${fmtDate(it.modified)}` : ""}</span>
                  {!it.isFolder && it.webUrl && (
                    <button className="sp-open" onClick={(e) => { e.stopPropagation(); openExternal(it.webUrl); }} title="Ouvrir dans Office en ligne">↗</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view && (
        <div className="sp-modal-bg" onClick={() => setView(null)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sp-modal-hd">
              <span className="sp-modal-name">{icon(view)} {view.name}</span>
              <div className="sp-modal-act">
                <div className="sp-seg">
                  <button className={view.mode === "apercu" ? "on" : ""} onClick={() => setView({ ...view, mode: "apercu" })}>👁 Aperçu</button>
                  <button className={view.mode === "edit" ? "on" : ""} onClick={() => setView({ ...view, mode: "edit" })}>✏️ Modifier</button>
                </div>
                <button className="btn-line sm" onClick={() => openExternal(view.webUrl)}>Ouvrir dans un onglet ↗</button>
                <button className="sp-modal-x" onClick={() => setView(null)} title="Fermer">×</button>
              </div>
            </div>
            <div className="sp-frame-wrap">
              {view.mode === "edit" ? (
                view.webUrl ? <iframe className="sp-frame" title="Édition Office" src={view.webUrl} /> : <div className="sp-empty">Lien d'édition indisponible.</div>
              ) : (
                view.previewUrl ? <iframe className="sp-frame" title="Aperçu Office" src={view.previewUrl} /> : <div className="sp-empty">Préparation de l'aperçu…</div>
              )}
            </div>
            <p className="sp-modal-hint">« Aperçu » = lecture en direct du fichier réel. « Modifier » ouvre l'éditeur Excel en ligne (tes changements sont enregistrés directement sur SharePoint). Si l'édition intégrée est bloquée par la sécurité de votre SharePoint, utilise « Ouvrir dans un onglet ».</p>
          </div>
        </div>
      )}
    </>
  );
}
