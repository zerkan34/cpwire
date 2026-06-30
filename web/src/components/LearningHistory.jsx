import { useMemo, useState } from "react";
import { buildSimpleDoc, printHtml, saveBlobAs } from "../utils.js";

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
  const [sortKey, setSortKey] = useState("cree");
  const [sortDir, setSortDir] = useState("desc");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(120);
  const [statut, setStatut] = useState("Tous");

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

  // Détail trié + recherché de tout ce qui a été appris (périmètre courant).
  // Statuts présents (filtres rapides) + détail trié/recherché/filtré.
  const statuts = useMemo(() => {
    const m = {};
    F.forEach((i) => { const s = i.statutJira || "—"; m[s] = (m[s] || 0) + 1; });
    return Object.entries(m).map(([s, n]) => ({ statut: s, n })).sort((a, b) => b.n - a.n);
  }, [F]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = F.filter((i) =>
      (statut === "Tous" || (i.statutJira || "—") === statut) &&
      (!q || [i.cle, i.resume, i.dossier, i.dev, i.statutJira].some((v) => String(v || "").toLowerCase().includes(q)))
    );
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (i) => {
      if (sortKey === "cree" || sortKey === "maj") return i[sortKey] ? new Date(i[sortKey]).getTime() : 0;
      return String(i[sortKey] || "").toLowerCase();
    };
    return [...base].sort((a, b) => { const va = val(a), vb = val(b); if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0; });
  }, [F, sortKey, sortDir, query, statut]);

  const sortBy = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "cree" || key === "maj" ? "desc" : "asc"); }
  };
  const arrow = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const fmtD = (d) => { try { const x = new Date(d); return `${PAD(x.getDate())}/${PAD(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)} ${PAD(x.getHours())}:${PAD(x.getMinutes())}`; } catch { return "—"; } };
  const COLS = [["cree", "Appris le"], ["dossier", "Client"], ["cle", "Ticket"], ["resume", "Libellé"], ["dev", "Développeur"], ["statutJira", "Statut"], ["maj", "MAJ"]];

  const escH = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const portee = () => (client === "Tous" ? "Tous clients" : client) + (statut !== "Tous" ? ` · statut : ${statut}` : "") + (query ? ` · recherche : « ${query} »` : "");
  const exportCsv = async () => {
    const head = ["Appris le", "Client", "Ticket", "Libellé", "Développeur", "Statut", "Dernière MAJ"];
    const lines = [head, ...sorted.map((i) => [i.cree ? fmtD(i.cree) : "", i.dossier || "", i.cle || "", i.resume || "", i.dev || "", i.statutJira || "", i.maj ? fmtD(i.maj) : ""])];
    const csv = "\uFEFF" + lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    await saveBlobAs(blob, `Apprentissage${client !== "Tous" ? "_" + client : ""}.csv`, { description: "Fichier CSV (Excel)", mime: "text/csv", ext: ".csv" });
  };
  const exportPdf = async () => {
    const cap = 800;
    const rows = sorted.slice(0, cap);
    const body =
      `<p class="lede">Détail des éléments connus — ${portee()} · <b>${sorted.length}</b> élément(s).</p>`
      + `<table><thead><tr><th>Appris le</th><th>Client</th><th>Ticket</th><th>Libellé</th><th>Développeur</th><th>Statut</th><th>MAJ</th></tr></thead><tbody>`
      + rows.map((i) => `<tr><td>${i.cree ? fmtD(i.cree) : "—"}</td><td>${escH(i.dossier || "—")}</td><td>${escH(i.cle)}</td><td>${escH(i.resume || "")}</td><td>${escH(i.dev || "—")}</td><td>${escH(i.statutJira || "—")}</td><td>${i.maj ? fmtD(i.maj) : "—"}</td></tr>`).join("")
      + `</tbody></table>`
      + (sorted.length > cap ? `<p class="hint">Affiché : les ${cap} premiers (selon le tri courant). Liste complète via l'export Excel.</p>` : "");
    const html = buildSimpleDoc({
      kicker: "Mémoire", title: "Historique d'apprentissage",
      subtitle: `Détail des éléments connus${client !== "Tous" ? " — " + client : ""}`,
      cartouche: [["Périmètre", client === "Tous" ? "Tous clients" : client], ["Statut", statut === "Tous" ? "Tous" : statut], ["Éléments", String(sorted.length)]],
      bodyHtml: body,
    });
    await printHtml(html, "Historique_apprentissage");
  };

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

      {/* Détail de tout ce qui a été appris — triable + recherche */}
      <div className="lh-detail">
        <div className="lh-detail-hd">
          <div className="lh-detail-t">Détail — ce qui a été appris <b>{sorted.length}</b></div>
          <div className="lh-detail-tools">
            <div className="lh-search">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(120); }} placeholder="Rechercher (ticket, libellé, dev, statut)…" aria-label="Rechercher" />
              {query ? <button type="button" className="lh-search-x" onClick={() => setQuery("")} title="Effacer">×</button> : null}
            </div>
            <div className="lh-detail-actions">
              <button type="button" className="lh-exp" onClick={exportCsv} title="Exporter la vue en CSV (Excel)">⬇ Excel</button>
              <button type="button" className="lh-exp lh-exp-pdf" onClick={exportPdf} title="Exporter la vue en PDF (charte Armonie)">📄 PDF</button>
            </div>
          </div>
        </div>
        <div className="lh-stfilters">
          <button type="button" className={`lh-chip ${statut === "Tous" ? "on" : ""}`} onClick={() => { setStatut("Tous"); setLimit(120); }}>Tous statuts <b>{F.length}</b></button>
          {statuts.map((s) => (
            <button type="button" key={s.statut} className={`lh-chip ${statut === s.statut ? "on" : ""}`} onClick={() => { setStatut(s.statut); setLimit(120); }}>{s.statut} <b>{s.n}</b></button>
          ))}
        </div>
        {sorted.length ? (
          <>
            <div className="lh-tbl-wrap">
              <div className="lh-tbl" role="table">
                <div className="lh-tbl-hd" role="row">
                  {COLS.map(([key, lbl]) => (
                    <button type="button" key={key} className={`lh-th ${sortKey === key ? "on" : ""}`} onClick={() => sortBy(key)} role="columnheader">{lbl}{arrow(key)}</button>
                  ))}
                </div>
                {sorted.slice(0, limit).map((i) => (
                  <div className="lh-tr" role="row" key={i.cle}>
                    <span className="lh-td lh-td-d">{i.cree ? fmtD(i.cree) : "—"}</span>
                    <span className="lh-td"><span className="lh-cli">{norm(i.dossier) || "—"}</span></span>
                    <span className="lh-td lh-td-cle">{i.cle}</span>
                    <span className="lh-td lh-td-t" title={i.resume}>{i.resume}</span>
                    <span className="lh-td lh-td-dev">{i.dev || "—"}</span>
                    <span className="lh-td lh-td-st">{i.statutJira || "—"}</span>
                    <span className="lh-td lh-td-maj">{i.maj ? fmtD(i.maj) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
            {sorted.length > limit ? (
              <button type="button" className="lh-more-btn" onClick={() => setLimit((l) => l + 200)}>Afficher plus ({sorted.length - limit} restant{sorted.length - limit > 1 ? "s" : ""})</button>
            ) : <p className="lh-detail-foot">{sorted.length} élément(s) affiché(s).</p>}
          </>
        ) : <p className="lh-empty">Aucun élément ne correspond.</p>}
      </div>
    </div>
  );
}
