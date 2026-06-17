import React, { useEffect, useState } from "react";
import JSZip from "jszip";
import { fetchRecap, genDailyCR, genWrittenCR } from "../api.js";
import DocPreview from "./DocPreview.jsx";

const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };

function shorten(s, n = 72) {
  s = (s || "").trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// Produit un paragraphe explicatif, factuel et structuré, de ce qui a avancé pour un client.
function describeDossier(items) {
  const n = items.length;
  if (!n) return "Aucune activité enregistrée aujourd'hui.";
  const by = (st) => items.filter((i) => i.statut === st);
  const done = by("Terminé"), prog = by("En cours"), todo = by("À faire"), blocked = by("Bloqué");

  const bits = [];
  if (done.length) bits.push(`${done.length} terminé${done.length > 1 ? "s" : ""}`);
  if (prog.length) bits.push(`${prog.length} en cours`);
  if (todo.length) bits.push(`${todo.length} à faire`);
  if (blocked.length) bits.push(`${blocked.length} bloqué${blocked.length > 1 ? "s" : ""}`);

  let p = `${n} sujet${n > 1 ? "s ont" : " a"} avancé aujourd'hui`;
  p += bits.length ? ` — ${bits.join(", ")}.` : ".";

  if (done.length) {
    const t = done.slice(0, 2).map((i) => `« ${shorten(i.resume)} »`).join(", ");
    const reste = done.length - 2;
    p += ` Livré : ${t}${reste > 0 ? `, plus ${reste} autre${reste > 1 ? "s" : ""}` : ""}.`;
  }
  if (blocked.length) {
    const reste = blocked.length - 1;
    p += ` À débloquer en priorité : « ${shorten(blocked[0].resume)} »${reste > 0 ? ` (et ${reste} autre${reste > 1 ? "s" : ""})` : ""}.`;
  } else if (prog.length && !done.length) {
    p += ` Travaux en cours, rien de bloquant à ce stade.`;
  }
  return p;
}

export default function DailyRecap({ onTicket, onDev, deletedDevs = [] }) {
  const [recap, setRecap] = useState(null);
  const [openD, setOpenD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [prog, setProg] = useState("");
  const [doc, setDoc] = useState(null);
  const delSet = new Set(deletedDevs);

  useEffect(() => {
    fetchRecap().then(setRecap).catch((e) => setErr(e.message));
  }, []);

  const makeCR = async (dossier) => {
    setBusy(dossier); setErr("");
    try {
      const { html } = await genDailyCR(dossier);
      setDoc({ title: `CR journalier — ${dossier}`, html, dossier, filename: `CR_journalier_${dossier}_${new Date().toISOString().slice(0, 10)}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };

  const makeWritten = async (dossier) => {
    setBusy(dossier + "::w"); setErr("");
    try {
      const { html } = await genWrittenCR(dossier);
      setDoc({ title: `Compte rendu écrit — ${dossier}`, html, dossier, filename: `CR_ecrit_${dossier}_${new Date().toISOString().slice(0, 10)}.html` });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };

  // ZIP « Récap global du jour » : un dossier par client, contenant le CR détaillé ET le CR écrit.
  // Les deux passent par les générateurs SERVEUR (chiffres cohérents, noms redressés, périmètre à jour).
  const makeGlobalZip = async () => {
    setBusy("__global__"); setErr(""); setProg("");
    try {
      const date = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ (triable, sans caractère interdit)
      const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
      const clients = Object.keys(recap.byDossier).filter((d) => d && d !== "Autre");
      if (!clients.length) { setErr("Aucun client à générer."); setBusy(""); return; }

      const zip = new JSZip();
      const root = zip.folder(`${date} - Armonie Récap journalier`);
      const fails = [];

      for (let i = 0; i < clients.length; i++) {
        const dossier = clients[i];
        setProg(`Génération ${i + 1}/${clients.length} — ${dossier}…`);
        try {
          const [det, ecr] = await Promise.all([genDailyCR(dossier), genWrittenCR(dossier)]);
          const folder = root.folder(`${safe(dossier).toUpperCase()}-RECAP-${date}`);
          folder.file(`CR-detaille-${safe(dossier)}-${date}.html`, det.html || "<p>(vide)</p>");
          folder.file(`CR-ecrit-${safe(dossier)}-${date}.html`, ecr.html || "<p>(vide)</p>");
        } catch (e) { fails.push(`${dossier}`); }
      }

      setProg("Compression du ZIP…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Recap-journalier-${date}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setProg(fails.length
        ? `ZIP téléchargé. ${clients.length - fails.length}/${clients.length} clients OK — échec : ${fails.join(", ")}.`
        : `ZIP téléchargé — ${clients.length} clients, 2 fichiers chacun (détaillé + écrit).`);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(""); }
  };

  if (err) return <div className="banner">Erreur : {err}</div>;
  if (!recap) return <div className="panel empty">Chargement du récap…</div>;

  const entries = Object.entries(recap.byDossier).sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <div className="page-hero">
        <span className="page-hero-k">Comptes rendus</span>
        <h2>Récap de la journée</h2>
        <p>Synthèse de l'activité Jira du jour — bâtie sur les vraies transitions.</p>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Base : {recap.basis}. Clique sur un ticket pour le détailler, ou génère le compte rendu journalier d'un client.
      </p>
      <div className="row-actions" style={{ marginBottom: 16 }}>
        <button className="btn-solid" onClick={makeGlobalZip} disabled={busy === "__global__"}>
          {busy === "__global__" ? "Génération…" : "📦 Récap global du jour (ZIP — détaillé + écrit / client)"}
        </button>
        {prog && <span className="hint" style={{ marginLeft: 10 }}>{prog}</span>}
      </div>
      <div className="recap-grid">
        {entries.map(([dossier, items]) => {
          const done = items.filter((i) => i.statut === "Terminé").length;
          const blocked = items.filter((i) => i.statut === "Bloqué").length;
          return (
            <div className="recap-card" key={dossier}>
              <div className="recap-hd">
                <span className="recap-hd-name">{dossier}</span>
                <span className="recap-hd-meta">
                  {done} fait{done > 1 ? "s" : ""}{blocked ? ` · ${blocked} bloqué${blocked > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              <div className="recap-bd">
              <p className="recap-desc">
                <span className="rd-label">Ce qui a avancé</span>
                {describeDossier(items)}
              </p>
              <ul>
                {(openD === dossier ? items : items.slice(0, 6)).map((i) => {
                  const dev = i.dev || i.assigne || "";
                  const showDev = dev && dev !== "Non assigné";
                  const isDel = delSet.has(dev);
                  return (
                    <li key={i.cle} className="ri" onClick={() => onTicket(i)}>
                      <div className="ri-top">
                        <span className="k">{i.cle}</span>
                        <span className={`pill ${PILL[i.statut]}`}>{i.statut}</span>
                      </div>
                      <div className="ri-res">{i.resume}{i.flagged ? <span className="flag" title="Flaggé"> 🚩</span> : null}</div>
                      {showDev && (
                        <div className="ri-dev">
                          <span className={`dev-chip ${isDel ? "del" : ""}`} title="Voir la fiche du développeur"
                            onClick={(e) => { e.stopPropagation(); onDev && onDev(dev); }}>
                            {dev}{isDel ? <span className="dev-del-tag">supprimé</span> : null}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
                {items.length > 6 && (
                  <li className="ri-more" onClick={() => setOpenD(openD === dossier ? null : dossier)} title={openD === dossier ? "Réduire" : "Afficher tout"}>
                    {openD === dossier ? "▾ réduire" : `▸ voir les ${items.length - 6} autre(s)…`}
                  </li>
                )}
              </ul>
              <div className="cr-btns">
                <button className="btn-solid gold" onClick={() => makeCR(dossier)} disabled={busy === dossier}>
                  {busy === dossier ? "Rédaction…" : "CR journalier détaillé"}
                </button>
                <button className="btn-solid" onClick={() => makeWritten(dossier)} disabled={busy === dossier + "::w"}>
                  {busy === dossier + "::w" ? "Rédaction…" : "Compte rendu écrit"}
                </button>
              </div>
              </div>
            </div>
          );
        })}
      </div>
      {doc && <DocPreview {...doc} onClose={() => setDoc(null)} />}
    </>
  );
}
