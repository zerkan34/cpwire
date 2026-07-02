import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchQuotes, fetchPortfolioMonthly, fetchDeadlines } from "../api.js";
import Sparkline from "./Sparkline.jsx";
import CopilotDot from "./CopilotDot.jsx";

// Poste de commandement — l'accueil UNIFIÉ de cp|WIRE.
// Un seul écran, une seule mécanique : la PORTÉE (Tout / Client / Projet / TMA)
// recalcule TOUT (camembert = total filtrable, KPIs, ticker « bourse », barres).
// Tout est cliquable et renvoie exactement là où il faut. Zéro invention :
// chaque chiffre vient de computeFacts (réel) ou de /api/quotes (pointHistory).

const REFRESH_MS = 45000;
const C = { navy:"#2E2A5D", indigo:"#4B3F8F", gold:"#A88B4B", goldlt:"#BFA168", mauve:"#7E6B9E", rose:"#B58BA6", grey:"#6E6A86", green:"#2F7D4F", orange:"#C2691A", red:"#b23b46" };
const PAL = [C.navy, C.indigo, C.mauve, C.gold, C.goldlt, C.rose, "#5B6BA8", "#8E6FA4", "#B98E52", "#6E6A86"];
const norm = (s) => String(s || "").trim();
const sign = (n) => (n == null ? "" : n > 0 ? `+${n}` : `${n}`);
const engOf = (v) => (v instanceof Set ? [...v] : Array.isArray(v) ? v : []);
const isTMA = (arr) => arr.some((e) => /tma/i.test(e));
const isProjet = (arr) => arr.some((e) => /projet/i.test(e));

// Secteur d'anneau (camembert évidé) — chemin SVG.
function ring(cx, cy, rO, rI, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const lg = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(rO, a0), [x1, y1] = p(rO, a1), [xi1, yi1] = p(rI, a1), [xi0, yi0] = p(rI, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rO} ${rO} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${xi1.toFixed(2)} ${yi1.toFixed(2)} A${rI} ${rI} 0 ${lg} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`;
}

export default function PosteCommandement({ facts, engagement = {}, onClient, onTicket, goTo }) {
  const [scope, setScope] = useState({ type: "all", value: null });
  const [pick, setPick] = useState("");          // "client" → dropdown ouvert
  const [q, setQ] = useState(null);
  const [at, setAt] = useState(null);
  const [flash, setFlash] = useState({});         // dossier -> "up"|"down" (pulsation au changement)
  const [barMode, setBarMode] = useState("dossier"); // "dossier" | "mois"
  const [monthly, setMonthly] = useState([]);
  const [radar, setRadar] = useState([]);
  const prev = useRef({});
  const timers = useRef([]);

  useEffect(() => { fetchPortfolioMonthly().then((r) => setMonthly(r.months || [])).catch(() => setMonthly([])); }, []);
  useEffect(() => { fetchDeadlines().then((r) => setRadar((r && r.radar) || [])).catch(() => setRadar([])); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetchQuotes();
      const nf = {};
      for (const it of (r.quotes || [])) {
        const p = prev.current[it.dossier];
        if (p != null && it.value != null && it.value !== p) nf[it.dossier] = it.value > p ? "up" : "down";
        prev.current[it.dossier] = it.value;
      }
      if (Object.keys(nf).length) { setFlash(nf); const t = setTimeout(() => setFlash({}), 3200); timers.current.push(t); }
      setQ(r); setAt(new Date());
    } catch { /* silencieux : le reste de la page vit sur facts */ }
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, REFRESH_MS); return () => { clearInterval(iv); timers.current.forEach(clearTimeout); }; }, [load]);

  const byD = facts?.byDossier || {};
  const dossiers = useMemo(() => Object.keys(byD), [byD]);

  const inScope = useCallback((d) => {
    if (scope.type === "all") return true;
    if (scope.type === "client") return norm(d) === norm(scope.value);
    if (scope.type === "tma") return isTMA(engOf(engagement[d]));
    if (scope.type === "projet") return isProjet(engOf(engagement[d]));
    return true;
  }, [scope, engagement]);

  const scoped = useMemo(() => dossiers.filter(inScope), [dossiers, inScope]);

  // Agrégat réel de la portée (somme des blocs computeFacts).
  const agg = useMemo(() => {
    const a = { total: 0, valides: 0, actifsDev: 0, enRecette: 0, retours: 0, afaire: 0, enRetard: 0 };
    for (const d of scoped) {
      const b = byD[d]; if (!b) continue;
      a.total += b.total || 0; a.valides += b.valides || 0; a.actifsDev += b.actifsDev || 0;
      a.enRecette += b.enRecette || 0; a.retours += b.retours || 0;
      a.afaire += (b.cats && b.cats.afaire) || 0; a.enRetard += b.enRetard || 0;
    }
    a.pct = a.total ? Math.round((a.valides / a.total) * 100) : 0;
    return a;
  }, [scoped, byD]);

  // Segments du camembert : par dossier (portée large) OU par statut (un seul dossier).
  const single = scope.type === "client" && scoped.length === 1;
  const segs = useMemo(() => {
    if (single) {
      const b = byD[scoped[0]] || {};
      return [
        { label: "Terminé", value: b.valides || 0, col: C.goldlt },
        { label: "En recette", value: b.enRecette || 0, col: C.gold },
        { label: "En cours", value: b.actifsDev || 0, col: C.indigo },
        { label: "À faire", value: (b.cats && b.cats.afaire) || 0, col: C.navy },
        { label: "Retours", value: b.retours || 0, col: C.orange },
      ].filter((s) => s.value > 0);
    }
    const rows = scoped.map((d) => ({ label: d, value: byD[d]?.total || 0 }))
      .filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 8);
    const rest = rows.slice(8).reduce((n, r) => n + r.value, 0);
    const out = top.map((r, i) => ({ ...r, col: PAL[i % PAL.length] }));
    if (rest > 0) out.push({ label: "Autres", value: rest, col: "#B8B2CC" });
    return out;
  }, [single, scoped, byD]);

  const donutTotal = segs.reduce((n, s) => n + s.value, 0);

  // Barres empilées : composition par dossier (À faire / En cours / En recette / Terminé / Retours).
  const bars = useMemo(() => {
    const rows = scoped.map((d) => {
      const b = byD[d] || {};
      return { d, afaire: (b.cats && b.cats.afaire) || 0, encours: b.actifsDev || 0, recette: b.enRecette || 0, termine: b.valides || 0, retours: b.retours || 0, total: b.total || 0 };
    }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
    const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
    return { rows, max };
  }, [scoped, byD]);

  // Barres MENSUELLES (cumul réel) filtrées sur la portée.
  const MLAB = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
  const monthBars = useMemo(() => {
    const rows = (monthly || []).map((m) => {
      let r;
      if (scope.type === "all") r = m.all || {};
      else if (scope.type === "client") r = (m.byDossier || {})[scope.value] || {};
      else { r = { termine: 0, recette: 0, encours: 0, retours: 0, attente: 0 }; for (const d of scoped) { const x = (m.byDossier || {})[d]; if (x) { r.termine += x.termine || 0; r.recette += x.recette || 0; r.encours += x.encours || 0; r.retours += x.retours || 0; r.attente += x.attente || 0; } } }
      const tot = (r.termine || 0) + (r.recette || 0) + (r.encours || 0) + (r.retours || 0) + (r.attente || 0);
      const [y, mo] = m.month.split("-");
      return { month: m.month, label: `${MLAB[(+mo) - 1] || mo} ${y.slice(2)}`, termine: r.termine || 0, recette: r.recette || 0, encours: r.encours || 0, retours: r.retours || 0, attente: r.attente || 0, tot };
    }).filter((r) => r.tot > 0);
    const max = rows.reduce((m, r) => Math.max(m, r.tot), 0) || 1;
    return { rows, max };
  }, [monthly, scope, scoped]);

  // Prochaines échéances (encart) — filtrées sur la portée, les plus proches d'abord.
  const dfmt = (iso) => { const [, m, d] = iso.split("-"); return `${(+d)} ${MLAB[(+m) - 1] || m}`; };
  const deadlines = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (radar || [])
      .filter((r) => r.date && r.date >= today)
      .filter((r) => (scope.type === "all" ? true : scoped.includes(r.dossier)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [radar, scope, scoped]);

  // Ticker (mouvements en direct) filtré sur la portée, plafonné à 50.
  const ticker = useMemo(() => {
    const all = (q && q.ticker) || [];
    const f = scope.type === "all" ? all : all.filter((t) => scoped.includes(t.dossier));
    return f.slice(0, 50);
  }, [q, scope, scoped]);

  // « Ce qui bouge le plus » : cotations triées (serveur) filtrées portée.
  const movers = useMemo(() => {
    const all = (q && q.quotes) || [];
    const f = scope.type === "all" ? all : all.filter((x) => scoped.includes(x.dossier));
    return f.slice(0, 6);
  }, [q, scope, scoped]);

  // Indice + variation de la portée.
  const idx = q && q.index ? q.index : null;
  const scopedSpark = single ? ((q?.quotes || []).find((x) => x.dossier === scoped[0])?.spark || []) : (idx?.spark || []);
  const idxVal = single ? ((q?.quotes || []).find((x) => x.dossier === scoped[0])?.value ?? agg.pct) : (idx?.value ?? agg.pct);
  const idxVar = single ? ((q?.quotes || []).find((x) => x.dossier === scoped[0])?.varDone ?? null) : (idx?.doneVar ?? null);

  const scopeLabel = scope.type === "all" ? "Tout le portefeuille"
    : scope.type === "client" ? scope.value
    : scope.type === "tma" ? "Périmètre TMA" : "Périmètre Projet";
  const clock = at ? at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  const setAll = () => { setScope({ type: "all", value: null }); setPick(""); };
  const pilotPrompt = `Fais-moi le point sur ${scope.type === "client" ? `le dossier ${scope.value}` : scope.type === "tma" ? "le périmètre TMA" : scope.type === "projet" ? "les projets" : "le portefeuille"} : ce qui bouge, ce qui coince, ce qu'il faut regarder.`;
  const cx = 132, cy = 150;
  let ang = -Math.PI / 2;

  return (
    <div className="pc2">
      {/* barre de PORTÉE */}
      <div className="pc2-scope">
        <span className="pc2-scope-lbl">PORTÉE</span>
        <button className={`pc2-chip ${scope.type === "all" ? "on" : ""}`} onClick={setAll}>Tout</button>
        <div className="pc2-chipwrap">
          <button className={`pc2-chip ${scope.type === "client" ? "on" : ""}`} onClick={() => setPick(pick === "client" ? "" : "client")}>
            {scope.type === "client" ? scope.value : "Client"} ▾
          </button>
          {pick === "client" && (
            <div className="pc2-menu">
              {dossiers.slice().sort().map((d) => (
                <button key={d} className="pc2-menu-it" onClick={() => { setScope({ type: "client", value: d }); setPick(""); }}>{d}</button>
              ))}
            </div>
          )}
        </div>
        <button className={`pc2-chip ${scope.type === "projet" ? "on" : ""}`} onClick={() => { setScope({ type: "projet", value: null }); setPick(""); }}>Projet</button>
        <button className={`pc2-chip ${scope.type === "tma" ? "on" : ""}`} onClick={() => { setScope({ type: "tma", value: null }); setPick(""); }}>TMA</button>
        {scope.type !== "all" && <button className="pc2-reset" onClick={setAll}>× réinitialiser</button>}
        <div className="pc2-spacer" />
        <CopilotDot prompt={pilotPrompt} label="Demander à Natacha" />
      </div>

      {/* ticker EN DIRECT (défile, pulsations) */}
      <div className="pc2-tk" title="Mouvements en direct — survolez pour mettre en pause">
        <span className="pc2-tk-live">EN DIRECT{clock ? ` · ${clock}` : ""}</span>
        <div className="pc2-tk-vp">
          {ticker.length ? (
            <div className="pc2-tk-track">
              {[0, 1].map((dup) => (
                <span className="pc2-tk-seg" key={dup} aria-hidden={dup === 1}>
                  {ticker.map((t, i) => (
                    <button key={dup + "-" + i} className={`pc2-tk-item ${flash[t.dossier] || ""} ${flash[t.dossier] ? "pulse" : ""}`}
                      onClick={() => onTicket && onTicket(t.cle)} title={`Ouvrir ${t.cle}`}>
                      <b>{t.cle}</b> · {t.dossier} · {t.from} → {t.to} <i>{t.dir === "down" ? "▼" : "▲"}</i>
                    </button>
                  ))}
                </span>
              ))}
            </div>
          ) : <span className="pc2-tk-empty">Aucun mouvement récent sur cette portée.</span>}
        </div>
      </div>

      <div className="pc2-grid">
        {/* colonne gauche : camembert + barres */}
        <div className="pc2-col">
          <div className="pc2-card">
            <div className="pc2-h"><span className="pc2-sq" />RÉPARTITION — {scopeLabel.toUpperCase()}</div>
            <div className="pc2-sub">{single ? "Composition du dossier par statut." : "Le camembert = le total de la portée. Cliquez un secteur pour filtrer."}</div>
            <div className="pc2-donutrow">
              <svg width="264" height="300" viewBox="0 0 264 300" role="img" aria-label="Répartition">
                {segs.map((s, i) => {
                  const a0 = ang, a1 = ang + (donutTotal ? (2 * Math.PI * s.value) / donutTotal : 0); ang = a1;
                  const clickable = !single;
                  return <path key={i} d={ring(cx, cy, 108, 66, a0, a1)} fill={s.col}
                    style={{ cursor: clickable ? "pointer" : "default" }}
                    onClick={() => clickable && setScope({ type: "client", value: s.label })}>
                    <title>{s.label} — {s.value}{donutTotal ? ` (${Math.round(s.value / donutTotal * 100)}%)` : ""}</title>
                  </path>;
                })}
                <circle cx={cx} cy={cy} r="66" fill="#fff" />
                <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="Poppins" fontWeight="800" fontSize="30" fill={C.navy}>{donutTotal}</text>
                <text x={cx} y={cy + 20} textAnchor="middle" fontFamily="Inter" fontSize="12" fill={C.grey}>{single ? "tickets" : "tickets suivis"}</text>
              </svg>
              <ul className="pc2-leg">
                {segs.map((s, i) => (
                  <li key={i} className={!single ? "clk" : ""} onClick={() => !single && setScope({ type: "client", value: s.label })}>
                    <span className="pc2-dot" style={{ background: s.col }} />
                    <span className="pc2-leg-n">{s.label}</span>
                    <span className="pc2-leg-v">{s.value} · {donutTotal ? Math.round(s.value / donutTotal * 100) : 0}%</span>
                  </li>
                ))}
                {!segs.length && <li className="pc2-leg-empty">Aucune donnée sur cette portée.</li>}
              </ul>
            </div>
          </div>

          <div className="pc2-card">
            <div className="pc2-h"><span className="pc2-sq" />{barMode === "mois" ? "MOUVEMENTS PAR MOIS" : "COMPOSITION PAR DOSSIER"}
              <span className="pc2-barmode">
                <button className={barMode === "mois" ? "on" : ""} onClick={() => setBarMode("mois")}>Par mois</button>
                <button className={barMode === "dossier" ? "on" : ""} onClick={() => setBarMode("dossier")}>Par dossier</button>
              </span>
            </div>
            <div className="pc2-legmini">
              {barMode === "mois"
                ? <><em style={{ background: C.goldlt }} />Terminé<em style={{ background: C.gold }} />Recette<em style={{ background: C.indigo }} />En cours<em style={{ background: C.orange }} />Retours<em style={{ background: C.mauve }} />Attente</>
                : <><em style={{ background: C.navy }} />À faire<em style={{ background: C.indigo }} />En cours<em style={{ background: C.gold }} />Recette<em style={{ background: C.goldlt }} />Terminé<em style={{ background: C.orange }} />Retours</>}
            </div>
            {barMode === "mois" ? (
              <div className="pc2-bars">
                {monthBars.rows.map((r) => {
                  const seg = (v, col) => v > 0 ? <span className="pc2-bar-seg" style={{ height: `${(v / monthBars.max) * 160}px`, background: col }} title={`${v}`} /> : null;
                  return (
                    <div className="pc2-bar" key={r.month} title={`${r.label} — ${r.tot} tickets suivis`}>
                      <div className="pc2-bar-stack">{seg(r.termine, C.goldlt)}{seg(r.recette, C.gold)}{seg(r.encours, C.indigo)}{seg(r.retours, C.orange)}{seg(r.attente, C.mauve)}</div>
                      <div className="pc2-bar-lbl">{r.label}</div>
                    </div>
                  );
                })}
                {!monthBars.rows.length && <div className="pc2-leg-empty">Le cumul mensuel démarre : il se remplira mois après mois (aucune donnée inventée).</div>}
              </div>
            ) : (
              <div className="pc2-bars">
                {bars.rows.map((r) => {
                  const seg = (v, col) => v > 0 ? <span className="pc2-bar-seg" style={{ height: `${(v / bars.max) * 160}px`, background: col }} title={`${v}`} /> : null;
                  return (
                    <div className="pc2-bar" key={r.d} onClick={() => setScope({ type: "client", value: r.d })} title={`${r.d} — ${r.total} tickets`}>
                      <div className="pc2-bar-stack">
                        {seg(r.termine, C.goldlt)}{seg(r.recette, C.gold)}{seg(r.encours, C.indigo)}{seg(r.afaire, C.navy)}{seg(r.retours, C.orange)}
                      </div>
                      <div className="pc2-bar-lbl">{r.d}</div>
                    </div>
                  );
                })}
                {!bars.rows.length && <div className="pc2-leg-empty">Aucune donnée sur cette portée.</div>}
              </div>
            )}
          </div>
        </div>

        {/* colonne droite : KPIs + indice + ce qui bouge */}
        <div className="pc2-col">
          <button className="pc2-kpi" onClick={() => goTo && goTo("signaux", "")}>
            <b>{agg.pct}%</b><span>Indice — {single ? scope.value : "portefeuille"}</span>
            {idxVar != null && <em className={idxVar >= 0 ? "up" : "down"}>{idxVar >= 0 ? "▲" : "▼"} {sign(idxVar)}</em>}
          </button>
          <button className="pc2-kpi" onClick={() => goTo && goTo("signaux", "")}>
            <b>{agg.enRetard}</b><span>En retard (SLA à surveiller)</span>
            <em className={agg.enRetard ? "down" : "up"}>{agg.enRetard ? "à traiter" : "sain"}</em>
          </button>
          <button className="pc2-kpi" onClick={() => goTo && goTo("explorateur", "")}>
            <b>{agg.afaire}</b><span>À faire / en attente</span>
            <em className="flat">{agg.retours} retour{agg.retours > 1 ? "s" : ""}</em>
          </button>

          <div className="pc2-card pc2-spark">
            <div className="pc2-h sm"><span className="pc2-sq" />INDICE — TENDANCE</div>
            {scopedSpark.length > 1
              ? <Sparkline data={scopedSpark} dir={idxVar == null ? "flat" : idxVar > 0 ? "up" : idxVar < 0 ? "down" : "flat"} w={300} h={64} />
              : <div className="pc2-leg-empty">Historique insuffisant pour tracer la tendance.</div>}
          </div>

          <div className="pc2-card pc2-movers">
            <div className="pc2-h sm"><span className="pc2-sq" />CE QUI BOUGE LE PLUS</div>
            <ul>
              {movers.map((m) => (
                <li key={m.dossier} onClick={() => onClient && onClient(m.dossier)} title={`Ouvrir ${m.dossier}`}>
                  <span className={`pc2-mv-dot ${m.dir}`} />
                  <span className="pc2-mv-n">{m.dossier}</span>
                  <span className={`pc2-mv-v ${m.dir}`}>{m.varDone == null ? "—" : (m.varDone > 0 ? `▲ +${m.varDone}` : m.varDone < 0 ? `▼ ${m.varDone}` : "0")}</span>
                </li>
              ))}
              {!movers.length && <li className="pc2-leg-empty">Rien à signaler sur cette portée.</li>}
            </ul>
          </div>

          <div className="pc2-card pc2-movers">
            <div className="pc2-h sm"><span className="pc2-sq" />PROCHAINES ÉCHÉANCES</div>
            <ul>
              {deadlines.map((r, i) => (
                <li key={i} onClick={() => onClient && onClient(r.dossier)} title={`Ouvrir ${r.dossier}`}>
                  <span className="pc2-dl-date">{dfmt(r.date)}</span>
                  <span className="pc2-mv-n">{r.dossier}</span>
                  {r.label && <span className="pc2-dl-lbl">{r.label}</span>}
                </li>
              ))}
              {!deadlines.length && <li className="pc2-leg-empty">Aucune échéance datée sur cette portée.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
