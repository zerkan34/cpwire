import React, { useEffect, useMemo, useState } from "react";
import { ProjetModal } from "./Projets.jsx";
import { genDailyCR, genWrittenCR, fetchClientMails } from "../api.js";

const EUR = (n) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n).replace(/\u202f/g, "\u00a0"));
const METEO = { vert: "#1f8a5f", orange: "#e0600f", rouge: "#c0392b", neutre: "#b8b5c9" };
const ETAT_CLS = { "En cours": "pf-en", "Signé": "pf-si", "Propal envoyée": "pf-pr", "AVV Pipe": "pf-av", "Terminé": "pf-te" };
const frMonth = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); };
const frDay = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); };
const CAT_LABEL = {
  afaire: "À faire", encours: "En cours", retourTest: "Retour test", retourProd: "Retour prod",
  recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "Attente client",
  miseEnProd: "Mise en prod", termine: "Terminé", annule: "Annulé",
};
const CAT_PILL = {
  termine: "done", miseEnProd: "done", encours: "prog", recetteArmonie: "prog", recetteClient: "prog",
  afaire: "todo", attenteClient: "todo", retourTest: "block", retourProd: "block", annule: "todo",
};

export default function Client360({ c, issues = [], canCR = true, onClose, onTicket, onDev }) {
  const [selP, setSelP] = useState(null);
  const [busy, setBusy] = useState("");
  const [mails, setMails] = useState({ loading: true });
  useEffect(() => {
    let on = true;
    setMails({ loading: true });
    fetchClientMails(c.client).then((r) => on && setMails({ loading: false, ...r })).catch(() => on && setMails({ loading: false, configured: false, mails: [] }));
    return () => { on = false; };
  }, [c.client]);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!c) return null;
  const j = c.jira || {}, fin = c.finances || {}, a = c.acces;

  const recent = useMemo(() => {
    return issues.filter((i) => i.dossier === c.client)
      .slice().sort((x, y) => String(y.maj || "").localeCompare(String(x.maj || "")))
      .slice(0, 12);
  }, [issues, c.client]);

  const reste = (fin.budgete || 0) - (fin.facture || 0);
  const doc = async (kind) => {
    setBusy(kind);
    try {
      const fn = kind === "daily" ? genDailyCR : genWrittenCR;
      const { html } = await fn(c.client);
      const w = window.open("", "_blank");
      if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    } catch (e) { alert("Génération indisponible : " + (e.message || e)); }
    finally { setBusy(""); }
  };

  return (
    <div className="c360-back" onMouseDown={onClose}>
      <div className="c360" onMouseDown={(e) => e.stopPropagation()}>
        <div className="c360-hero">
          <div className="c360-hero-l">
            <div className="c360-eyebrow">Fiche client 360°</div>
            <h2>{c.client}</h2>
            <div className="c360-tags">
              <span className={`pf-type ${c.type === "TMA" ? "tma" : ""}`}>{c.type}</span>
              {c.cdp ? <span className="pf-client-cdp">CDP {c.cdp}</span> : null}
              {j.present ? <span className="c360-src">{j.total} tickets Jira</span> : null}
            </div>
          </div>
          <div className="c360-hero-actions">
            {canCR && <button className="pf-tb-btn" onClick={() => doc("daily")} disabled={busy === "daily"}>{busy === "daily" ? "…" : "📄 CR du jour"}</button>}
            {canCR && <button className="pf-tb-btn" onClick={() => doc("written")} disabled={busy === "written"}>{busy === "written" ? "…" : "📝 CR écrit"}</button>}
            <button className="c360-x" onClick={onClose} title="Fermer (Échap)">×</button>
          </div>
        </div>

        <div className="c360-body">
          {/* Contexte */}
          {a && a.contexte ? <p className="c360-ctx">{a.contexte}</p> : null}

          {/* Pouls projet (Jira) — compact, alertes colorées seulement si > 0 */}
          {j.present ? (
            <div className="c360-pulse">
              <div className="c360-pulse-i"><b>{j.total}</b><span>Tickets</span></div>
              <div className="c360-pulse-i"><b>{j.actifs}</b><span>Actifs</span></div>
              <div className="c360-pulse-i"><b>{j.recette}</b><span>En recette</span></div>
              <div className={`c360-pulse-i ${j.retours ? "warn" : ""}`}><b>{j.retours}</b><span>Retours</span></div>
              <div className={`c360-pulse-i ${j.retard ? "warn" : ""}`}><b>{j.retard}</b><span>En retard</span></div>
            </div>
          ) : null}

          {/* Finances — carte distincte avec barre de facturation */}
          <div className="c360-fin">
            <div className="c360-fin-head">
              <span className="c360-fin-lb">Finances</span>
              {fin.jh ? <span className="c360-fin-jh">{fin.jh} J/H</span> : null}
            </div>
            <div className="c360-fin-grid">
              <div className="c360-fin-kpi"><b>{EUR(fin.budgete)}</b><span>Budgété</span></div>
              <div className="c360-fin-kpi"><b>{EUR(fin.facture)}</b><span>Facturé</span></div>
              <div className="c360-fin-kpi"><b className={reste < 0 ? "neg" : ""}>{EUR(reste)}</b><span>Reste à facturer</span></div>
            </div>
            {fin.budgete ? (
              <div className="c360-fin-prog">
                <div className="c360-fin-bar"><i style={{ width: `${Math.min(100, Math.round(((fin.facture || 0) / fin.budgete) * 100))}%` }} /></div>
                <span className="c360-fin-pct">{Math.round(((fin.facture || 0) / fin.budgete) * 100)}% facturé</span>
              </div>
            ) : null}
          </div>

          {/* Recette */}
          {c.recette ? (
            <div className="pf-recette" style={{ marginBottom: 18 }}>
              <span className="pf-recette-lb">Recette · données réelles</span>
              <div className="pf-recette-bar"><div style={{ width: `${c.recette.pct}%` }} /></div>
              <span className="pf-recette-pct">{c.recette.pct}%</span>
              <span className="pf-recette-meta">{c.recette.nbProgrammes} programmes{c.recette.retours ? ` · ${c.recette.retours} en retour` : ""}</span>
            </div>
          ) : null}

          <div className="c360-cols">
            {/* Colonne gauche : projets + activité */}
            <div className="c360-main">
              <h3 className="c360-sec">Projets ({(c.projets || []).length})</h3>
              <div className="pf-tablewrap">
                <table className="proj-tbl pf-table">
                  <thead><tr><th>Projet</th><th>État</th><th>N°</th><th className="r">Budgété</th><th className="r">Facturé</th><th className="r">Reste</th><th>Avanc.</th></tr></thead>
                  <tbody>
                    {(c.projets || []).map((p, i) => {
                      const color = METEO[p.meteo] || METEO.neutre; const pct = Math.round((p.avancement || 0) * 100);
                      return (
                        <tr key={i} className={`pf-row ${ETAT_CLS[p.etat] || ""}`} onClick={() => setSelP(p)} title="Voir le détail">
                          <td className="pf-c-proj"><b>{p.nom}</b>{p.perimetre ? <span className="pf-c-perim">{p.perimetre}</span> : null}</td>
                          <td className="pf-c-etat"><span className="pf-meteo" style={{ background: color }} /><span className={`pf-etat ${ETAT_CLS[p.etat] || ""}`}>{p.etat}</span></td>
                          <td className="pf-c-num">{p.num || "—"}</td>
                          <td className="r">{EUR(p.budgete)}</td>
                          <td className="r">{EUR(p.facture)}</td>
                          <td className={`r ${p.reste < 0 ? "neg" : ""}`}>{EUR(p.reste)}</td>
                          <td className="pf-c-av"><div className="pf-cbar"><i style={{ width: `${pct}%`, background: p.meteo === "neutre" ? "var(--purple)" : color }} /></div><span className="pf-cbar-v">{pct}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="c360-sec">Activité récente</h3>
              {recent.length === 0 ? <p className="c360-empty">Aucun ticket pour ce client.</p> : (
                <ul className="c360-act">
                  {recent.map((i) => (
                    <li key={i.cle} onClick={() => onTicket && onTicket(i)} title="Ouvrir le ticket">
                      <span className="c360-act-k">{i.cle}</span>
                      <span className="c360-act-res">{i.resume}</span>
                      <span className={`pill ${CAT_PILL[i.categorie] || "todo"}`}>{CAT_LABEL[i.categorie] || i.statut}</span>
                      <span className="c360-act-meta">{i.dev && i.dev !== "Non assigné" ? i.dev + " · " : ""}{frDay(i.maj)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {!mails.loading && mails.configured ? (
                <>
                  <h3 className="c360-sec">Derniers échanges</h3>
                  {mails.mails && mails.mails.length ? (
                    <ul className="c360-mails">
                      {mails.mails.map((m) => (
                        <li key={m.id}>
                          <a href={m.link} target="_blank" rel="noopener noreferrer" className="c360-mail-subj" title="Ouvrir dans Outlook">{m.subject}</a>
                          <span className="c360-mail-meta">{m.from}{m.date ? ` · ${frDay(m.date)}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="c360-empty">{mails.note || "Aucun échange récent."}</p>}
                </>
              ) : null}
            </div>

            {/* Colonne droite : accès & contacts */}
            <aside className="c360-side">
              <h3 className="c360-sec">Accès & environnements</h3>
              {a ? (
                <div className="c360-acc">
                  <div className="c360-acc-row"><span>Portail</span>{a.portail && a.portail.url ? <a href={a.portail.url} target="_blank" rel="noopener noreferrer">{a.portail.nom || "Ouvrir"}</a> : <b>{(a.portail && a.portail.nom) || "à compléter"}</b>}</div>
                  <div className="c360-acc-row"><span>SharePoint</span>{a.sharepoint && a.sharepoint.url ? <a href={a.sharepoint.url} target="_blank" rel="noopener noreferrer">{a.sharepoint.nom || "Ouvrir"}</a> : <b>{(a.sharepoint && a.sharepoint.nom) || "à compléter"}</b>}</div>
                  <div className="c360-acc-row"><span>Environnements</span><div className="pf-acc-envs">{(a.environnements || []).length ? a.environnements.map((e, i) => <span className="pf-env" key={i}>{e}</span>) : <i className="pf-acc-todo">—</i>}</div></div>
                  {a.connexion && a.connexion.length ? <div className="c360-acc-steps"><span>Connexion</span><ol>{a.connexion.map((s, i) => <li key={i}>{s}</li>)}</ol></div> : null}
                  {a.coffre ? <div className="c360-acc-coffre">🔐 {a.coffre}</div> : null}
                </div>
              ) : <p className="c360-empty">Aucune fiche d'accès — à compléter dans <code>acces.json</code>.</p>}

              <h3 className="c360-sec">Contacts</h3>
              {a && a.contacts && a.contacts.length ? (
                <div className="c360-cgroups">
                  {[["Client", "cli"], ["Armonie", "arm"]].map(([cote, cls]) => {
                    const list = a.contacts.filter((ct) => (cote === "Armonie" ? ct.cote === "Armonie" : ct.cote !== "Armonie"));
                    if (!list.length) return null;
                    return (
                      <div className="c360-cgrp" key={cote}>
                        <div className="c360-cgrp-lb">{cote === "Armonie" ? "Côté Armonie" : "Côté client"}</div>
                        <div className="c360-contacts">
                          {list.map((ct, i) => (
                            <span className={`pf-contact ${cls}`} key={i}
                              onClick={() => cote === "Armonie" && onDev && onDev(ct.nom)}
                              style={cote === "Armonie" && onDev ? { cursor: "pointer" } : null}>
                              {ct.nom}<i>{ct.role}</i>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="c360-empty">à compléter</p>}
            </aside>
          </div>
        </div>
      </div>
      {selP ? <ProjetModal p={selP} onClose={() => setSelP(null)} /> : null}
    </div>
  );
}
