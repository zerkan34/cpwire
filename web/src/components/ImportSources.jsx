import React, { useRef, useState } from "react";
import { importAnalyze, importApply } from "../api.js";

// ============================================================================
//  Import sources — cœur de l'apprentissage cp|WIRE.
//  On dépose une source (OneNote, Excel, query/CSV, Word, PPTX, PDF, JSON) :
//  cp|WIRE la LIT intelligemment côté serveur, puis l'INTÈGRE ET L'APPREND
//  AUTOMATIQUEMENT — le jeu de données est conservé ET la mémoire (connaissance,
//  relue par l'IA à chaque rapport) est nourrie durablement (upsert par source :
//  rien ne se perd, pas de doublon). Un récap transparent montre ce qui a été
//  compris et mémorisé. Zéro chiffre inventé : tout vient de l'analyse serveur.
//  Phases : pick → loading (analyse) → applying (intégration+apprentissage) → done / error.
// ============================================================================
const ACCEPT = ".one,.xlsx,.xls,.csv,.tsv,.txt,.json,.md,.docx,.pptx,.pdf";

export default function ImportSources({ onClose, onApplied }) {
  const [phase, setPhase] = useState("pick");
  const [fname, setFname] = useState("");
  const [res, setRes] = useState(null);
  const [applied, setApplied] = useState(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  // Analyse PUIS intégration + apprentissage automatiques (un seul geste).
  const run = async (file) => {
    if (!file) return;
    setFname(file.name); setErr(""); setRes(null); setApplied(null); setPhase("loading");
    let r;
    try {
      r = await importAnalyze(file);
      if (!r || r.ok === false || r.error) { setErr((r && r.error) || "Source non exploitable pour l'analyse."); setPhase("error"); return; }
      setRes(r);
    } catch (e) {
      console.error("[ImportSources]", e && e.message ? e.message : e);
      setErr(e && e.message ? e.message : "Erreur pendant la lecture."); setPhase("error"); return;
    }
    // Intégration + apprentissage immédiats — pas de clic intermédiaire.
    setPhase("applying");
    try {
      const out = await importApply({ filename: r.filename || file.name, proposal: r.proposal, apercu: r.apercu, dataset: r.dataset, diff: r.diff });
      setApplied(out && out.entry ? out.entry : null);
      setPhase("done");
      if (onApplied) onApplied();
    } catch (e) {
      console.error("[ImportSources]", e && e.message ? e.message : e);
      setErr(e && e.message ? e.message : "Échec de l'intégration."); setPhase("error");
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) run(f); };
  const pick = (e) => { const f = e.target.files && e.target.files[0]; if (e.target) e.target.value = ""; if (f) run(f); };

  const prop = res && res.proposal;
  const diff = res && res.diff;
  const conf = prop && prop.confiance ? prop.confiance : "";
  const nb = diff ? (diff.added || 0) + (diff.modified || 0) + (diff.removed || 0) : 0;
  const learned = applied && applied.learned;

  const Recap = () => (
    <>
      <div className="imp-sec-h">Ce qui a changé</div>
      {diff ? (
        <div className="imp-diff">
          <div className="imp-diff-row">
            {diff.premiereFois ? (
              <span className="imp-diff-pill mod">Premier dépôt — référence initiale</span>
            ) : (
              <>
                {diff.added > 0 ? <span className="imp-diff-pill add">+{diff.added} ajout{diff.added > 1 ? "s" : ""}</span> : null}
                {diff.modified > 0 ? <span className="imp-diff-pill mod">~{diff.modified} modif{diff.modified > 1 ? "s" : ""}</span> : null}
                {diff.removed > 0 ? <span className="imp-diff-pill del">−{diff.removed} suppression{diff.removed > 1 ? "s" : ""}</span> : null}
                {nb === 0 ? <span className="imp-diff-pill mod">Aucun changement détecté</span> : null}
              </>
            )}
            <span className="imp-diff-d">· {diff.total} élément{diff.total > 1 ? "s" : ""} au total</span>
          </div>
          {diff.sample && diff.sample.length > 0 && (
            <ul className="imp-diff-list">
              {diff.sample.map((s, i) => (
                <li key={i} className={s.kind === "ajout" ? "add" : "mod"}>
                  <b>{s.kind === "ajout" ? "+ " : "~ "}</b>{s.nom || s.line}
                  {s.dossier ? <span className="imp-diff-d"> · {s.dossier}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="imp-diff-first">{res.apercu || "Source analysée — pas de comparaison incrémentale pour ce type."}</p>
      )}
      {prop && (
        <>
          <div className="imp-sec-h">Récapitulatif</div>
          <table className="imp-prop-t"><tbody>
            {prop.type ? <tr><th>Type de source</th><td>{prop.type}</td></tr> : null}
            {prop.client ? <tr><th>Client / dossier</th><td>{prop.client}</td></tr> : null}
            {prop.cible ? <tr><th>Effet sur cp|WIRE</th><td>{prop.cible}</td></tr> : null}
            {prop.resume ? <tr><th>En résumé</th><td>{prop.resume}</td></tr> : null}
          </tbody></table>
          {prop.details && prop.details.length > 0 && (
            <ul className="imp-details">{prop.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
          )}
          {prop.note ? <div className="warn-note">{prop.note}</div> : null}
        </>
      )}
    </>
  );

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal imp-modal" role="dialog" aria-label="Import sources">
        <div className="modal-hd">
          <div className="k">Import sources</div>
          <h3>Lire, intégrer et apprendre une source</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="modal-bd">
          {/* 1) Choix de la source */}
          {phase === "pick" && (
            <>
              <div className={`imp-drop ${drag ? "on" : ""}`}
                onClick={() => fileRef.current && fileRef.current.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}>
                <div className="imp-drop-ic">📥</div>
                <div className="imp-drop-t">Glissez une source ici, ou <u>parcourir</u></div>
                <div className="imp-formats">OneNote (.one) · Excel (.xlsx/.xls) · query / CSV · Word · PowerPoint · PDF · JSON</div>
              </div>
              <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={pick} />
              <p className="imp-hint2">cp|WIRE lit la source, l'<b>intègre</b> et la <b>mémorise automatiquement</b> : le jeu de données est conservé <i>et</i> la mémoire d'équipe (relue par l'IA à chaque rapport) est nourrie durablement. Rien ne se perd.</p>
            </>
          )}

          {/* 2) Lecture en cours */}
          {phase === "loading" && (
            <div className="imp-load">
              <div className="imp-spin" />
              <div className="imp-load-t">Lecture intelligente en cours…</div>
              <div className="imp-load-s">{fname}</div>
            </div>
          )}

          {/* 3) Intégration + apprentissage en cours (montre déjà le récap) */}
          {phase === "applying" && (
            <>
              <div className="imp-learn-banner"><span className="imp-spin sm" /> 🧠 Intégration et apprentissage dans la mémoire…</div>
              {res && <Recap />}
            </>
          )}

          {/* 4) Terminé : récap + confirmation de mémorisation */}
          {phase === "done" && (
            <>
              <div className="imp-final compact">
                <div className="imp-final-ic ok">✓</div>
                <div className="imp-final-t">Intégré et appris</div>
                <div className="imp-final-s">« {res ? (res.filename || fname) : fname} » — données conservées et chiffres rafraîchis.</div>
                {learned ? (
                  learned.ok ? (
                    <div className="imp-learn-ok">🧠 Mémorisé durablement dans la mémoire cp|WIRE — dossier <b>{learned.dossier}</b>. L'IA s'en servira à chaque rapport.</div>
                  ) : (
                    <div className="imp-learn-warn">🗂️ Conservé en jeu de données.{learned.reason ? ` ${learned.reason}` : ""}</div>
                  )
                ) : null}
              </div>
              {res && <Recap />}
              <div className="imp-actions">
                <button className="btn-solid" onClick={onClose}>Fermer</button>
                <button className="btn-line" onClick={() => { setPhase("pick"); setRes(null); setApplied(null); setErr(""); }}>Importer une autre source</button>
              </div>
            </>
          )}

          {/* Erreur */}
          {phase === "error" && (
            <div className="imp-final">
              <div className="imp-final-ic ko">!</div>
              <div className="imp-final-t">Lecture impossible</div>
              <div className="imp-final-s">{err}</div>
              <div className="imp-actions">
                <button className="btn-solid" onClick={() => { setPhase("pick"); setErr(""); setRes(null); setApplied(null); }}>Réessayer</button>
                <button className="btn-line" onClick={onClose}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
