import React, { useMemo, useState } from "react";

import { VALIDES as DONE, ACTIFS as ACTIVE } from "../groups.js";
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };
const CAT_LABEL = {
  encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
};
const slug = (s) => "enc-" + String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const scrollToClient = (name) => { const el = document.getElementById(slug(name)); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

// Onglet « En cours » : avancement par client (jauge) + qui travaille sur quoi, en temps réel.
export default function EnCours({ issues = [], onTicket, onDev, deletedDevs = [], changedKeys }) {
  const delSet = new Set(deletedDevs);
  const [view, setView] = useState("client");

  const clients = useMemo(() => {
    const m = {};
    issues.forEach((i) => {
      const cli = i.dossier || "Autre";
      (m[cli] ||= { client: cli, total: 0, done: 0, active: 0, blocked: 0, wait: 0, activeItems: [] });
      const c = m[cli];
      c.total += 1;
      if (DONE.includes(i.categorie)) c.done += 1;
      if (i.statut === "Bloqué") c.blocked += 1;
      else if (ACTIVE.includes(i.categorie)) c.active += 1;
      if (WAIT.includes(i.categorie)) c.wait += 1;
      if (ACTIVE.includes(i.categorie) || i.statut === "Bloqué") c.activeItems.push(i);
    });
    return Object.values(m).map((c) => {
      c.avancement = c.total ? Math.round((c.done / c.total) * 100) : 0;
      const byDev = {};
      c.activeItems.forEach((i) => {
        const d = i.dev || i.assigne || "Non assigné";
        (byDev[d] ||= { dev: d, items: [] });
        byDev[d].items.push(i);
      });
      c.devs = Object.values(byDev).sort((a, b) => b.items.length - a.items.length);
      return c;
    }).sort((a, b) => b.active - a.active || b.blocked - a.blocked);
  }, [issues]);

  const devsList = useMemo(() => {
    const m = {};
    issues.forEach((i) => {
      const who = (i.contributors && i.contributors.length) ? i.contributors : [i.dev || i.assigne || "Non assigné"];
      who.forEach((d) => {
        (m[d] ||= { dev: d, total: 0, done: 0, active: 0, wait: 0, blocked: 0, activeItems: [] });
        const x = m[d];
        x.total += 1;
        if (DONE.includes(i.categorie)) x.done += 1;
        if (i.statut === "Bloqué") x.blocked += 1;
        else if (ACTIVE.includes(i.categorie)) x.active += 1;
        if (WAIT.includes(i.categorie)) x.wait += 1;
        if (ACTIVE.includes(i.categorie) || i.statut === "Bloqué") x.activeItems.push(i);
      });
    });
    return Object.values(m)
      .map((x) => { x.avancement = x.total ? Math.round((x.done / x.total) * 100) : 0; x.activeItems.sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || ""))); return x; })
      .filter((x) => x.dev !== "Non assigné" && (x.active > 0 || x.blocked > 0))
      .sort((a, b) => (b.active + b.blocked) - (a.active + a.blocked));
  }, [issues]);

  const totalActive = clients.reduce((s, c) => s + c.active, 0);
  const totalBlocked = clients.reduce((s, c) => s + c.blocked, 0);

  if (!issues.length) return <div className="panel empty">Aucune donnée — actualise depuis Jira.</div>;

  return (
    <>
      <div className="section-title">En cours — avancement en temps réel
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {clients.length} client(s) · {totalActive} ticket(s) en traitement{totalBlocked ? ` · ${totalBlocked} bloqué(s)` : ""}
        </span>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Jauge d'avancement par client (terminés / total) et qui travaille sur quoi. Reflète la dernière synchronisation Jira — clique un ticket pour l'ouvrir.
      </p>

      <div className="enc-toggle" role="tablist">
        <button className={`enc-tg ${view === "client" ? "on" : ""}`} onClick={() => setView("client")} role="tab" aria-selected={view === "client"}>Par client</button>
        <button className={`enc-tg ${view === "dev" ? "on" : ""}`} onClick={() => setView("dev")} role="tab" aria-selected={view === "dev"}>Par développeur</button>
      </div>

      {view === "client" && (<>
      <div className="enc-clienttabs" aria-label="Accès rapide aux clients">
        {clients.map((c) => (
          <button key={c.client} className="enc-ctab" onClick={() => scrollToClient(c.client)} title={`Aller à ${c.client}`}>
            {c.client}{c.active + c.blocked ? <span className="enc-ctab-n">{c.active + c.blocked}</span> : null}
          </button>
        ))}
      </div>

      <div className="enc-grid">
        {clients.map((c) => (
          <div className="enc-card" id={slug(c.client)} key={c.client}>
            <div className="enc-hd">
              <span className="enc-name">{c.client}</span>
              <span className="enc-pct">{c.avancement}%</span>
            </div>
            <div className="enc-bd">
              <div className="enc-gauge"><span style={{ width: `${c.avancement}%` }} /></div>
              <div className="enc-chips">
                <span className="pill done">{c.done}/{c.total} terminés</span>
                <span className="pill prog">{c.active} en cours</span>
                {c.wait ? <span className="pill todo">{c.wait} en recette</span> : null}
                {c.blocked ? <span className="pill block">{c.blocked} bloqué(s)</span> : null}
              </div>

              <div className="enc-sub">Qui travaille sur quoi</div>
              {c.devs.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>Aucun ticket actif sur ce client.</p>
              ) : (
                <div className="enc-devs">
                  {c.devs.map((d) => (
                    <div className="enc-dev" key={d.dev}>
                      <div className="enc-dev-h">
                        {d.dev && d.dev !== "Non assigné"
                          ? <span className={`dev-chip ${delSet.has(d.dev) ? "del" : ""}`} title="Voir la fiche du développeur" onClick={() => onDev && onDev(d.dev)}>{d.dev}</span>
                          : <span className="muted">Non assigné</span>}
                        <span className="enc-dev-n">{d.items.length}</span>
                      </div>
                      <ul className="enc-tix">
                        {d.items.slice(0, 6).map((i) => (
                          <li key={i.cle} id={"enc-" + i.cle} className={changedKeys && changedKeys.has(i.cle) ? "enc-changed" : undefined} onClick={() => onTicket && onTicket(i)}>
                            <span className="k">{i.cle}</span>
                            <span className="enc-tix-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}{changedKeys && changedKeys.has(i.cle) && <span className="chg-badge">MAJ</span>}</span>
                            <span className={`pill ${PILL[i.statut]}`}>{CAT_LABEL[i.categorie] || i.statutJira || i.statut}</span>
                          </li>
                        ))}
                        {d.items.length > 6 && <li className="muted" style={{ cursor: "default" }}>+ {d.items.length - 6} autre(s)…</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      </>)}

      {view === "dev" && (<>
      <div className="section-title">Par développeur — qui fait quoi en ce moment
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— {devsList.length} en activité · clique un nom pour ses heures &amp; son activité
        </span>
      </div>
      {devsList.length === 0 ? (
        <div className="panel empty">Aucun développeur avec un ticket actif en ce moment.</div>
      ) : (
        <div className="enc-grid">
          {devsList.map((d) => (
            <div className="enc-card" key={d.dev}>
              <div className="enc-hd">
                <span className={`enc-name clk ${delSet.has(d.dev) ? "del" : ""}`} title="Voir sa fiche (heures, depuis quand, activité)"
                  onClick={() => onDev && onDev(d.dev)}>{d.dev}</span>
                <span className="enc-pct">{d.active + d.blocked} actif(s)</span>
              </div>
              <div className="enc-bd">
                <div className="enc-gauge"><span style={{ width: `${d.avancement}%` }} /></div>
                <div className="enc-chips">
                  <span className="pill done">{d.done} terminés</span>
                  <span className="pill prog">{d.active} en cours</span>
                  {d.wait ? <span className="pill todo">{d.wait} en recette</span> : null}
                  {d.blocked ? <span className="pill block">{d.blocked} bloqué(s)</span> : null}
                </div>
                <div className="enc-sub">Sur quoi il travaille</div>
                <ul className="enc-tix">
                  {d.activeItems.slice(0, 7).map((i) => (
                    <li key={i.cle} id={"enc-" + i.cle} className={changedKeys && changedKeys.has(i.cle) ? "enc-changed" : undefined} onClick={() => onTicket && onTicket(i)}>
                      <span className="k">{i.cle}</span>
                      <span className="tag">{i.dossier}</span>
                      <span className="enc-tix-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}{changedKeys && changedKeys.has(i.cle) && <span className="chg-badge">MAJ</span>}</span>
                      <span className={`pill ${PILL[i.statut]}`}>{CAT_LABEL[i.categorie] || i.statutJira || i.statut}</span>
                    </li>
                  ))}
                  {d.activeItems.length > 7 && <li className="muted" style={{ cursor: "default" }}>+ {d.activeItems.length - 7} autre(s)…</li>}
                </ul>
                <button className="btn-line sm" style={{ marginTop: 10 }} onClick={() => onDev && onDev(d.dev)}>Voir ses heures &amp; son activité</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>)}
    </>
  );
}
