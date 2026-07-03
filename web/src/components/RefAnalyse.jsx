import React, { useMemo, useState } from "react";
import CopilotDot from "./CopilotDot.jsx";
import { buildAnalyseDoc } from "../refDoc.js";
import { printHtml, downloadHtml } from "../utils.js";

// ============================================================================
//  Analyse & apprentissage — COCKPIT analytique du portefeuille.
//  100 % calculé sur les champs Jira RÉELS (categorie, statutDepuis, cree,
//  resolu, dev, dossier, engagement, priorite, enRetard, flagged). Règle sacrée :
//  zéro invention. Si la donnée n'est pas dans le ticket, on ne l'affiche pas.
//  Outils : filtre client + filtre engagement (TMA/Projet) + fenêtre de débit.
// ============================================================================

const OPEN = (c) => c !== "termine" && c !== "miseEnProd" && c !== "annule";
const RECETTE_CLI = new Set(["recetteClient", "attenteClient"]);
const RECETTE_ALL = new Set(["recetteClient", "recetteArmonie", "attenteClient"]);
const RETOUR = new Set(["retourTest", "retourProd"]);

const CAT_LABEL = {
  afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "En attente client",
  miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé",
};
const CAT_ORDER = ["afaire", "encours", "retourTest", "retourProd", "recetteArmonie", "recetteClient", "attenteClient", "miseEnProd", "termine", "annule"];
const CAT_COLOR = {
  afaire: "#8a86a6", encours: "#3a3658", retourTest: "#C0392B", retourProd: "#C0392B",
  recetteArmonie: "#2f5fa8", recetteClient: "var(--gold)", attenteClient: "#b07423",
  miseEnProd: "#1f8a5f", termine: "#1f8a5f", annule: "#b8b5c9",
};

const daysSince = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000); };
const moy = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
const monday = (iso) => { const x = new Date(iso); if (isNaN(x)) return null; const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; };
const prioBucket = (p) => {
  const n = String(p || "").toLowerCase();
  if (/(haut|élev|elev|high|urgent|critiq|bloqu)/.test(n)) return "Haute";
  if (/(moyen|medium|normal)/.test(n)) return "Moyenne";
  if (/(bas|faibl|low|mineur|minor|trivial)/.test(n)) return "Faible";
  return p ? p : "Non définie";
};

// --- Petits graphiques SVG/CSS, à la charte (aucune dépendance) -------------
function BarRows({ rows, fmt, onPick, suffix = "" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="rana-empty">Aucune donnée sur ce périmètre.</p>;
  return (
    <div className="rana-bars">
      {rows.map((r, i) => (
        <div className={`rana-bar ${onPick && r.cle ? "clk" : ""}`} key={r.key || r.label || i}
          onClick={onPick && r.cle ? () => onPick(r.cle) : undefined} title={r.title || r.label}>
          <span className="rana-bar-l">{r.label}</span>
          <span className="rana-bar-track"><i style={{ width: `${Math.max(2, Math.round((r.value / max) * 100))}%`, background: r.color || "var(--indigo)" }} /></span>
          <b className="rana-bar-v">{fmt ? fmt(r.value) : r.value}{suffix}</b>
        </div>
      ))}
    </div>
  );
}

function WeekFlow({ data }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.cree, d.resolu]));
  return (
    <div className="rana-flow">
      <div className="rana-flow-plot">
        {data.map((d, i) => (
          <div className="rana-flow-wk" key={i} title={`Semaine du ${d.label} — ${d.cree} créé(s), ${d.resolu} résolu(s)`}>
            <div className="rana-flow-cols">
              <i className="cree" style={{ height: `${Math.round((d.cree / max) * 100)}%` }} />
              <i className="reso" style={{ height: `${Math.round((d.resolu / max) * 100)}%` }} />
            </div>
            <span className="rana-flow-x">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="rana-flow-leg">
        <span><i className="dot cree" /> créés</span>
        <span><i className="dot reso" /> résolus</span>
      </div>
    </div>
  );
}

function Panel({ title, sub, prompt, children, badge }) {
  return (
    <section className="rana-panel">
      <div className="rana-panel-h">
        <h3>{title}{badge != null ? <span className="rana-badge">{badge}</span> : null}</h3>
        {prompt ? <CopilotDot prompt={prompt} /> : null}
      </div>
      {sub ? <p className="rana-panel-s">{sub}</p> : null}
      {children}
    </section>
  );
}

export default function RefAnalyse({ issues = [], onTicket, onDev }) {
  const [client, setClient] = useState("Tous");
  const [eng, setEng] = useState("Tous");
  const [weeks, setWeeks] = useState(10);
  const [bougeClient, setBougeClient] = useState("Tous");

  const byCle = useMemo(() => { const m = {}; issues.forEach((i) => { m[i.cle] = i; }); return m; }, [issues]);
  const clients = useMemo(() => [...new Set(issues.map((i) => i.dossier).filter((d) => d && d !== "—"))].sort(), [issues]);

  // Périmètre filtré (client + engagement). Le débit utilise en plus la fenêtre.
  const F = useMemo(() => issues.filter((i) =>
    (client === "Tous" || i.dossier === client) &&
    (eng === "Tous" || i.engagement === eng)
  ), [issues, client, eng]);

  const openIssues = useMemo(() => F.filter((i) => OPEN(i.categorie)), [F]);

  // KPI de tête (lecture immédiate de l'état).
  const kpis = useMemo(() => ({
    total: F.length,
    encours: F.filter((i) => i.categorie === "encours").length,
    recette: F.filter((i) => RECETTE_ALL.has(i.categorie)).length,
    reprises: F.filter((i) => RETOUR.has(i.categorie)).length,
    retard: F.filter((i) => i.enRetard).length,
    bloque: F.filter((i) => i.flagged).length,
  }), [F]);

  // 1 — Débit hebdomadaire : créés vs résolus (vraies dates Jira).
  const flow = useMemo(() => {
    const buckets = new Map();
    const start = monday(new Date()); if (start) start.setDate(start.getDate() - (weeks - 1) * 7);
    const keyOf = (iso) => { const m = monday(iso); return m ? m.toISOString().slice(0, 10) : null; };
    const labels = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7);
      const k = d.toISOString().slice(0, 10);
      buckets.set(k, { label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, cree: 0, resolu: 0 });
      labels.push(k);
    }
    const inWin = start ? start.getTime() : -Infinity;
    F.forEach((i) => {
      const kc = keyOf(i.cree); if (kc && buckets.has(kc) && new Date(i.cree).getTime() >= inWin) buckets.get(kc).cree++;
      const kr = keyOf(i.resolu); if (kr && buckets.has(kr) && new Date(i.resolu).getTime() >= inWin) buckets.get(kr).resolu++;
    });
    return labels.map((k) => buckets.get(k));
  }, [F, weeks]);
  const flowTot = useMemo(() => flow.reduce((a, d) => ({ c: a.c + d.cree, r: a.r + d.resolu }), { c: 0, r: 0 }), [flow]);

  // 2 — Répartition par état (funnel) sur le périmètre.
  const repartition = useMemo(() => {
    const m = {}; F.forEach((i) => { m[i.categorie] = (m[i.categorie] || 0) + 1; });
    return CAT_ORDER.filter((c) => m[c]).map((c) => ({ label: CAT_LABEL[c] || c, value: m[c], color: CAT_COLOR[c] }));
  }, [F]);

  // 3 — Ancienneté du backlog OUVERT (depuis le dernier changement de statut).
  const aging = useMemo(() => {
    const b = { "≤ 7 j": 0, "8–30 j": 0, "31–90 j": 0, "> 90 j": 0 };
    openIssues.forEach((i) => {
      const a = daysSince(i.statutDepuis || i.maj); if (a == null) return;
      if (a <= 7) b["≤ 7 j"]++; else if (a <= 30) b["8–30 j"]++; else if (a <= 90) b["31–90 j"]++; else b["> 90 j"]++;
    });
    const col = { "≤ 7 j": "#1f8a5f", "8–30 j": "#2f5fa8", "31–90 j": "#b07423", "> 90 j": "#C0392B" };
    return Object.entries(b).map(([label, value]) => ({ label, value, color: col[label] }));
  }, [openIssues]);

  // 4 — Charge ouverte par client (vue globale) ou par projet (client filtré).
  const charge = useMemo(() => {
    const key = client === "Tous" ? "dossier" : "projet";
    const m = {}; openIssues.forEach((i) => { const k = i[key] || "—"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([label, value]) => ({ label, value, color: "var(--indigo)" })).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [openIssues, client]);

  // 5 — Priorité des tickets ouverts.
  const prio = useMemo(() => {
    const order = ["Haute", "Moyenne", "Faible", "Non définie"];
    const col = { Haute: "#C0392B", Moyenne: "#b07423", Faible: "#2f5fa8", "Non définie": "#8a86a6" };
    const m = {}; openIssues.forEach((i) => { const p = prioBucket(i.priorite); m[p] = (m[p] || 0) + 1; });
    const rows = Object.entries(m).map(([label, value]) => ({ label, value, color: col[label] || "var(--indigo)" }));
    return rows.sort((a, b) => (order.indexOf(a.label) - order.indexOf(b.label)) || (b.value - a.value));
  }, [openIssues]);

  // 6 — Côté client : délais de recette/attente (moyenne + plus ancien cliquable).
  const recetteCli = useMemo(() => {
    const m = {};
    F.forEach((i) => {
      if (!RECETTE_CLI.has(i.categorie)) return;
      const age = daysSince(i.statutDepuis || i.maj);
      const e = (m[i.dossier] ||= { n: 0, ages: [], oldest: null });
      e.n++; if (age != null) { e.ages.push(age); if (!e.oldest || age > e.oldest.age) e.oldest = { cle: i.cle, age, resume: i.resume }; }
    });
    return Object.entries(m).map(([cl, v]) => ({ client: cl, n: v.n, avg: moy(v.ages), max: v.ages.length ? Math.max(...v.ages) : 0, oldest: v.oldest })).sort((a, b) => b.avg - a.avg);
  }, [F]);

  // 6 bis — Recette client : tickets actuellement en recette côté client (liste cliquable).
  const recetteClient = useMemo(() => {
    const m = {}; F.forEach((i) => { if (i.categorie === "recetteClient") (m[i.dossier] ||= []).push(i); });
    return Object.entries(m).map(([cl, list]) => ({ client: cl, n: list.length, list })).sort((a, b) => b.n - a.n);
  }, [F]);

  // 7 — Reprises (recette rejetée).
  const reprises = useMemo(() => {
    const m = {}; F.forEach((i) => { if (RETOUR.has(i.categorie)) (m[i.dossier] ||= []).push(i); });
    return Object.entries(m).map(([cl, list]) => ({ client: cl, n: list.length, list })).sort((a, b) => b.n - a.n);
  }, [F]);

  // 8 — Activité des développeurs (résolus / 30 j + en cours).
  const devs = useMemo(() => {
    const m = {};
    F.forEach((i) => {
      const d = i.dev || (i.assigne !== "Non assigné" ? i.assigne : ""); if (!d) return;
      const e = (m[d] ||= { resolu30: 0, encours: 0 });
      const r = daysSince(i.resolu); if (r != null && r <= 30) e.resolu30++;
      if (i.categorie === "encours") e.encours++;
    });
    return Object.entries(m).map(([dev, v]) => ({ dev, ...v })).filter((d) => d.resolu30 || d.encours).sort((a, b) => b.resolu30 - a.resolu30).slice(0, 12);
  }, [F]);

  // 9 — Mouvements du jour.
  const bouge = useMemo(() => {
    const t = new Date().toDateString();
    return F.filter((i) => i.maj && new Date(i.maj).toDateString() === t).sort((a, b) => new Date(b.maj) - new Date(a.maj));
  }, [F]);

  // Clients ayant bougé aujourd'hui (pour le filtre du panneau) + liste filtrée.
  const bougeClients = useMemo(() => {
    const m = {};
    bouge.forEach((i) => { const c = i.dossier || "—"; m[c] = (m[c] || 0) + 1; });
    return Object.entries(m).map(([client, n]) => ({ client, n })).sort((a, b) => b.n - a.n || a.client.localeCompare(b.client));
  }, [bouge]);
  const bougeF = useMemo(() => (bougeClient === "Tous" ? bouge : bouge.filter((i) => (i.dossier || "—") === bougeClient)), [bouge, bougeClient]);
  const frHeure = (d) => { try { return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  const open = (cle) => { const f = byCle[cle]; if (f && onTicket) onTicket(f); };
  const KPI = ({ v, l, tone }) => <div className={`rana-kpi ${tone || ""}`}><b>{v}</b><span>{l}</span></div>;

  // Export : un seul HTML charté → PDF (impression) ou Web cliquable (téléchargement).
  const makeDoc = () => buildAnalyseDoc({
    client, eng, weeks, kpis, flow, repartition, aging, charge, prio, recetteCli, recetteClient, reprises, devs,
    urlOf: (cle) => (byCle[cle] && byCle[cle].url) || "",
  });
  const exportPdf = () => { const { html, filename } = makeDoc(); printHtml(html, filename); };
  const exportWeb = () => { const { html, filename } = makeDoc(); downloadHtml(html, filename.replace(/\.pdf$/, ".html")); };

  return (
    <div className="rana">
      <div className="rana-top">
        <span className="rana-top-t">Lecture analytique du portefeuille — calculée en direct sur Jira.</span>
        <div className="rana-top-ex">
          <button className="rana-exb" onClick={exportPdf} title="Télécharger en PDF (charte Armonie)">⤓ PDF</button>
          <button className="rana-exb ghost" onClick={exportWeb} title="Télécharger en page web cliquable (charte Armonie)">🌐 Web</button>
        </div>
      </div>
      {/* Barre d'outils : filtres */}
      <div className="rana-tools">
        <label className="rana-tool">
          <span>Client</span>
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="Tous">Tous les clients</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="rana-seg" role="group" aria-label="Engagement">
          {["Tous", "TMA", "Projet"].map((e) => (
            <button key={e} type="button" className={eng === e ? "on" : ""} onClick={() => setEng(e)}>{e}</button>
          ))}
        </div>
        <label className="rana-tool">
          <span>Débit</span>
          <select value={weeks} onChange={(e) => setWeeks(+e.target.value)}>
            <option value={8}>8 semaines</option>
            <option value={10}>10 semaines</option>
            <option value={16}>16 semaines</option>
          </select>
        </label>
        <span className="rana-tool-note">Calcul en direct sur Jira — chaque chiffre remonte au ticket. Aucune invention.</span>
      </div>

      {/* KPI de tête */}
      <div className="rana-kpis">
        <KPI v={kpis.total} l="tickets (périmètre)" />
        <KPI v={kpis.encours} l="en cours" tone="idg" />
        <KPI v={kpis.recette} l="en recette / attente" tone="gold" />
        <KPI v={kpis.reprises} l="reprises" tone={kpis.reprises ? "red" : ""} />
        <KPI v={kpis.retard} l="en retard" tone={kpis.retard ? "red" : ""} />
        <KPI v={kpis.bloque} l="bloqués (drapeau)" tone={kpis.bloque ? "red" : ""} />
      </div>

      <div className="rana-panels">
        {/* Débit — pleine largeur */}
        <Panel
          title="Débit hebdomadaire — créés vs résolus"
          sub={`Flux réel sur ${weeks} semaines : ${flowTot.c} créé(s) · ${flowTot.r} résolu(s). Résolus < créés durablement = backlog qui gonfle.`}
          prompt="Analyse le débit hebdomadaire (tickets créés vs résolus) sur le périmètre : la tendance, l'équilibre entrée/sortie, les semaines de décrochage. Uniquement les données Jira réelles."
        >
          <WeekFlow data={flow} />
        </Panel>

        <Panel title="Répartition par état" sub="Où se trouvent les tickets du périmètre, du « à faire » au « terminé »."
          prompt="Analyse la répartition des tickets par état sur le périmètre : où s'accumule le travail, quels goulets. Uniquement les données Jira réelles.">
          <BarRows rows={repartition} />
        </Panel>

        <Panel title="Ancienneté du backlog ouvert" sub="Depuis combien de temps les tickets ouverts sont figés dans leur état actuel. Le « > 90 j » = souffrance."
          prompt="Analyse l'ancienneté du backlog ouvert (depuis le dernier changement de statut) : combien de tickets souffrent (> 90 jours), quels dossiers. Uniquement les données Jira réelles.">
          <BarRows rows={aging} />
        </Panel>

        <Panel title={client === "Tous" ? "Charge ouverte par client" : "Charge ouverte par projet"} sub="Tickets ouverts (hors terminés / mis en prod / annulés)."
          prompt="Analyse la charge ouverte par client : qui concentre le backlog, déséquilibres éventuels. Uniquement les données Jira réelles.">
          <BarRows rows={charge} />
        </Panel>

        <Panel title="Priorité des tickets ouverts" sub="Répartition par priorité Jira (axe distinct de la gravité SLA)."
          prompt="Analyse la répartition par priorité des tickets ouverts : la part de priorité haute, cohérence avec les retards. Uniquement les données Jira réelles.">
          <BarRows rows={prio} />
        </Panel>

        {/* Côté client */}
        <Panel title="Côté client — délais de recette / attente" sub="Délai moyen pendant lequel les tickets restent en main du client. Élevé = client lent à recetter."
          prompt="Analyse les délais côté client (recette / attente) : quels clients sont les plus lents, depuis combien de temps, quels tickets concentrent l'attente. Uniquement les données Jira réelles.">
          {recetteCli.length ? (
            <>
              <BarRows rows={recetteCli.map((c) => ({ label: c.client, value: c.avg, color: c.avg >= 30 ? "#C0392B" : "var(--indigo)", title: `${c.n} ticket(s) · ${c.avg} j en moyenne · le + ancien ${c.max} j` }))} suffix=" j" />
              <ul className="rana-oldest">
                {recetteCli.filter((c) => c.oldest).slice(0, 6).map((c) => (
                  <li key={c.client}><span className="rana-oldest-c">{c.client}</span>
                    <button className="rana-link" onClick={() => open(c.oldest.cle)} title={c.oldest.resume}>↳ {c.oldest.cle} · {c.oldest.age} j</button></li>
                ))}
              </ul>
            </>
          ) : <p className="rana-empty">Aucun ticket côté client sur ce périmètre.</p>}
        </Panel>

        {/* Recette client */}
        <Panel title="Recette client — en cours de validation" badge={recetteClient.reduce((s, c) => s + c.n, 0)} sub="Tickets actuellement en recette côté client : ce que le client doit valider pour avancer."
          prompt="Analyse les tickets en recette client : quels clients, quels tickets attendent leur validation, et lesquels traînent. Uniquement les données Jira réelles.">
          {recetteClient.length ? (
            <div className="rana-repr">
              {recetteClient.map((c) => (
                <div className="rana-repr-c" key={c.client}>
                  <div className="rana-repr-h"><span>{c.client}</span><b>{c.n}</b></div>
                  <ul className="rana-list">
                    {c.list.slice(0, 5).map((i) => (
                      <li key={i.cle}><button className="rana-link" onClick={() => open(i.cle)} title={i.resume}>{i.cle}</button> <span className="rana-li-t">{i.resume}</span></li>
                    ))}
                    {c.list.length > 5 ? <li className="rana-more">+ {c.list.length - 5} autre(s)</li> : null}
                  </ul>
                </div>
              ))}
            </div>
          ) : <p className="rana-empty">Aucun ticket en recette client sur ce périmètre.</p>}
        </Panel>

        {/* Reprises */}
        <Panel title="Reprises — recette rejetée" badge={reprises.reduce((s, c) => s + c.n, 0)} sub="Tickets renvoyés en correction après test : signal de qualité / d'allers-retours."
          prompt="Analyse les reprises (retour test/prod) : quels clients et tickets, ce que ça dit de la qualité des livraisons. Uniquement les données Jira réelles.">
          {reprises.length ? (
            <div className="rana-repr">
              {reprises.map((c) => (
                <div className="rana-repr-c" key={c.client}>
                  <div className="rana-repr-h"><span>{c.client}</span><b className="hot">{c.n}</b></div>
                  <ul className="rana-list">
                    {c.list.slice(0, 5).map((i) => (
                      <li key={i.cle}><button className="rana-link" onClick={() => open(i.cle)} title={i.resume}>{i.cle}</button> <span className="rana-li-t">{i.resume}</span></li>
                    ))}
                    {c.list.length > 5 ? <li className="rana-more">+ {c.list.length - 5} autre(s)</li> : null}
                  </ul>
                </div>
              ))}
            </div>
          ) : <p className="rana-empty">Aucune reprise — rien en retour test/prod.</p>}
        </Panel>

        {/* Activité dev */}
        <Panel title="Activité des développeurs" sub="Tickets résolus sur 30 jours glissants. Cliquez une barre pour la fiche du développeur."
          prompt="Analyse l'activité des développeurs : qui résout le plus sur 30 jours, qui porte le plus de charge, déséquilibres. Uniquement les données Jira réelles.">
          {devs.length ? (
            <div className="rana-bars">
              {devs.map((d) => {
                const max = Math.max(1, ...devs.map((x) => x.resolu30));
                return (
                  <div className="rana-bar clk" key={d.dev} onClick={() => onDev && onDev(d.dev)} title={`${d.resolu30} résolu(s) / 30 j · ${d.encours} en cours`}>
                    <span className="rana-bar-l">{d.dev}</span>
                    <span className="rana-bar-track"><i style={{ width: `${Math.max(2, Math.round((d.resolu30 / max) * 100))}%`, background: "var(--indigo)" }} /></span>
                    <b className="rana-bar-v">{d.resolu30}<span className="rana-bar-x"> · {d.encours} en cours</span></b>
                  </div>
                );
              })}
            </div>
          ) : <p className="rana-empty">Pas d'activité dev exploitable sur ce périmètre.</p>}
        </Panel>

        {/* Mouvements du jour — pleine largeur */}
        <Panel title="Ce qui a bougé aujourd'hui" badge={bouge.length} sub="Tickets mis à jour dans Jira aujourd'hui sur le périmètre. Filtrez par client ci-dessous."
          prompt="Synthèse de ce qui a bougé aujourd'hui dans Jira sur le périmètre : mouvements notables, ce qui mérite attention. Uniquement les données réelles.">
          {bouge.length ? (
            <>
              <div className="rana-today-filters">
                <button type="button" className={`rana-chip ${bougeClient === "Tous" ? "on" : ""}`} onClick={() => setBougeClient("Tous")}>Tous <b>{bouge.length}</b></button>
                {bougeClients.map((c) => (
                  <button type="button" key={c.client} className={`rana-chip ${bougeClient === c.client ? "on" : ""}`} onClick={() => setBougeClient(c.client)}>{c.client} <b>{c.n}</b></button>
                ))}
              </div>
              <ul className="rana-today">
                {bougeF.slice(0, 40).map((i) => (
                  <li key={i.cle}>
                    <span className="rana-today-h">{frHeure(i.maj)}</span>
                    <span className="rana-today-cli" title={i.dossier}>{i.dossier || "—"}</span>
                    <button className="rana-link" onClick={() => open(i.cle)} title={i.resume}>{i.cle}</button>
                    <span className="rana-li-t">{i.resume}</span>
                    {(i.dev || i.statutJira) ? <span className="rana-li-meta">{[i.dev, i.statutJira].filter(Boolean).join(" · ")}</span> : null}
                  </li>
                ))}
                {bougeF.length > 40 ? <li className="rana-more">+ {bougeF.length - 40} autre(s)</li> : null}
              </ul>
            </>
          ) : <p className="rana-empty">Rien n'a bougé dans Jira aujourd'hui pour ce périmètre.</p>}
        </Panel>
      </div>
    </div>
  );
}
