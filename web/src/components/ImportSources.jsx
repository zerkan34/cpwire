import React, { useRef, useState } from "react";
import { importAnalyze, importApply } from "../api.js";

// ============================================================================
//  Import sources — remplace « Importer OneNote ».
//  On dépose une source (OneNote, Excel, fichier query/CSV…), cp|WIRE la LIT
//  intelligemment côté serveur, montre CE QUI A CHANGÉ (ligne de diff + liste)
//  et un RÉCAP structuré (ce que ça met à jour, ce que ça induit), puis on
//  applique en un clic. Zéro chiffre inventé : tout vient de l'analyse serveur.
//  Phases : pick → loading → result → applying → done / error.
// ============================================================================
const ACCEPT = ".one,.xlsx,.xls,.csv,.tsv,.txt,.json,.md,.docx,.pptx,.pdf";

export default function ImportSources({ onClose, onApplied }) {
  const [phase, setPhase] = useState("pick");
  const [fname, setFname] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  const analyze = async (file) => {
    if (!file) return;
    setFname(file.name); setErr(""); setPhase("loading");
    try {
      const r = await importAnalyze(file);
      if (!r || r.ok === false || r.error) { setErr((r && r.error) || "Source non exploitable pour l'analyse."); setPhase("error"); return; }
      setRes(r); setPhase("result");
    } catch (e) {
      setErr(e && e.message ? e.message : "Erreur pendant la lecture."); setPhase("error");
    }
  };

  const apply = async () => {
    if (!res) return;
    setPhase("applying");
    try {
      await importApply({ filename: res.filename || fname, proposal: res.proposal, apercu: res.apercu, dataset: res.dataset, diff: res.diff });
      setPhase("done");
      if (onApplied) onApplied();
    } catch (e) {
      setErr(e && e.message ? e.message : "Échec de l'application."); setPhase("error");
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) analyze(f); };
  const pick = (e) => { const f = e.target.files && e.target.files[0]; if (e.target) e.target.value = ""; if (f) analyze(f); };

  const prop = res && res.proposal;
  const diff = res && res.diff;
  const conf = prop && prop.confiance ? prop.confiance : "";
  const nb = diff ? (diff.added || 0) + (diff.modified || 0) + (diff.removed || 0) : 0;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal imp-modal" role="dialog" aria-label="Import sources">
        <div className="modal-hd">
          <div className="k">Import sources</div>
          <h3>Lire une source et mettre à jour cp|WIRE</h3>
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
                <div className="imp-formats">OneNote (.one) · Excel (.xlsx/.xls) · fichier query / CSV · Word · PowerPoint · PDF · JSON</div>
              </div>
              <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={pick} />
              <p className="imp-hint2">cp|WIRE lit la source, repère ce qui a changé depuis le dernier import, et vous montre un récap avant toute mise à jour. Rien n'est appliqué sans votre validation.</p>
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

          {/* 3) Résultat : ce qui a changé + récap structuré */}
          {phase === "result" && res && (
            <>
              <div className="imp-res-head">
                <span className="imp-fname">📄 {res.filename || fname}</span>
                {conf ? <span className={`imp-conf c-${conf}`}>confiance {conf}</span> : null}
              </div>

              {/* Ligne des éléments qui ont changé */}
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
                <p className="imp-diff-first">{res.apercu || "Source analysée — pas de comparaison incrémentale disponible pour ce type."}</p>
              )}

              {/* Récap structuré + ce que ça induit */}
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

              <div className="imp-actions">
                <button className="btn-solid gold" onClick={apply}>✓ Appliquer la mise à jour</button>
                <button className="btn-line" onClick={onClose}>Annuler</button>
              </div>
            </>
          )}

          {/* 4) Application */}
          {phase === "applying" && (
            <div className="imp-load">
              <div className="imp-spin" />
              <div className="imp-load-t">Mise à jour de cp|WIRE…</div>
            </div>
          )}

          {/* 5) Terminé */}
          {phase === "done" && (
            <div className="imp-final">
              <div className="imp-final-ic ok">✓</div>
              <div className="imp-final-t">cp|WIRE est à jour</div>
              <div className="imp-final-s">Les éléments de « {res ? (res.filename || fname) : fname} » ont été intégrés. Les chiffres se rafraîchissent.</div>
              <button className="btn-solid" onClick={onClose}>Fermer</button>
            </div>
          )}

          {/* Erreur */}
          {phase === "error" && (
            <div className="imp-final">
              <div className="imp-final-ic ko">!</div>
              <div className="imp-final-t">Lecture impossible</div>
              <div className="imp-final-s">{err}</div>
              <div className="imp-actions">
                <button className="btn-solid" onClick={() => { setPhase("pick"); setErr(""); setRes(null); }}>Réessayer</button>
                <button className="btn-line" onClick={onClose}>Fermer</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
