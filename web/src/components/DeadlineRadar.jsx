import { useEffect, useState } from "react";
import { fetchDeadlines } from "../api.js";

// « Ce qui a une date, quelque part » — radar des échéances, déplacé dans la Tour de contrôle.
// Donnée RÉELLE : /api/deadlines (buildDeadlineRadar, server/deadlines.js) — extraction
// DÉTERMINISTE des dates jj/mm[/aaaa] écrites dans les fiches dossiers + la mémoire d'équipe.
// Zéro invention : si aucune date n'est écrite, rien ne s'affiche.

function relatif(j) {
  if (j < 0) return `en retard de ${-j} j`;
  if (j === 0) return "aujourd'hui";
  if (j === 1) return "demain";
  return `dans ${j} j`;
}

export default function DeadlineRadar({ onOpen }) {
  const [radar, setRadar] = useState(null);
  const [radarOpen, setRadarOpen] = useState(false);
  const [deduiteInfo, setDeduiteInfo] = useState(null); // clé "dossier|date" dont l'explication est ouverte

  useEffect(() => {
    let on = true;
    fetchDeadlines().then((r) => { if (on) setRadar(r.radar || []); }).catch(() => { if (on) setRadar([]); });
    return () => { on = false; };
  }, []);

  const Intro = () => (
    <>
      <div className="af-intro">
        <b>Ce qui a une date, quelque part.</b> Rassemblé automatiquement depuis vos fiches dossiers et la mémoire d'équipe — une seule ligne par échéance, même si elle est redite à plusieurs endroits. Extraction déterministe, zéro invention : rien n'est fabriqué.
      </div>
      <p className="af-do">→ <b>Quoi en faire :</b> traite d'abord <b>en retard</b> et <b>cette semaine</b>. Une ligne <b>⚠️ divergente</b> = deux sources se contredisent sur la date, à trancher (aucun choix automatique n'a été fait). Clique un client ou une source pour ouvrir la fiche.</p>
    </>
  );

  if (radar === null) return <div className="af"><Intro /><div className="af-skel" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div></div>;
  if (!radar.length) return <div className="af"><Intro /><p className="af-empty">Aucune échéance datée détectée dans les fiches dossiers ni la mémoire d'équipe.</p></div>;

  const urgent = radar.filter((r) => r.statut === "retard" || r.statut === "semaine");
  const lointain = radar.filter((r) => r.statut === "mois" || r.statut === "plus_tard");
  // Une divergence reste visible même repliée : un désaccord entre sources est une alerte de
  // fiabilité des données, pas une question d'urgence de date.
  const list = radarOpen ? radar : [...urgent, ...lointain.filter((r) => r.divergence)];
  const fmtD = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return iso; } };
  const cleDe = (r) => `${r.dossier}|${r.date}`; // ancre stable pour sauter d'une ligne à l'autre
  const ouvrir = (d) => { if (onOpen) onOpen(d); }; // jamais de clic mort
  const sauterVers = (dossier, date) => {
    const el = document.querySelector(`[data-radar-cle="${dossier}|${date}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("radar-flash");
    setTimeout(() => el.classList.remove("radar-flash"), 1600);
  };

  return (
    <div className="af">
      <Intro />
      <div className="panel radar-panel">
        <div className="radar-hd">
          <span className="radar-title">🧭 Ce qui a une date, quelque part</span>
          <span className="radar-sub">Extrait de vos fiches dossiers et de la mémoire d'équipe — une seule ligne par échéance, même redite à plusieurs endroits.</span>
        </div>
        {list.length ? (
          <ul className="radar-list">
            {list.map((r, i) => (
              <li key={i} data-radar-cle={cleDe(r)} className={`radar-item radar-${r.statut} ${r.divergence ? "radar-divergent" : ""}`}>
                <div className="radar-row">
                  <button type="button" className="radar-dossier" onClick={() => ouvrir(r.dossier)} title={`Ouvrir la fiche ${r.dossier}`}>{r.dossier}</button>
                  <button type="button" className="radar-label" onClick={() => ouvrir(r.dossier)} title="Voir le détail chez ce client">{r.label}</button>
                  <span className="radar-when">
                    {relatif(r.joursRestants)}
                    {r.yearInferred && (
                      <button type="button" className="radar-inf" onClick={() => setDeduiteInfo((v) => (v === cleDe(r) ? null : cleDe(r)))} title="Pourquoi cette année ?">
                        {" "}· année déduite ⓘ
                      </button>
                    )}
                  </span>
                </div>
                {deduiteInfo === cleDe(r) && (
                  <div className="radar-info">
                    Aucune année n'était écrite à côté de cette date. cp|WIRE l'a déduite du contexte (une autre date proche portant une année explicite, ou l'année en cours si la date était trop ancienne) — <button type="button" className="radar-linklike" onClick={() => ouvrir(r.dossier)}>vérifier dans la fiche</button>.
                  </div>
                )}
                <div className="radar-meta">
                  {r.sources.length > 1 ? (
                    <span className="radar-confirm">✓ confirmé par {r.sources.length} sources :{" "}
                      {r.sources.map((s, j) => (
                        <button type="button" key={s} className="radar-srcbtn" onClick={() => ouvrir(r.dossier)} title={`Voir la source « ${s} » chez ${r.dossier}`}>{s}{j < r.sources.length - 1 ? "," : ""}</button>
                      ))}
                    </span>
                  ) : (
                    <button type="button" className="radar-srcbtn radar-src" onClick={() => ouvrir(r.dossier)} title={`Voir la source « ${r.sources[0]} » chez ${r.dossier}`}>source : {r.sources[0]}</button>
                  )}
                </div>
                {r.divergence && (
                  <div className="radar-warn">
                    ⚠️ Des sources se contredisent : {r.sources.join("/")} dit {fmtD(r.date)}
                    {r.divergence.map((d, j) => (
                      <span key={j}> · une autre mention dit{" "}
                        <button type="button" className="radar-linklike" onClick={() => sauterVers(r.dossier, d.date)} title="Voir cette autre mention dans la liste">
                          <b>{fmtD(d.date)}</b> ({d.label})
                        </button>
                      </span>
                    ))}
                    {" "}— à vérifier, aucun choix automatique n'a été fait.
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="af-empty" style={{ margin: "10px 0 0" }}>Rien d'urgent pour l'instant.</p>
        )}
        {lointain.filter((r) => !r.divergence).length > 0 && (
          <button type="button" className="radar-more" onClick={() => setRadarOpen((v) => !v)}>
            {radarOpen ? "▾ Masquer les échéances plus lointaines" : `▸ ${lointain.filter((r) => !r.divergence).length} échéance${lointain.length > 1 ? "s" : ""} plus lointaine${lointain.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}
