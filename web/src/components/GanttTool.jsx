import React, { useEffect, useMemo, useRef, useState } from "react";
import template from "../assets/gantt_template.html?raw";
import { exportHtmlPdf } from "../api.js";

// GanttTool — enveloppe cp|WIRE autour de l'outil GANTT autonome (déjà à la
// charte Armonie). L'utilisateur choisit un CLIENT et un PROJET ; chaque couple
// a son propre plan sauvegardé (clé localStorage distincte), réouvrable à volonté.
// L'outil tourne dans une iframe isolée (srcDoc) : aucun conflit de style avec
// l'app, et la persistance se fait dans le navigateur (même origine).

const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
// Échappe < et > pour qu'une valeur ne puisse pas clore une balise <script> injectée.
const enc = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
const IDX_KEY = "cpwire-gantt-index";
const readIndex = () => { try { return JSON.parse(localStorage.getItem(IDX_KEY) || "{}"); } catch { return {}; } };
const writeIndex = (o) => { try { localStorage.setItem(IDX_KEY, JSON.stringify(o)); } catch { /* quota */ } };

// GANTT livrés, enregistrés dans le projet (fichiers statiques servis par l'app).
// Documents autonomes (sauvegarde, impression et export intégrés).
const SAVED = [
  { id: "bellion", client: "Bellion", projet: "ERP26", src: "/gantts/bellion.html" },
];

export default function GanttTool({ dossiers = [] }) {
  const [client, setClient] = useState("");
  const [projet, setProjet] = useState("");
  const [active, setActive] = useState(null);         // { client, projet, key }
  const [index, setIndex] = useState(() => readIndex());
  const [busy, setBusy] = useState("");
  const frameRef = useRef(null);

  // Passerelle avec l'iframe : réponses aux demandes d'export.
  useEffect(() => {
    const onMsg = async (ev) => {
      const d = ev.data || {};
      if (d.type === "cpw-pdf" && d.html) {
        try { setBusy("pdf"); await exportHtmlPdf(d.html, `GANTT ${active?.client || ""} ${active?.projet || ""}`.replace(/\s+/g, " ").trim() + ".pdf"); }
        catch (e) { window.alert("Export PDF indisponible : " + (e.message || e)); }
        finally { setBusy(""); }
      } else if (d.type === "cpw-data") {
        try {
          setBusy("html");
          const seed = `<script>window.__CPW_SEED__=${enc(d.data)};window.__CPW_CLIENT__=${enc(active?.client || "")};window.__CPW_PROJET__=${enc(active?.projet || "")};window.__CPW_KEY__=${enc(active?.key || "default")};<\/script>`;
          const html = template.replace("<body>", "<body>\n" + seed);
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `GANTT ${active?.client || ""} ${active?.projet || ""} (modifiable).html`.replace(/\s+/g, " ").trim();
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } finally { setBusy(""); }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [active]);

  const askPdf = () => frameRef.current?.contentWindow?.postMessage({ type: "cpw-req-pdf" }, "*");
  const askEditable = () => frameRef.current?.contentWindow?.postMessage({ type: "cpw-req-data" }, "*");

  const clients = useMemo(() => Array.from(new Set(dossiers.filter(Boolean))).sort(), [dossiers]);

  const open = (c, p) => {
    const cc = (c || "").trim(), pp = (p || "").trim();
    if (!cc || !pp) return;
    const key = slug(cc) + ":" + slug(pp);
    const next = { ...readIndex(), [key]: { client: cc, projet: pp, ts: Date.now() } };
    writeIndex(next); setIndex(next);
    setActive({ client: cc, projet: pp, key });
  };

  // Ouvre un GANTT enregistré (fichier statique, document autonome).
  const openSaved = (s) => setActive({ client: s.client, projet: s.projet, key: "saved:" + s.id, src: s.src });

  const remove = (key) => {
    if (!window.confirm("Supprimer ce GANTT et son plan enregistré ?")) return;
    try { localStorage.removeItem("cpwire-gantt:" + key); } catch { /* noop */ }
    const next = { ...readIndex() }; delete next[key]; writeIndex(next); setIndex(next);
    if (active && active.key === key) setActive(null);
  };

  const srcDoc = useMemo(() => {
    if (!active) return "";
    const inject = `<script>window.__CPW_CLIENT__=${enc(active.client)};window.__CPW_PROJET__=${enc(active.projet)};window.__CPW_KEY__=${enc(active.key)};<\/script>`;
    return template.replace("<body>", "<body>\n" + inject);
  }, [active]);

  const entries = Object.entries(index).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));

  return (
    <div className="gantt-tool">
      <div className="panel gantt-bar">
        <div className="gantt-fields">
          <label className="gantt-fld">
            <span>Client</span>
            <input list="gantt-clients" value={client} onChange={(e) => setClient(e.target.value)} placeholder="ex. Bellion" />
            <datalist id="gantt-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="gantt-fld">
            <span>Projet</span>
            <input value={projet} onChange={(e) => setProjet(e.target.value)} placeholder="ex. ERP26"
              onKeyDown={(e) => { if (e.key === "Enter") open(client, projet); }} />
          </label>
          <button className="btn primary gantt-go" disabled={!client.trim() || !projet.trim()} onClick={() => open(client, projet)}>
            {active && active.key === slug(client) + ":" + slug(projet) ? "Ouvert" : "Ouvrir / créer"}
          </button>
        </div>
        {SAVED.length ? (
          <div className="gantt-recent">
            <span className="gantt-recent-lbl">GANTT enregistrés</span>
            {SAVED.map((s) => (
              <span key={s.id} className={`gantt-chip saved ${active && active.key === "saved:" + s.id ? "on" : ""}`}>
                <button className="gantt-chip-open" onClick={() => openSaved(s)} title="Ouvrir le GANTT livré">
                  <b>{s.client}</b><i>·</i>{s.projet}
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {entries.length ? (
          <div className="gantt-recent">
            <span className="gantt-recent-lbl">Mes GANTT</span>
            {entries.map(([key, m]) => (
              <span key={key} className={`gantt-chip ${active && active.key === key ? "on" : ""}`}>
                <button className="gantt-chip-open" onClick={() => open(m.client, m.projet)} title="Ouvrir">
                  <b>{m.client}</b><i>·</i>{m.projet}
                </button>
                <button className="gantt-chip-x" onClick={() => remove(key)} title="Supprimer" aria-label="Supprimer">×</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {active ? (
        <div className="gantt-stage">
          <div className="gantt-export">
            <span className="gantt-export-lbl">{active.client} · {active.projet}{active.src ? " · enregistré" : ""}</span>
            <div className="gantt-export-btns">
              {active.src ? (
                <button className="gantt-dl ghost" onClick={() => window.open(active.src, "_blank", "noopener")}>
                  ↗ Ouvrir dans un onglet
                </button>
              ) : (
                <>
                  <button className="gantt-dl" onClick={askPdf} disabled={busy === "pdf"}>
                    {busy === "pdf" ? "Génération…" : "⬇ PDF (à envoyer)"}
                  </button>
                  <button className="gantt-dl ghost" onClick={askEditable} disabled={busy === "html"}>
                    {busy === "html" ? "Préparation…" : "⬇ Version modifiable"}
                  </button>
                </>
              )}
            </div>
          </div>
          {active.src
            ? <iframe key={active.key} title={`GANTT ${active.client} ${active.projet}`} className="gantt-frame" src={active.src} />
            : <iframe ref={frameRef} key={active.key} title={`GANTT ${active.client} ${active.projet}`} className="gantt-frame" srcDoc={srcDoc} />}
        </div>
      ) : (
        <div className="panel gantt-empty">
          <div className="gantt-empty-in">
            <div className="gantt-empty-t">Choisis un client et un projet</div>
            <p>Chaque couple <b>client / projet</b> a son propre planning, sauvegardé dans ce navigateur et réouvrable ici. L'outil reprend la charte Armonie : phases, tâches (glisser pour l'avancement), jalons.</p>
            <p>Une fois ouvert, tu peux télécharger le <b>PDF</b> (à plat, pour envoyer en COPIL — sans la ligne d'aide) ou la <b>version modifiable</b> (fichier HTML autonome qui se rouvre et se ré-édite, hors ligne).</p>
            <p className="gantt-empty-note">Note : l'onglet « Données » (import Jira automatique) ne fonctionne que dans l'environnement Claude ; ici, la saisie manuelle et l'import / export JSON prennent le relais.</p>
          </div>
        </div>
      )}
    </div>
  );
}
