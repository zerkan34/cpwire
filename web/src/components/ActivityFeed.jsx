import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { frDateCourte, cle, libelle } from "../lib/commun.js";
import { fetchActivite } from "../api.js";

// Flux d'activité — ce qui bouge, avec de la donnée RÉELLE, zéro invention.
//  • Aujourd'hui, à l'heure : transitions de statut du changelog Jira (from → to, qui, heure) + apparitions.
//  • Jours précédents, au jour : mouvements dérivés des relevés quotidiens (pointHistory), 0 appel Jira.
//  • Régressions (retours en arrière) mises en évidence, « depuis ta dernière visite », pouls par client,
//    et classement des basculeurs du jour.

const SEEN_KEY = "cpwire:activite:seen";
const PAD = (n) => String(n).padStart(2, "0");
const hhmm = (iso) => { try { const d = new Date(iso); return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`; } catch { return "—"; } };
const nowHM = () => { const d = new Date(); return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`; };
const dayFR = (ymd) => { try { const d = new Date(ymd + "T00:00:00"); return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }); } catch { return ymd; } };

// Couleur grossière d'un statut/catégorie, pour la pastille (réutilise l'esprit des pills de l'app).
function coarse(s) {
  const x = String(s || "").toLowerCase();
  if (!x) return "none";
  if (/(termin|clos|clot|clôt|done|prod|résolu|resolu|ferm)/.test(x)) return "done";
  if (/(bloq|block|attente|hold|susp|stand)/.test(x)) return "block";
  if (/(cours|progress|dev|recett|test|review|reprise|vérif|verif)/.test(x)) return "prog";
  if (/(faire|to ?do|ouvert|open|nouveau|backlog|traiter|qualifier)/.test(x)) return "todo";
  return "none";
}

// Durée de traitement (création → résolution), formatée court. null si incohérent.
function durTxt(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const j = Math.round(h / 24);
  if (j < 30) return `${j} j`;
  const mo = Math.round(j / 30);
  if (mo < 12) return `${mo} mois`;
  return `${(j / 365).toFixed(1)} an(s)`;
}

// Mini-courbe (sparkline) SVG pour le pouls d'un client.
function Sparkline({ data = [], w = 108, h = 24 }) {
  if (!data.length) return <span className="af-spark-empty">—</span>;
  const max = Math.max(1, ...data.map((d) => d.n));
  const n = data.length;
  const x = (i) => (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => h - 3 - (v / max) * (h - 6);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.n).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  return (
    <svg className="af-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Pouls : ${data.reduce((s, d) => s + d.n, 0)} mouvements`}>
      <polyline points={pts} className="af-spark-line" />
      <circle cx={x(n - 1)} cy={y(last.n)} r="2.2" className="af-spark-dot" />
    </svg>
  );
}

// Explication en langage simple de ce que fait la personne sur le ticket (2 lignes max),
// dérivée du statut réel — « comme si on ne connaissait rien ».
function plainWhat(iss) {
  const c = iss && iss.categorie;
  if (c === "encours") return "Cette personne développe le ticket en ce moment : elle écrit ou corrige du code pour le faire fonctionner.";
  if (c === "retourTest") return "Le ticket vient d'être renvoyé en test : une correction a été faite, on revérifie qu'elle marche.";
  if (c === "recetteClient") return "Le ticket est en validation côté client : on attend son feu vert pour le clôturer.";
  if (c === "recetteArmonie") return "Le ticket est en vérification interne (recette) avant d'être proposé au client.";
  if (c === "afaire") return "Le ticket est prévu mais pas encore commencé : il attend son tour dans la file.";
  if (c === "termine" || c === "miseEnProd") return "Le ticket est terminé, il n'y a plus rien à faire dessus.";
  return "Travail en cours sur ce ticket.";
}
// Estimation INDICATIVE de la charge restante — faute de points de complexité dans Jira,
// on se base sur la priorité (transparent, clairement libellé « indicatif »).
const PRIO_EFFORT = {
  critique: "≈ 3 à 5 jours", bloquant: "≈ 3 à 5 jours", highest: "≈ 3 à 5 jours",
  haute: "≈ 2 à 4 jours", majeure: "≈ 2 à 4 jours", high: "≈ 2 à 4 jours",
  moyenne: "≈ 1 à 2 jours", medium: "≈ 1 à 2 jours", normale: "≈ 1 à 2 jours",
  basse: "≈ moins d'1 jour", mineure: "≈ moins d'1 jour", low: "≈ moins d'1 jour", lowest: "≈ moins d'1 jour",
};
const effortOf = (iss) => {
  const p = (iss && iss.priorite ? String(iss.priorite) : "").toLowerCase().trim();
  return PRIO_EFFORT[p] || "à estimer (priorité non renseignée)";
};

export default function ActivityFeed({ issues = [], onTicket, onClient, changedKeys }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [client, setClient] = useState("Tous");
  const [type, setType] = useState("Tous"); // Tous | transition | creation | regression
  // Deux critères qui manquaient : QUI a fait bouger le ticket, et SUR QUELLE PÉRIODE.
  // Sans eux, retrouver « ce qu'Adrien a bougé cette semaine » obligeait à parcourir
  // le flux à l'œil, alors que l'information est déjà dans les données.
  const [qui, setQui] = useState("Tous");
  const [periode, setPeriode] = useState("tout"); // tout | jour | semaine
  const [auto, setAuto] = useState(true);
  const [lastAt, setLastAt] = useState("");
  const [openRank, setOpenRank] = useState(false);
  const [openPulse, setOpenPulse] = useState(true);
  const [openRows, setOpenRows] = useState(() => new Set());
  const toggleRow = (id) => setOpenRows((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const timer = useRef(null);
  const lastSeenRef = useRef(Number(localStorage.getItem(SEEN_KEY)) || 0);

  const byKey = useMemo(() => { const m = {}; for (const i of issues) m[i.cle] = i; return m; }, [issues]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await fetchActivite();
      setPayload(r);
      setLastAt(nowHM());
    } catch (e) {
      setErr(e && e.message ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { if (timer.current) { clearInterval(timer.current); timer.current = null; } return; }
    timer.current = setInterval(load, 60000);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [auto, load]);
  // On mémorise l'heure de cette visite en sortant, pour que la prochaine « depuis ta dernière visite » soit juste.
  useEffect(() => () => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* ignore */ } }, []);

  const events = payload?.events || [];
  const history = payload?.history || [];
  const pulse = payload?.pulse || {};

  // On rapproche sur la CLÉ (accents et casse ignorés) mais on affiche le LIBELLÉ
  // d'origine. Avant, la clé servait aussi d'étiquette : les pastilles annonçaient
  // « edl » et « ds smith » au lieu de « EDL » et « DS Smith ».
  const clients = useMemo(() => {
    const par = new Map();   // clé -> premier libellé rencontré
    const noter = (d) => { const k = cle(d); if (k && k !== "—" && !par.has(k)) par.set(k, libelle(d)); };
    events.forEach((e) => noter(e.dossier));
    history.forEach((d) => (d.movements || []).forEach((m) => noter(m.dossier)));
    Object.keys(pulse).forEach(noter);
    return [...par.entries()]
      .map(([k, lab]) => ({ cle: k, label: lab }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [events, history, pulse]);

  const inClient = (d) => client === "Tous" || cle(d) === client;
  const inQui = (w) => qui === "Tous" || (w || "") === qui;

  // Personnes présentes dans le flux : aucune liste écrite en dur.
  const personnes = useMemo(() => {
    const set = new Set();
    (payload?.events || []).forEach((e) => { if (e.who) set.add(e.who); });
    (history || []).forEach((d) => (d.movements || []).forEach((m) => { if (m.who) set.add(m.who); }));
    return [...set].sort();
  }, [payload, history]);

  // Fenêtre de temps : « aujourd'hui » masque la traîne des jours précédents,
  // « 7 jours » la limite à une semaine. Le jour courant est toujours conservé.
  const limiteJour = useMemo(() => {
    if (periode === "tout") return null;
    const n = periode === "jour" ? 0 : 6;
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }, [periode]);

  const shownToday = useMemo(() => events.filter((e) =>
    inClient(e.dossier) &&
    inQui(e.who) &&
    (type === "Tous" ? true : type === "regression" ? e.regression : e.kind === type)
  ), [events, client, type, qui]);

  const nMov = events.filter((e) => e.kind === "transition").length;
  const nNew = events.filter((e) => e.kind === "creation").length;
  const nReg = events.filter((e) => e.regression).length;
  const dateFR = payload?.dateISO
    ? new Date(payload.dateISO).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })
    : "";

  // Depuis ta dernière visite : mouvements/apparitions plus récents que la dernière ouverture.
  const seen = lastSeenRef.current;
  const isNew = (at) => seen > 0 && at && new Date(at).getTime() > seen;
  const sinceCount = useMemo(() => events.filter((e) => isNew(e.at)).length, [events]);

  // Classement des basculeurs du jour (qui a fait avancer combien de tickets), périmètre client courant.
  const rank = useMemo(() => {
    const m = {};
    events.forEach((e) => { if (e.kind === "transition" && inClient(e.dossier) && e.who) m[e.who] = (m[e.who] || 0) + 1; });
    return Object.entries(m).map(([who, n]) => ({ who, n })).sort((a, b) => b.n - a.n).slice(0, 10);
  }, [events, client]);

  // Pouls par client (sparkline sur la fenêtre). Filtré si un client est sélectionné.
  const pulseRows = useMemo(() => {
    return Object.entries(pulse)
      .filter(([d]) => inClient(d))
      .map(([d, series]) => ({ dossier: d, series, total: series.reduce((s, x) => s + x.n, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [pulse, client]);

  // Traîne : jours précédents filtrés (client + type). Créations n'existent pas dans la traîne.
  const shownHistory = useMemo(() => {
    if (type === "creation") return [];
    return history
      .filter((d) => !limiteJour || String(d.day) >= limiteJour)
      .map((d) => ({
        ...d,
        movements: (d.movements || []).filter((m) =>
          inClient(m.dossier) && inQui(m.who) && (type !== "regression" || m.regression)),
      }))
      .filter((d) => d.movements.length);
  }, [history, client, type, qui, limiteJour]);

  const openTicket = (cle) => { if (onTicket) onTicket(byKey[cle] || { cle }); };

  const Cli = ({ d }) => (onClient
    ? <button type="button" className="af-cli af-cli-btn" onClick={() => onClient(d)} title="Ouvrir la fiche client">{cle(d) || "—"}</button>
    : <span className="af-cli">{cle(d) || "—"}</span>);

  // Pulse « nouveau mouvement » : uniquement les tickets qui viennent de bouger (diff serveur changedKeys).
  const isFresh = (cle) => changedKeys && changedKeys.has && changedKeys.has(cle);
  const freshCls = (cle, regression) => isFresh(cle) ? (regression ? " is-fresh is-fresh-down" : " is-fresh is-fresh-up") : "";

  const StatusChips = ({ from, to, fromLabel, toLabel, statut, kind, regression }) => {
    if (kind === "creation") return (
      <span className="af-move"><span className="af-new">Nouveau</span>{statut ? <span className={`af-st af-st-${coarse(statut)}`}>{statut}</span> : null}</span>
    );
    const f = fromLabel || from, t = toLabel || to;
    return (
      <span className="af-move">
        <span className={`af-st af-st-${coarse(f)}`}>{f || "∅"}</span>
        <span className="af-arr">→</span>
        <span className={`af-st af-st-${coarse(t)}`}>{t || "∅"}</span>
        {regression ? <span className="af-reg-badge" title="Retour en arrière">↩ régression</span> : null}
      </span>
    );
  };

  return (
    <div className="af">
      <div className="af-intro">
        <b>Flux d'activité.</b> Aujourd'hui <b>à l'heure</b> (transitions du changelog Jira + apparitions), puis les jours précédents <b>au jour</b> (dérivés des relevés quotidiens). Retours en arrière signalés. Source réelle uniquement — si rien ne bouge, le flux reste vide.
      </div>
      <p className="af-do">→ <b>Quoi en faire :</b> commence par les <b>régressions</b> — un ticket qui recule (ex. Recette → En cours) signale un aller-retour à comprendre. Tout est cliquable : ticket, client, sparkline.</p>

      <div className="af-bar">
        <div className="af-live">
          <span className={`af-dot ${loading ? "load" : "on"}`} />
          <span className="af-live-t">En direct</span>
          <span className="af-live-when">{lastAt ? `dernier relevé à ${lastAt}` : "…"}</span>
        </div>
        <div className="af-bar-r">
          <label className="af-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto (1 min)</label>
          <button type="button" className="af-refresh" onClick={load} disabled={loading} title="Actualiser maintenant">↻ Actualiser</button>
        </div>
      </div>

      {sinceCount > 0 ? (
        <div className="af-since">
          <span className="af-since-dot" /> <b>{sinceCount}</b> mouvement{sinceCount > 1 ? "s" : ""} depuis ta dernière visite{seen ? ` (${hhmm(new Date(seen).toISOString())})` : ""}.
        </div>
      ) : null}

      <div className="af-kpis">
        <div className="af-kpi"><b>{nMov}</b><span>mouvements (jour)</span></div>
        <div className="af-kpi"><b>{nNew}</b><span>apparitions</span></div>
        <div className={`af-kpi ${nReg ? "af-kpi-reg" : ""}`}><b>{nReg}</b><span>régressions</span></div>
        <div className="af-kpi af-kpi-d"><b>{dateFR || "—"}</b><span>journée</span></div>
      </div>

      {payload?.capped ? (
        <p className="af-cap">Aujourd'hui plafonné aux <b>{payload.scanned}</b> tickets les plus récemment bougés (sur {payload.total}), pour garder le flux rapide. La traîne des jours précédents n'est pas concernée.</p>
      ) : null}

      {/* Pouls par client */}
      {pulseRows.length ? (
        <div className="af-panel">
          <button type="button" className="af-panel-hd" onClick={() => setOpenPulse((v) => !v)}>
            <span>Pouls des clients <small>· mouvements/jour sur la fenêtre</small></span>
            <span className="af-panel-x">{openPulse ? "▾" : "▸"}</span>
          </button>
          {openPulse ? (
            <div className="af-pulse">
              {pulseRows.map((r) => (
                <button type="button" key={r.dossier} className={`af-pulse-row ${client === r.dossier ? "on" : ""}`} onClick={() => setClient(client === r.dossier ? "Tous" : r.dossier)} title="Filtrer sur ce client">
                  <span className="af-pulse-name">{r.dossier}</span>
                  <Sparkline data={r.series} />
                  <span className="af-pulse-tot">{r.total}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Classement des basculeurs du jour */}
      {rank.length ? (
        <div className="af-panel">
          <button type="button" className="af-panel-hd" onClick={() => setOpenRank((v) => !v)}>
            <span>Qui fait avancer quoi <small>· aujourd'hui{client !== "Tous" ? ` · ${client}` : ""}</small></span>
            <span className="af-panel-x">{openRank ? "▾" : "▸"}</span>
          </button>
          {openRank ? (
            <ol className="af-rank">
              {rank.map((r, i) => (
                <li key={r.who}><span className="af-rank-i">{i + 1}</span><span className="af-rank-who">{r.who}</span><span className="af-rank-bar"><span style={{ width: `${Math.round((r.n / rank[0].n) * 100)}%` }} /></span><b>{r.n}</b></li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {/* Filtres */}
      <div className="af-filters">
        <button type="button" className={`af-chip ${client === "Tous" ? "on" : ""}`} onClick={() => setClient("Tous")}>Tous <b>{events.length}</b></button>
        {clients.map((c) => (
          <button type="button" key={c.cle} className={`af-chip ${client === c.cle ? "on" : ""}`} onClick={() => setClient(c.cle)}>{c.label}</button>
        ))}
      </div>
      <div className="af-critere">
        <label className="af-sel">
          <span>Période</span>
          <select value={periode} onChange={(e) => setPeriode(e.target.value)}>
            <option value="tout">Tout l'historique</option>
            <option value="semaine">7 derniers jours</option>
            <option value="jour">Aujourd'hui seulement</option>
          </select>
        </label>
        <label className="af-sel">
          <span>Par qui</span>
          <select value={qui} onChange={(e) => setQui(e.target.value)} disabled={!personnes.length}>
            <option value="Tous">Tout le monde</option>
            {personnes.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        {(client !== "Tous" || type !== "Tous" || qui !== "Tous" || periode !== "tout") && (
          <button type="button" className="af-reset"
            onClick={() => { setClient("Tous"); setType("Tous"); setQui("Tous"); setPeriode("tout"); }}>
            × réinitialiser
          </button>
        )}
      </div>

      <div className="af-types" role="tablist" aria-label="Type d'événement">
        {[["Tous", "Tout"], ["transition", "Mouvements"], ["creation", "Apparitions"], ["regression", `Régressions${nReg ? " " + nReg : ""}`]].map(([id, lbl]) => (
          <button type="button" key={id} className={`af-type ${type === id ? "on" : ""} ${id === "regression" && nReg ? "has-reg" : ""}`} onClick={() => setType(id)}>{lbl}</button>
        ))}
      </div>

      {err ? (
        <p className="af-empty af-err">Flux indisponible : {err}</p>
      ) : loading && !events.length ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : (
        <>
          {/* Aujourd'hui (à l'heure) */}
          {shownToday.length ? (
            <div className="af-day">
              <div className="af-day-hd">{dateFR ? `Aujourd'hui — ${dateFR}` : "Aujourd'hui"} <b>{shownToday.length}</b></div>
              <ul className="af-list">
                {shownToday.map((e, idx) => {
                  const rid = `${e.cle}-${e.at}-${idx}`;
                  const iss = byKey[e.cle];
                  const on = openRows.has(rid);
                  const lead = (e.kind === "transition" && coarse(e.to) === "done") ? durTxt(e.cree, e.at) : null;
                  return (
                  <li className={`af-ev af-ev-${e.kind} ${e.regression ? "af-ev-reg" : ""} ${isNew(e.at) ? "af-ev-new" : ""}${freshCls(e.cle, e.regression)}`} key={rid}>
                    <span className="af-h">{hhmm(e.at)}</span>
                    <Cli d={e.dossier} />
                    <button type="button" className="af-cle" onClick={() => openTicket(e.cle)} title="Ouvrir le ticket">{e.cle}</button>
                    <StatusChips from={e.from} to={e.to} statut={e.statut} kind={e.kind} regression={e.regression} />
                    <span className="af-t" title={e.resume}><span className="af-t-txt">{e.resume || "—"}</span>{lead ? <span className="af-lead" title={`Créé le ${frDateCourte(e.cree)} → terminé aujourd'hui`}>réalisé en {lead}</span> : null}</span>
                    <span className="af-who">
                      {(e.who || e.dev)
                        ? <>{e.who ? <>par <b>{e.who}</b></> : null}{e.dev && e.dev !== e.who ? <span className="af-dev"> · dév. {e.dev}</span> : null}</>
                        : <span className="af-who-none">—</span>}
                      <button type="button" className={`af-exp ${on ? "on" : ""}`} aria-expanded={on}
                        onClick={() => toggleRow(rid)} title="Voir l'explication simple">▾</button>
                    </span>
                    {on ? (
                      <div className="af-detail">
                        <p className="af-detail-what">{plainWhat(iss)}</p>
                        <p className="af-detail-est"><span className="af-detail-lbl">Temps estimé</span>{effortOf(iss)}<span className="af-detail-note"> · estimation indicative (d'après la priorité)</span></p>
                      </div>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            </div>
          ) : (type !== "creation" || nNew === 0) && !shownHistory.length ? (
            <p className="af-empty">Rien à afficher{client !== "Tous" ? ` sur ${(clients.find((c) => c.cle === client) || {}).label || client}` : ""}{qui !== "Tous" ? ` pour ${qui}` : ""}{periode === "jour" ? " aujourd'hui" : periode === "semaine" ? " sur 7 jours" : ""}{type !== "Tous" ? ` (${type === "transition" ? "mouvements" : type === "creation" ? "apparitions" : "régressions"})` : ""}. Le flux se remplit dès qu'un ticket bouge ou apparaît.</p>
          ) : null}

          {/* Traîne : jours précédents (au jour) */}
          {shownHistory.map((d) => (
            <div className="af-day af-day-past" key={d.day}>
              <div className="af-day-hd">{dayFR(d.day)} <b>{d.movements.length}</b> <span className="af-day-tag">au jour</span></div>
              <ul className="af-list">
                {d.movements.map((m, idx) => (
                  <li className={`af-ev af-ev-transition ${m.regression ? "af-ev-reg" : ""}${freshCls(m.cle, m.regression)}`} key={`${m.cle}-${d.day}-${idx}`}>
                    <span className="af-h af-h-day">—</span>
                    <Cli d={m.dossier} />
                    <button type="button" className="af-cle" onClick={() => openTicket(m.cle)} title="Ouvrir le ticket">{m.cle}</button>
                    <StatusChips fromLabel={m.fromLabel} toLabel={m.toLabel} kind="transition" regression={m.regression} />
                    <span className="af-t" title={m.resume}>{m.resume || "—"}</span>
                    <span className="af-who af-who-none">—</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
