import React, { useMemo } from "react";
import CopilotDot from "./CopilotDot.jsx";

// Analyse & apprentissage — 100 % calculé sur les champs Jira réels (categorie,
// statutDepuis, resolu, dev, dossier). Aucun chiffre inventé : si la donnée n'est
// pas dans le ticket, on ne l'affiche pas.

const RECETTE_CLI = new Set(["recetteClient", "attenteClient"]);
const RETOUR = new Set(["retourTest", "retourProd"]);
const daysSince = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000); };
const moy = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

export default function RefAnalyse({ issues = [], onTicket, onDev }) {
  const byCle = useMemo(() => { const m = {}; issues.forEach((i) => { m[i.cle] = i; }); return m; }, [issues]);

  // 1 — Côté client : combien de tickets attendent côté client, et depuis combien de temps.
  const recetteCli = useMemo(() => {
    const m = {};
    issues.forEach((i) => {
      if (!RECETTE_CLI.has(i.categorie)) return;
      const age = daysSince(i.statutDepuis || i.maj);
      const e = (m[i.dossier] ||= { n: 0, ages: [], oldest: null });
      e.n++;
      if (age != null) { e.ages.push(age); if (!e.oldest || age > e.oldest.age) e.oldest = { cle: i.cle, age, resume: i.resume }; }
    });
    return Object.entries(m)
      .map(([client, v]) => ({ client, n: v.n, avg: moy(v.ages), max: v.ages.length ? Math.max(...v.ages) : 0, oldest: v.oldest }))
      .sort((a, b) => b.avg - a.avg);
  }, [issues]);

  // 2 — Reprises : tickets repassés en retour test/prod (recette rejetée) = signal de qualité.
  const reprises = useMemo(() => {
    const m = {};
    issues.forEach((i) => { if (RETOUR.has(i.categorie)) (m[i.dossier] ||= []).push(i); });
    return Object.entries(m).map(([client, list]) => ({ client, n: list.length, list })).sort((a, b) => b.n - a.n);
  }, [issues]);

  // 3 — Efficacité dev : résolus sur 30 jours glissants + charge en cours.
  const devs = useMemo(() => {
    const m = {};
    issues.forEach((i) => {
      const d = i.dev || (i.assigne !== "Non assigné" ? i.assigne : "");
      if (!d) return;
      const e = (m[d] ||= { resolu30: 0, resolu90: 0, encours: 0 });
      const r = daysSince(i.resolu);
      if (r != null && r <= 30) e.resolu30++;
      if (r != null && r <= 90) e.resolu90++;
      if (i.categorie === "encours") e.encours++;
    });
    return Object.entries(m).map(([dev, v]) => ({ dev, ...v })).filter((d) => d.resolu90 || d.encours).sort((a, b) => b.resolu30 - a.resolu30).slice(0, 14);
  }, [issues]);

  // 4 — Ce qui a bougé aujourd'hui (mise à jour Jira datée d'aujourd'hui).
  const bouge = useMemo(() => {
    const t = new Date().toDateString();
    return issues.filter((i) => i.maj && new Date(i.maj).toDateString() === t).sort((a, b) => new Date(b.maj) - new Date(a.maj));
  }, [issues]);

  const open = (cle) => { const f = byCle[cle]; if (f && onTicket) onTicket(f); };

  return (
    <div className="rana">
      <p className="hint" style={{ marginTop: -2 }}>
        Lecture analytique du portefeuille, calculée en direct sur les données Jira. Chaque chiffre est cliquable pour remonter au ticket.
      </p>

      {/* 1 — Côté client */}
      <section className="rana-sec">
        <h3 className="rana-h">Côté client — délais de recette / attente<span style={{marginLeft:"auto"}}><CopilotDot prompt="Analyse les délais côté client (recette / attente) sur le portefeuille : quels clients sont les plus lents à recetter, depuis combien de temps, et quels tickets concentrent l'attente ? Uniquement les données Jira réelles." /></span></h3>
        <p className="rana-sub">Combien de tickets sont en main du client, et depuis combien de jours. Un délai moyen élevé = client lent à recetter / valider.</p>
        <div className="rana-grid">
          {recetteCli.length ? recetteCli.map((c) => (
            <div className="rana-card" key={c.client}>
              <div className="rana-card-h"><span className="rana-cli">{c.client}</span><span className="rana-n">{c.n} ticket{c.n > 1 ? "s" : ""}</span></div>
              <div className="rana-metrics">
                <div className="rana-m"><b className={c.avg >= 30 ? "hot" : ""}>{c.avg}</b><span>j en moyenne</span></div>
                <div className="rana-m"><b className={c.max >= 60 ? "hot" : ""}>{c.max}</b><span>j le + ancien</span></div>
              </div>
              {c.oldest ? <button className="rana-link" onClick={() => open(c.oldest.cle)} title={c.oldest.resume}>↳ {c.oldest.cle} · {c.oldest.age} j</button> : null}
            </div>
          )) : <p className="rana-empty">Aucun ticket côté client actuellement.</p>}
        </div>
      </section>

      {/* 2 — Reprises */}
      <section className="rana-sec">
        <h3 className="rana-h">Reprises — recette rejetée (retour test/prod)<span style={{marginLeft:"auto"}}><CopilotDot prompt="Analyse les reprises (tickets repassés en retour test/prod) sur le portefeuille : quels clients et quels tickets, et qu'est-ce que ça dit de la qualité des livraisons ? Uniquement les données Jira réelles." /></span></h3>
        <p className="rana-sub">Tickets renvoyés en correction après test : signal de qualité / d'allers-retours.</p>
        <div className="rana-grid">
          {reprises.length ? reprises.map((c) => (
            <div className="rana-card" key={c.client}>
              <div className="rana-card-h"><span className="rana-cli">{c.client}</span><span className="rana-n hot">{c.n} reprise{c.n > 1 ? "s" : ""}</span></div>
              <ul className="rana-list">
                {c.list.slice(0, 5).map((i) => (
                  <li key={i.cle}><button className="rana-link" onClick={() => open(i.cle)} title={i.resume}>{i.cle}</button> <span className="rana-li-t">{i.resume}</span></li>
                ))}
                {c.list.length > 5 ? <li className="rana-more">+ {c.list.length - 5} autre(s)</li> : null}
              </ul>
            </div>
          )) : <p className="rana-empty">Aucune reprise en cours — rien en retour test/prod.</p>}
        </div>
      </section>

      {/* 3 — Efficacité dev */}
      <section className="rana-sec">
        <h3 className="rana-h">Activité des développeurs<span style={{marginLeft:"auto"}}><CopilotDot prompt="Analyse l'activité des développeurs : qui résout le plus sur 30 jours, qui porte le plus de charge en cours, y a-t-il des déséquilibres ? Uniquement les données Jira réelles." /></span></h3>
        <p className="rana-sub">Tickets résolus sur 30 jours glissants et charge en cours. Cliquez un nom pour sa fiche.</p>
        <div className="rana-devs">
          {devs.length ? devs.map((d) => (
            <button className="rana-dev" key={d.dev} onClick={() => onDev && onDev(d.dev)} title="Voir la fiche du développeur">
              <span className="rana-dev-n">{d.dev}</span>
              <span className="rana-dev-m"><b>{d.resolu30}</b> résolus / 30 j · <b>{d.encours}</b> en cours</span>
            </button>
          )) : <p className="rana-empty">Pas d'activité dev exploitable.</p>}
        </div>
      </section>

      {/* 4 — Ce qui a bougé aujourd'hui */}
      <section className="rana-sec">
        <h3 className="rana-h">Ce qui a bougé aujourd'hui <span className="rana-badge">{bouge.length}</span><span style={{marginLeft:"auto"}}><CopilotDot prompt="Fais-moi la synthèse de ce qui a bougé aujourd'hui dans Jira sur le portefeuille : les mouvements notables, ce qui mérite mon attention. Uniquement les données réelles." /></span></h3>
        <p className="rana-sub">Tickets mis à jour dans Jira aujourd'hui. Le contexte appris par l'IA sur la durée est dans l'onglet « Mémoire ».</p>
        {bouge.length ? (
          <ul className="rana-today">
            {bouge.slice(0, 30).map((i) => (
              <li key={i.cle}>
                <button className="rana-link" onClick={() => open(i.cle)} title={i.resume}>{i.cle}</button>
                <span className="rana-li-t">{i.resume}</span>
                <span className="rana-li-meta">{i.dossier}{i.dev ? ` · ${i.dev}` : ""}{i.statutJira ? ` · ${i.statutJira}` : ""}</span>
              </li>
            ))}
            {bouge.length > 30 ? <li className="rana-more">+ {bouge.length - 30} autre(s) aujourd'hui</li> : null}
          </ul>
        ) : <p className="rana-empty">Rien n'a bougé dans Jira aujourd'hui pour l'instant.</p>}
      </section>
    </div>
  );
}
