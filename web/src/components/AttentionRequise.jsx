import React, { useEffect, useState } from "react";
import { fetchHygiene, fetchSla } from "../api.js";
import { computeAttention, SEV } from "../attention.js";

// Section « Attention requise » — répond à : quels clients ont besoin de moi
// aujourd'hui ? Autonome : récupère hygiène + SLA, dégrade proprement si l'une
// manque (le moteur ignore les signaux absents, jamais d'invention).
export default function AttentionRequise({ facts, rows: rowsProp, team = [], onOpen360, can360 }) {
  const [hygiene, setHygiene] = useState(null);
  const [sla, setSla] = useState(null);
  const need = !rowsProp;

  useEffect(() => {
    if (!need) return undefined;
    let on = true;
    fetchHygiene().then((r) => { if (on) setHygiene(r); }).catch(() => { if (on) setHygiene(null); });
    fetchSla().then((r) => { if (on) setSla(r); }).catch(() => { if (on) setSla(null); });
    return () => { on = false; };
  }, [need]);

  const rows = rowsProp || computeAttention(facts, { hygiene, sla });
  const flagged = rows.filter((r) => r.severity !== SEV.CONTROLE);
  const open = (d) => { if (onOpen360 && (!can360 || can360(d))) onOpen360(d); };

  return (
    <section className="attn">
      <div className="section-title attn-title">
        <span>Attention requise</span>
        <span className="attn-hd-c">{flagged.length === 0 ? "tout est sous contrôle" : `${flagged.length} client${flagged.length > 1 ? "s" : ""}`}</span>
      </div>

      {flagged.length === 0 ? (
        <div className="attn-empty">
          <span className="attn-empty-dot" aria-hidden="true" />
          Rien de critique aujourd'hui. Tu peux piloter sereinement.
        </div>
      ) : (
        <div className="attn-list">
          {flagged.map((r) => (
            <button key={r.dossier} className={`attn-row ${r.severity}`} onClick={() => open(r.dossier)} title="Ouvrir la fiche client">
              <span className="attn-pastille" aria-hidden="true" />
              <span className="attn-body">
                <span className="attn-line1">
                  <span className="attn-dossier">{r.dossier}</span>
                  <span className="attn-reasons">{r.reasons.map((x) => x.text).join(" · ")}</span>
                </span>
                {r.action ? <span className="attn-action">→ {r.action}</span> : null}
              </span>
              <span className="attn-chev" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {team && team.length > 0 ? (
        <div className="attn-team">
          <span className="attn-team-dot" aria-hidden="true" />
          <span>Équipe — {team.length} dév{team.length > 1 ? "s" : ""} très chargé{team.length > 1 ? "s" : ""} : {team.slice(0, 3).map((d) => `${d.nom} (${d.enCours} en cours)`).join(" · ")}</span>
        </div>
      ) : null}
    </section>
  );
}
