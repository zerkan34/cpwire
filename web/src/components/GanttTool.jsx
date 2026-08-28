import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import template from "../assets/gantt_template.html?raw";
import { exportHtmlPdf, getToken } from "../api.js";

// GanttTool — outil de CRÉATION de planning, à la manière de l'atelier Belmet :
// ajouter des phases et des tâches, les glisser, les redimensionner, renommer au
// clic, zoomer, importer et exporter.
//
// Changement majeur du 13/08/2026 : les plannings sont désormais enregistrés
// CÔTÉ SERVEUR et partagés. Auparavant, chacun vivait dans le localStorage du
// navigateur de son auteur : invisible pour les collègues, perdu au nettoyage du
// cache, et disparu au départ de la personne. Tout compte authentifié voit
// maintenant tous les plannings, et sait qui a modifié en dernier.
//
// L'outil tourne dans une iframe isolée (srcDoc) : aucun conflit de style avec
// l'application. Il remonte chaque modification par postMessage, l'enveloppe
// enregistre.

const slug = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
// Échappe < et > pour qu'une valeur ne puisse pas clore une balise <script> injectée.
const enc = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
function entetes() {
  const t = getToken ? getToken() : "";
  const h = { "Content-Type": "application/json" };
  if (t) h["x-access-token"] = t;
  return h;
}
async function api(url, options = {}) {
  const r = await fetch(url, { headers: entetes(), ...options });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}

// GANTT livrés, enregistrés dans le projet (fichiers statiques servis par l'app).
// Documents autonomes (sauvegarde, impression et export intégrés).
const SAVED = [
  { id: "bellion", client: "Bellion", projet: "ERP26", src: "/gantts/bellion.html" },
];

export default function GanttTool({ dossiers = [] }) {
  const [client, setClient] = useState("");
  const [projet, setProjet] = useState("");
  const [active, setActive] = useState(null);         // { client, projet, key }
  const [liste, setListe] = useState([]);          // tous les plannings, vus par tous
  const [graine, setGraine] = useState(null);      // contenu du planning ouvert
  const [stockage, setStockage] = useState(null);
  const [msg, setMsg] = useState("");
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
      } else if (d.type === "cpw-gantt-change" && d.data) {
        // Chaque édition dans l'iframe remonte ici et part vers le serveur.
        enregistrer(d.data, active);
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
  }, [active, enregistrer]);

  const charger = useCallback(async () => {
    try {
      const d = await api("/api/gantts");
      setListe(d.gantts || []); setStockage(d.stockage || null); setMsg("");
    } catch (e) { setMsg("Plannings indisponibles : " + e.message); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // Enregistrement côté serveur, déclenché par chaque modification remontée de
  // l'iframe. Regroupé sur 800 ms : glisser une barre émet des dizaines
  // d'événements, on n'écrit qu'une fois le geste terminé.
  const enAttente = useRef(null);
  const enregistrer = useCallback((data, ctx) => {
    if (!ctx) return;
    clearTimeout(enAttente.current);
    enAttente.current = setTimeout(async () => {
      try {
        await api("/api/gantts", { method: "POST", body: JSON.stringify({
          id: ctx.id, client: ctx.client, projet: ctx.projet, data,
        }) });
        setMsg("Enregistré · visible par toute l'équipe");
        charger();
      } catch (e) { setMsg("Enregistrement impossible : " + e.message); }
    }, 800);
  }, [charger]);

  const askPdf = () => frameRef.current?.contentWindow?.postMessage({ type: "cpw-req-pdf" }, "*");
  const askEditable = () => frameRef.current?.contentWindow?.postMessage({ type: "cpw-req-data" }, "*");

  const clients = useMemo(() => Array.from(new Set(dossiers.filter(Boolean))).sort(), [dossiers]);

  const open = async (c, p, id) => {
    const cc = (c || "").trim(), pp = (p || "").trim();
    if (!cc || !pp) return;
    const identifiant = id || `${slug(cc)}--${slug(pp)}`;
    setMsg("");
    let data = null;
    try {
      const d = await api(`/api/gantts/${encodeURIComponent(identifiant)}`);
      data = d.planning?.data || null;
    } catch (e) {
      data = null;   // planning inexistant : on démarre sur le squelette du gabarit
    }
    setGraine(data);
    setActive({ client: cc, projet: pp, key: identifiant, id: identifiant });
  };

  // Ouvre un GANTT enregistré (fichier statique, document autonome).
  const openSaved = (s) => setActive({ client: s.client, projet: s.projet, key: "saved:" + s.id, src: s.src });

  const remove = async (id) => {
    if (!window.confirm("Supprimer ce planning ? Il disparaîtra pour toute l'équipe.")) return;
    try {
      await api(`/api/gantts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (active && active.id === id) { setActive(null); setGraine(null); }
      charger();
    } catch (e) { setMsg("Suppression impossible : " + e.message); }
  };

  const srcDoc = useMemo(() => {
    if (!active) return "";
    const inject = `<script>window.__CPW_CLIENT__=${enc(active.client)};window.__CPW_PROJET__=${enc(active.projet)};window.__CPW_KEY__=${enc(active.key)};${graine ? `window.__CPW_SEED__=${enc(graine)};` : ""}<\/script>`;
    return template.replace("<body>", "<body>\n" + inject);
  }, [active, graine]);



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
        {/* TOUS les plannings, pas seulement ceux de la personne connectée : c'est
            l'intérêt du passage au serveur. Chacun affiche sa taille et son dernier
            éditeur, pour qu'on sache à quoi on touche. */}
        {liste.length ? (
          <div className="gantt-recent">
            <span className="gantt-recent-lbl">Plannings de l&apos;équipe ({liste.length})</span>
            {liste.map((g) => (
              <span key={g.id} className={`gantt-chip ${active && active.id === g.id ? "on" : ""}`}>
                <button className="gantt-chip-open" onClick={() => open(g.client, g.projet, g.id)}
                  title={`${g.phases} phase${g.phases > 1 ? "s" : ""}, ${g.taches} tâche${g.taches > 1 ? "s" : ""}`
                    + (g.majPar ? ` · dernière modification par ${g.majPar}` : "")}>
                  <b>{g.client}</b><i>·</i>{g.projet}
                  <em className="gantt-chip-n">{g.taches}</em>
                </button>
                <button className="gantt-chip-x" onClick={() => remove(g.id)} title="Supprimer pour tout le monde" aria-label="Supprimer">×</button>
              </span>
            ))}
          </div>
        ) : (
          <p className="gantt-vide">Aucun planning pour l&apos;instant. Renseigne un client et un projet, puis « Ouvrir / créer ».</p>
        )}

        {stockage && !stockage.durable && (
          <div className="gantt-alerte">
            Stockage non durable : les plannings seront perdus au prochain redéploiement.
            Vérifie <code>DATABASE_URL</code> sur Render.
          </div>
        )}
        {msg && <div className="gantt-msg">{msg}</div>}
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
