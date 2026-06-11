import React, { useMemo } from "react";

const DONE = ["termine", "miseEnProd"];
const ACTIVE = ["encours", "retourTest", "retourProd"];
const WAIT = ["recetteArmonie", "recetteClient", "attenteClient"];
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };
const CAT_LABEL = {
  encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
};

// Onglet « En cours » : avancement par client (jauge) + qui travaille sur quoi, en temps réel.
export default function EnCours({ issues = [], onTicket, onDev, deletedDevs = [] }) {
  const delSet = new Set(deletedDevs);

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

      <div className="enc-grid">
        {clients.map((c) => (
          <div className="enc-card" key={c.client}>
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
                          <li key={i.cle} onClick={() => onTicket && onTicket(i)}>
                            <span className="k">{i.cle}</span>
                            <span className="enc-tix-res">{i.resume}{i.flagged ? <span className="flag"> 🚩</span> : null}</span>
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
    </>
  );
}
