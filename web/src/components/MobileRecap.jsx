import React, { useMemo, useState } from "react";
import { computeBlockers } from "../blockers.js";

// Page Récap — version mobile. Reproduit la maquette validée, câblée aux vrais
// compteurs du point du soir (catégorie Jira). Zéro invention : un delta n'est
// affiché que si une donnée réelle est fournie.
const nf = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " "));

// Ordre + libellés des statuts, identiques au point du soir.
const STATUS = [
  { k: "miseEnProd", t: "Mise en production", s: "Déployé en production", c: "c-v",
    ic: <svg viewBox="0 0 24 24"><path d="M5 16l3 3M9 15l-4 4M14 4c4 0 6 2 6 6 0 5-6 9-9 11-1-1-3-3-3-3M14 4c-2 0-5 1-7 4l6 6c3-2 4-5 4-7M14 4l2 2" /></svg> },
  { k: "termine", t: "Terminé", s: "Tickets finalisés", c: "c-g",
    ic: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg> },
  { k: "recetteClient", t: "Recette client", s: "En recette chez le client", c: "c-b",
    ic: <svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v5l-4 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-9V3" /></svg> },
  { k: "recetteArmonie", t: "Recette Armonie", s: "En recette interne", c: "c-o",
    ic: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 18c0-2 2-3.5 4-3.5s2.5 1 2.5 3.5" /></svg> },
  { k: "encours", t: "En cours", s: "En cours de réalisation", c: "c-y",
    ic: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" /></svg> },
  { k: "retourTest", t: "Retour de test", s: "Retour de test à traiter", c: "c-r",
    ic: <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></svg> },
  { k: "attenteClient", t: "En attente client", s: "En attente d'actions client", c: "c-v",
    ic: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg> },
];

export default function MobileRecap({ issues = [], onTicket, onBack, syncedAt, heuresPointees = null, retard = null }) {
  // Liste des dossiers présents.
  const dossiers = useMemo(() => [...new Set(issues.map((i) => i.dossier).filter((d) => d && d !== "—"))].sort(), [issues]);
  const [client, setClient] = useState(() => (dossiers.includes("Tafanel") ? "Tafanel" : dossiers[0] || "Tous dossiers"));
  const [scope, setScope] = useState("all");
  const [period, setPeriod] = useState("today");
  const [clientOpen, setClientOpen] = useState(false);
  const [openK, setOpenK] = useState(null); // statut déplié

  const ofClient = useMemo(
    () => (client === "Tous dossiers" ? issues : issues.filter((i) => i.dossier === client)),
    [issues, client]
  );
  const prefixes = useMemo(() => [...new Set(ofClient.map((i) => i.projet).filter(Boolean))].sort(), [ofClient]);
  const multi = prefixes.length > 1;
  const items = useMemo(
    () => (scope === "all" || !multi ? ofClient : ofClient.filter((i) => i.projet === scope)),
    [ofClient, scope, multi]
  );

  const count = (k) => items.filter((i) => i.categorie === k).length;
  const ticketsOf = (k) => items.filter((i) => i.categorie === k);
  const total = items.length;
  const kProd = count("miseEnProd");
  const kFini = count("termine");
  const kAtt = count("attenteClient");
  // Retard = points bloquants en échéance dépassée (même calcul que le radar), sur le périmètre courant.
  const retardN = useMemo(() => {
    if (retard != null) return retard;
    try { return computeBlockers(items).filter((b) => b && b.severity === "critique").length; } catch { return null; }
  }, [items, retard]);

  const syncTxt = useMemo(() => {
    if (!syncedAt) return "—";
    const m = Math.max(0, Math.round((Date.now() - new Date(syncedAt).getTime()) / 60000));
    return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
  }, [syncedAt]);
  const updTxt = useMemo(() => (syncedAt ? new Date(syncedAt).toLocaleTimeString("fr-FR") : ""), [syncedAt]);

  const scopeSegs = multi ? ["all", ...prefixes] : [];
  // Libellé du bouton « tout le périmètre » : le join reste lisible à 2 préfixes (ex. « PTAF + TMT »),
  // mais devient un pavé qui déborde dès qu'on est sur « Tous dossiers » → on bascule sur « Tous ».
  const segLabel = (s) => (s === "all" ? (prefixes.length <= 2 ? prefixes.join(" + ") : "Tous") : s);

  const KPI = [
    { cls: "k-v", l: "Tickets suivis", n: total, ic: <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>, sp: "0,18 12,14 25,16 38,9 50,13 62,7 75,11 88,6 100,10", col: "#8b5cf6" },
    { cls: "k-g", l: "Production", n: kProd, ic: <svg viewBox="0 0 24 24"><path d="M5 16l4-8 4 5 3-6 3 9" /></svg>, sp: "0,16 12,12 25,14 38,8 50,11 62,6 75,9 88,5 100,8", col: "#2bd97f" },
    { cls: "k-b", l: "Terminés", n: kFini, ic: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>, sp: "0,17 12,15 25,12 38,14 50,9 62,12 75,8 88,10 100,7", col: "#4a90e2" },
    { cls: "k-o", l: "En attente", n: kAtt, ic: <svg viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M8 2c0 5 8 6 8 10s-8 5-8 10M16 2c0 5-8 6-8 10" /></svg>, sp: "0,8 12,11 25,9 38,13 50,11 62,15 75,12 88,16 100,14", col: "#ff8c1a" },
  ];

  return (
    <div className="mr">
      <div className="wrap">
        {/* HEADER */}
        <div className="rh">
          <button className="rh-back" onClick={onBack} aria-label="Retour">‹</button>
          <div className="rh-mid">
            <div className="rh-topline">
              <div><div className="rh-k">Récap</div><div className="rh-t">Récap</div></div>
              <div className="rh-actions">
                <span className="live"><span className="d" />Live</span>
                <button className="rh-sync" aria-label="Rafraîchir"><svg viewBox="0 0 24 24" strokeLinecap="round"><path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 12a9 9 0 0 0 15 6.7L21 16M3 4v4h4M21 20v-4h-4" /></svg></button>
              </div>
            </div>
            <div className="rh-s">Vue consolidée des activités du jour</div>
            {updTxt ? <div className="rh-upd" style={{ justifyContent: "flex-end", marginTop: 8 }}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Dernière mise à jour {updTxt}</div> : null}
          </div>
        </div>

        {/* FILTRES */}
        <div className="filt">
          <div className="frow">
            <div className="fcol period">
              <div className="lab">Période</div>
              <div className="seg">
                <button className={`seg-b ${period === "today" ? "on-o" : ""}`} onClick={() => setPeriod("today")}>Aujourd'hui</button>
                <button className={`seg-b ${period === "hist" ? "on-o" : ""}`} onClick={() => setPeriod("hist")}>Historique</button>
              </div>
            </div>
            <div className="fcol cli">
              <div className="lab">Client</div>
              <button className="client" onClick={() => setClientOpen((v) => !v)} style={{ width: "100%", cursor: "pointer" }}>
                <span className="nm">{client}</span>
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <span className="sep" />
                <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {clientOpen ? (
                <div className="mr-cli-menu">
                  {["Tous dossiers", ...dossiers].map((d) => (
                    <button key={d} className={`mr-cli-it ${d === client ? "on" : ""}`} onClick={() => { setClient(d); setScope("all"); setClientOpen(false); }}>{d}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="lab">Périmètre</div>
          <div className="pds-row">
            <div className="seg">
              {multi ? scopeSegs.map((s) => (
                <button key={s} className={`seg-b ${scope === s ? "on-v" : ""}`} onClick={() => setScope(s)}>{segLabel(s)}</button>
              )) : (
                <button className="seg-b on-v">{prefixes[0] || "Tous"}</button>
              )}
            </div>
            <button className="allbtn"><svg viewBox="0 0 24 24"><path d="M3 6h18M6 12h12M10 18h4" /></svg>Tout (état actuel)</button>
          </div>
        </div>

        {/* KPIS */}
        <div className="kpis">
          {KPI.map((c) => (
            <div key={c.l} className={`kpi ${c.cls}`}>
              <div className="kpi-ic">{c.ic}</div>
              <div className="kpi-l">{c.l}</div>
              <div className="kpi-n">{nf(c.n)}</div>
              <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points={c.sp} fill="none" stroke={c.col} strokeWidth="2" /></svg>
            </div>
          ))}
        </div>

        {/* LISTE STATUTS */}
        <div className="sec-l">Le point du soir</div>
        {STATUS.map((st) => {
          const n = count(st.k);
          const open = openK === st.k;
          const tks = open ? ticketsOf(st.k) : [];
          return (
            <div key={st.k} className={`st-wrap ${open ? "open" : ""}`}>
              <button className={`st ${st.c}`} onClick={() => setOpenK(open ? null : st.k)} style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
                <span className="st-ic">{st.ic}</span>
                <span className="st-tx"><span className="st-t">{st.t}</span><span className="st-s">{st.s}</span></span>
                <span className="st-n">{nf(n)}</span>
                {n > 0 ? <span className="st-d">+{nf(n)}</span> : null}
                <span className={`st-ch ${open ? "op" : ""}`}>›</span>
              </button>
              {open ? (
                <div className="mr-tickets">
                  {tks.length === 0 ? (
                    <div className="mr-tk-empty">Aucun ticket dans ce statut.</div>
                  ) : tks.map((i) => (
                    <button key={i.cle} className="mr-tk" onClick={() => onTicket && onTicket(i)}>
                      {i.flagged ? <span className="mr-tk-flag">🚩</span> : null}
                      <b className="mr-tk-key">{i.cle}</b>
                      <span className="mr-tk-res">{i.resume || ""}</span>
                      <span className="mr-tk-asg">{i.assigne || "non assigné"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* RÉSUMÉ */}
        <div className="resume">
          <div className="rcell"><svg viewBox="0 0 24 24" stroke="#8b5cf6"><path d="M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4" /></svg><span className="rn">{nf(total)}</span><span className="rl">Tickets suivis</span></div>
          <div className="rcell"><svg viewBox="0 0 24 24" stroke="#4a90e2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span className="rn">{heuresPointees == null ? "—" : `${heuresPointees} h`}</span><span className="rl">Heures pointées</span></div>
          <div className="rcell"><svg viewBox="0 0 24 24" stroke="#2bd97f"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg><span className="rn">{retardN == null ? "—" : nf(retardN)}</span><span className="rl">Retard</span></div>
          <div className="rcell"><svg viewBox="0 0 24 24" stroke="#2bd97f"><path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 12a9 9 0 0 0 15 6.7L21 16M3 4v4h4M21 20v-4h-4" /></svg><span className="rn">{syncTxt}</span><span className="rl">Synchronisé</span></div>
        </div>
      </div>
    </div>
  );
}
