import { useMemo, useState } from "react";

// Historique d'apprentissage — courbe de ce que cp|WIRE « connaît » dans le temps.
// Source RÉELLE : dates Jira (cree = élément appris, maj = dernier mouvement) + couche IA (auto.at).
// Aucune donnée inventée : si rien de daté, états vides.

const norm = (s) => String(s || "").trim();
const PAD = (n) => String(n).padStart(2, "0");
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const WIN = { jour: 45, semaine: 26, mois: 24, annee: 12 };
const GRANS = [["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"]];

function bucketStart(d, gran) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  if (gran === "jour") return x;
  if (gran === "semaine") { const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; }
  if (gran === "mois") { x.setDate(1); return x; }
  x.setMonth(0, 1); return x;
}
function nextBucket(d, gran) {
  const x = new Date(d);
  if (gran === "jour") x.setDate(x.getDate() + 1);
  else if (gran === "semaine") x.setDate(x.getDate() + 7);
  else if (gran === "mois") x.setMonth(x.getMonth() + 1);
  else x.setFullYear(x.getFullYear() + 1);
  return x;
}
function keyOf(d, gran) {
  const x = bucketStart(d, gran);
  if (gran === "annee") return `${x.getFullYear()}`;
  if (gran === "mois") return `${x.getFullYear()}-${PAD(x.getMonth() + 1)}`;
  return `${x.getFullYear()}-${PAD(x.getMonth() + 1)}-${PAD(x.getDate())}`;
}
function labelOf(d, gran) {
  if (gran === "annee") return `${d.getFullYear()}`;
  if (gran === "mois") return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return `${PAD(d.getDate())}/${PAD(d.getMonth() + 1)}`;
}
const fmtDT = (d) => { try { return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; } };

export default function LearningHistory({ issues = [], k = null }) {
  const [client, setClient] = useState("Tous");
  const [gran, setGran] = useState("mois");

  const clients = useMemo(
    () => [...new Set(issues.map((i) => norm(i.dossier)).filter((d) => d && d !== "—"))].sort(),
    [issues]
  );
  const F = useMemo(() => (client === "Tous" ? issues : issues.filter((i) => norm(i.dossier) === client)), [issues, client]);

  // Série : éléments appris (cree) bucketisés, cumul depuis l'origine, fenêtre = derniers WIN buckets.
  const series = useMemo(() => {
    const dated = F.map((i) => (i.cree ? new Date(i.cree) : null)).filter((d) => d && !isNaN(d)).sort((a, b) => a - b);
    if (!dated.length) return { buckets: [], total: 0 };
    const counts = new Map();
    dated.forEach((d) => { const key = keyOf(d, gran); counts.set(key, (counts.get(key) || 0) + 1); });
    const end = bucketStart(new Date(), gran);
    let cur = bucketStart(dated[0], gran);
    const all = []; let guard = 0;
    while (cur <= end && guard < 6000) {
      const key = keyOf(cur, gran);
      all.push({ date: new Date(cur), key, neuf: counts.get(key) || 0, label: labelOf(cur, gran) });
      cur = nextBucket(cur, gran); guard++;
    }
    let cum = 0; all.forEach((b) => { cum += b.neuf; b.cumul = cum; });
    return { buckets: all.slice(-WIN[gran]), total: cum };
  }, [F, gran]);

  // Aujourd'hui + dernière mise à jour réelle.
  const live = useMemo(() => {
    const t = new Date().toDateString();
    const neufAuj = F.filter((i) => i.cree && new Date(i.cree).toDateString() === t).length;
    const majAuj = F.filter((i) => i.maj && new Date(i.maj).toDateString() === t).length;
    let last = null;
    F.forEach((i) => { const m = i.maj ? new Date(i.maj) : null; if (m && !isNaN(m) && (!last || m > last)) last = m; });
    return { neufAuj, majAuj, last };
  }, [F]);

  // Horodatage du dernier apprentissage IA (couche auto de la mémoire).
  const autoAt = useMemo(() => {
    if (!k || !k.clients) return null;
    if (client !== "Tous") { const c = k.clients[client]; return c && c.auto && c.auto.at ? c.auto.at : null; }
    let best = null;
    Object.values(k.clients).forEach((c) => { const a = c && c.auto && c.auto.at ? new Date(c.auto.at) : null; if (a && !isNaN(a) && (!best || a > best)) best = a; });
    return best ? best.toISOString() : null;
  }, [k, client]);

  // Aujourd'hui — détail des éléments appris (création du jour) pour le périmètre.
  const apprisAuj = useMemo(() => {
    const t = new Date().toDateString();
    return F.filter((i) => i.cree && new Date(i.cree).toDateString() === t)
      .sort((a, b) => new Date(b.cree) - new Date(a.cree)).slice(0, 12);
  }, [F]);

  // --- Géométrie du graphique ---
  const W = 760, H = 230, padL = 8, padR = 8, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const bk = series.buckets;
  const maxCum = Math.max(1, ...bk.map((b) => b.cumul));
  const maxNeuf = Math.max(1, ...bk.map((b) => b.neuf));
  const n = bk.length;
  const xAt = (i) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yCum = (v) => padT + innerH * (1 - v / maxCum);
  const barH = (v) => (v / maxNeuf) * (innerH * 0.42);

  const linePts = bk.map((b, i) => `${xAt(i).toFixed(1)},${yCum(b.cumul).toFixed(1)}`).join(" ");
  const areaPath = n ? `M ${padL},${padT + innerH} L ${linePts.split(" ").join(" L ")} L ${(padL + innerW)},${padT + innerH} Z` : "";
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  const heure = live.last ? new Date(live.last).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="lh">
      <div className="lh-intro">
        <b>Historique d'apprentissage.</b> La courbe montre ce que cp|WIRE <b>connaît</b> au fil du temps : chaque élément (ticket Jira) appris est compté à sa date de création, et la couche IA s'actualise en tâche de fond. Choisissez un client et une granularité.
      </div>

      {/* Filtres : client */}
      <div className="lh-filters">
        <button type="button" className={`lh-chip ${client === "Tous" ? "on" : ""}`} onClick={() => setClient("Tous")}>Tous <b>{issues.length}</b></button>
        {clients.map((c) => (
          <button type="button" key={c} className={`lh-chip ${client === c ? "on" : ""}`} onClick={() => setClient(c)}>{c}</button>
        ))}
      </div>

      {/* Granularité */}
      <div className="lh-grans" role="tablist" aria-label="Granularité">
        {GRANS.map(([id, lbl]) => (
          <button type="button" key={id} className={`lh-gran ${gran === id ? "on" : ""}`} onClick={() => setGran(id)}>{lbl}</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="lh-kpis">
        <div className="lh-kpi"><b>{series.total}</b><span>éléments connus{client === "Tous" ? "" : ` · ${client}`}</span></div>
        <div className="lh-kpi"><b>{live.neufAuj}</b><span>appris aujourd'hui</span></div>
        <div className="lh-kpi"><b>{live.majAuj}</b><span>mis à jour aujourd'hui</span></div>
        <div className="lh-kpi lh-kpi-dt"><b>{live.last ? `${fmtDT(live.last)}` : "—"}</b><span>dernière mise à jour{heure ? " (donnée)" : ""}</span></div>
      </div>

      {/* Graphique */}
      {bk.length ? (
        <div className="lh-chart">
          <div className="lh-chart-hd">
            <span className="lh-legend"><i className="lh-lg-cum" /> Éléments connus (cumul)</span>
            <span className="lh-legend"><i className="lh-lg-new" /> Nouveaux par {gran === "annee" ? "an" : gran}</span>
            <span className="lh-chart-max">max {maxCum}</span>
          </div>
          <svg className="lh-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Courbe d'apprentissage">
            {/* grille horizontale */}
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={padL} x2={padL + innerW} y1={padT + innerH * g} y2={padT + innerH * g} className="lh-grid" />
            ))}
            {/* barres : nouveaux par période */}
            {bk.map((b, i) => {
              const bw = Math.max(2, (innerW / n) * 0.5);
              const x = xAt(i) - bw / 2;
              const h = barH(b.neuf);
              return <rect key={`b${i}`} x={x} y={padT + innerH - h} width={bw} height={h} className="lh-bar"><title>{`${b.label} — ${b.neuf} nouveau(x)`}</title></rect>;
            })}
            {/* aire + ligne cumul */}
            {areaPath ? <path d={areaPath} className="lh-area" /> : null}
            {n > 1 ? <polyline points={linePts} className="lh-line" /> : null}
            {bk.map((b, i) => (
              <circle key={`p${i}`} cx={xAt(i)} cy={yCum(b.cumul)} r="2.6" className="lh-dot"><title>{`${b.label} — ${b.cumul} connu(s) au total · +${b.neuf}`}</title></circle>
            ))}
            {/* labels x */}
            {bk.map((b, i) => (i % labelEvery === 0 || i === n - 1) ? (
              <text key={`x${i}`} x={xAt(i)} y={H - 8} className="lh-xlab" textAnchor="middle">{b.label}</text>
            ) : null)}
          </svg>
        </div>
      ) : (
        <p className="lh-empty">Aucune donnée datée pour ce périmètre — rien à tracer pour l'instant.</p>
      )}

      {/* Apprentissage IA */}
      <div className="lh-foot">
        <span>🤖 Dernier apprentissage IA{client === "Tous" ? "" : ` · ${client}`} : <b>{autoAt ? fmtDT(autoAt) : "—"}</b></span>
      </div>

      {/* Ce que j'ai appris aujourd'hui */}
      <div className="lh-today">
        <div className="lh-today-hd">Ce que j'ai appris aujourd'hui <b>{live.neufAuj}</b></div>
        {apprisAuj.length ? (
          <ul className="lh-today-list">
            {apprisAuj.map((i) => (
              <li key={i.cle}>
                <span className="lh-today-h">{i.cree ? new Date(i.cree).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                <span className="lh-today-cli">{norm(i.dossier) || "—"}</span>
                <span className="lh-today-cle">{i.cle}</span>
                <span className="lh-today-t">{i.resume}</span>
              </li>
            ))}
          </ul>
        ) : <p className="lh-empty">Rien de nouveau appris aujourd'hui sur ce périmètre.</p>}
      </div>
    </div>
  );
}
