import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchQuotes } from "../api.js";
import Sparkline from "./Sparkline.jsx";

// QuoteBoard — « la cote du portefeuille ». Reframe l'app de l'état vers le
// MOUVEMENT (écran de marché) : téléscripteur des derniers mouvements, indice
// global, et une ligne de cotation par dossier (valeur, variation, courbe,
// volume, vélocité, risque), triée par ce qui bouge le plus. Rafraîchi en direct
// au rythme des synchros — honnête : Jira n'émet pas de flux tick par tick.

const REFRESH_MS = 45000;
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
const fmtPct = (v) => (v == null ? "—" : `${v}%`);

export default function QuoteBoard({ onClient, onTicket }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState(null);
  const [flash, setFlash] = useState({});   // dossier -> "up"|"down"
  const [idxFlash, setIdxFlash] = useState("");
  const prev = useRef({});                    // dossier -> value
  const prevIdx = useRef(null);
  const timers = useRef([]);

  const load = useCallback(async () => {
    try {
      const r = await fetchQuotes();
      // Détecte les variations depuis le dernier tirage → pulse.
      const nf = {};
      for (const q of (r.quotes || [])) {
        const p = prev.current[q.dossier];
        if (p != null && q.value != null && q.value !== p) nf[q.dossier] = q.value > p ? "up" : "down";
        prev.current[q.dossier] = q.value;
      }
      if (r.index && prevIdx.current != null && r.index.value != null && r.index.value !== prevIdx.current) {
        setIdxFlash(r.index.value > prevIdx.current ? "up" : "down");
        const t = setTimeout(() => setIdxFlash(""), 2600); timers.current.push(t);
      }
      if (r.index) prevIdx.current = r.index.value;
      if (Object.keys(nf).length) {
        setFlash(nf);
        const t = setTimeout(() => setFlash({}), 2600); timers.current.push(t);
      }
      setData(r); setAt(new Date()); setErr("");
    } catch (e) { setErr(e && e.message ? e.message : String(e)); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => { clearInterval(iv); timers.current.forEach(clearTimeout); };
  }, [load]);

  if (err && !data) return <div className="qb"><p className="af-empty af-err">Cotations indisponibles : {err}</p></div>;
  if (!data) return <div className="qb"><div className="af-skel" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div></div>;

  const idx = data.index || {};
  const quotes = data.quotes || [];
  const ticker = data.ticker || [];
  const clock = at ? at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

  const VarChip = ({ dir, varDone, varPct }) => (
    <span className={`qb-var qb-${dir}`}>
      <span className="qb-arw">{dir === "up" ? "▲" : dir === "down" ? "▼" : "—"}</span>
      {varDone == null ? "—" : `${sign(varDone)}`}{varPct != null ? <small>{` ${sign(varPct)} pt`}</small> : null}
    </span>
  );

  return (
    <div className="qb">
      {/* Téléscripteur */}
      <div className="qb-ticker" aria-label="Derniers mouvements">
        <div className="qb-ticker-tag">EN DIRECT</div>
        <div className="qb-ticker-track">
          {[...ticker, ...ticker].map((t, i) => (
            <span className="qb-tk" key={i}>
              <b>{t.cle}</b> <span className="qb-tk-d">{t.dossier}</span> {t.from} → {t.to}
              <span className={`qb-tk-a qb-${t.dir}`}>{t.dir === "up" ? "▲" : "▼"}</span>
            </span>
          ))}
          {!ticker.length ? <span className="qb-tk qb-muted">Aucun mouvement récent enregistré.</span> : null}
        </div>
      </div>

      {/* Indice global */}
      <div className={`qb-index ${idxFlash ? "qb-flash-" + idxFlash : ""}`}>
        <div className="qb-index-l">
          <div className="qb-index-lbl">{idx.label || "Indice portefeuille"}</div>
          <div className="qb-index-val">{fmtPct(idx.value)}</div>
          <VarChip dir={idx.dir} varDone={idx.doneVar} varPct={idx.variation} />
        </div>
        <div className="qb-index-spark"><Sparkline data={idx.spark} dir={idx.dir} w={220} h={54} /></div>
        <div className="qb-index-meta">
          <div className="qb-im"><b>{idx.volume ?? 0}</b><span>mouvements aujourd'hui</span></div>
          <div className="qb-im"><b>{idx.dossiers ?? quotes.length}</b><span>dossiers cotés</span></div>
          <div className="qb-live"><span className="qb-live-dot" /> live · {clock}</div>
        </div>
      </div>

      <div className="qb-note">La valeur d'un dossier est son avancement ; ce qui compte est la <b>variation</b>. Trié par ce qui bouge le plus. Rafraîchi toutes les 45 s au rythme des synchros Jira — pas de flux tick par tick.</div>

      {/* Table de cotation */}
      <div className="qb-table">
        <div className="qb-hd">
          <span className="c-name">Dossier</span>
          <span className="c-val">Valeur</span>
          <span className="c-var">Variation</span>
          <span className="c-spark">Tendance</span>
          <span className="c-vol">Volume</span>
          <span className="c-vel">Vélocité</span>
          <span className="c-risk">Risque</span>
        </div>
        {quotes.map((q) => (
          <div className={`qb-row ${flash[q.dossier] ? "qb-flash-" + flash[q.dossier] : ""}`} key={q.dossier}
            onClick={() => onClient && onClient(q.dossier)} role="button" tabIndex={0}>
            <span className="c-name"><span className={`qb-tick qb-${q.dir}`} />{q.dossier}</span>
            <span className="c-val">{fmtPct(q.value)}</span>
            <span className="c-var"><VarChip dir={q.dir} varDone={q.varDone} varPct={q.varPct} /></span>
            <span className="c-spark"><Sparkline data={q.spark} dir={q.dir} /></span>
            <span className="c-vol">{q.volume ? <b>{q.volume}</b> : <i className="qb-z">0</i>}</span>
            <span className="c-vel">{q.velocite == null ? "—" : `${q.velocite}/j`}</span>
            <span className="c-risk">{q.risque == null || q.risque === 0 ? <span className="qb-risk-ok">sain</span> : <span className={`qb-risk risk-niv-${(q.niveau || "").replace(/é/g, "e")}`}>{q.risque}</span>}</span>
          </div>
        ))}
        {!quotes.length ? <div className="qb-empty">Pas encore d'historique de cotation. Il se constitue à chaque synchronisation — reviens après quelques relevés.</div> : null}
      </div>
    </div>
  );
}
