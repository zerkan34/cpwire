import React, { useEffect, useState } from "react";
import { fetchProjets, downloadProjetsXlsx, openProjetsDoc } from "../api.js";
import Client360 from "./Client360.jsx";

const EUR = (n) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n).replace(/\u202f/g, "\u00a0"));
const METEO = { vert: "#1f8a5f", orange: "#e0600f", rouge: "#c0392b", neutre: "#b8b5c9" };
const ETAT_CLS = { "En cours": "pf-en", "Signé": "pf-si", "Propal envoyée": "pf-pr", "AVV Pipe": "pf-av", "Terminé": "pf-te" };
const frMonth = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }); };

function Ring({ pct, color, size = 44 }) {
  const r = 17, c = 2 * Math.PI * r, off = c * (1 - (pct || 0));
  return (
    <svg className="pf-ring" viewBox="0 0 44 44" style={{ width: size, height: size }}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 22 22)" />
      <text x="22" y="23" textAnchor="middle" dominantBaseline="central" className="pf-ring-t">{Math.round((pct || 0) * 100)}%</text>
    </svg>
  );
}

const initials = (s) => String(s || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function Card({ p, onOpen }) {
  const color = METEO[p.meteo] || METEO.neutre;
  const pct = Math.round((p.avancement || 0) * 100);
  const period = (p.debut || p.fin) ? `${frMonth(p.debut) || "?"} → ${frMonth(p.fin) || "?"}` : "";
  return (
    <button className={`pf-card ${ETAT_CLS[p.etat] || ""}`} onClick={() => onOpen(p)} title="Voir le détail">
      <span className="pf-accent" />
      <div className="pf-card-top">
        <span className={`pf-etat ${ETAT_CLS[p.etat] || ""}`}>{p.etat}</span>
        <span className={`pf-type ${p.type === "TMA" ? "tma" : ""}`}>{p.type}</span>
        <span className="pf-meteo" style={{ background: color }} title={`Météo : ${p.meteo}`} />
        {p.cdp ? <span className="pf-cdp" title={`Chef de projet : ${p.cdp}`}>{initials(p.cdp)}</span> : <span className="pf-cdp pf-cdp-none" title="CDP non défini">—</span>}
      </div>
      <div className="pf-card-h">
        <div className="pf-nom">{p.nom}</div>
        {p.perimetre ? <div className="pf-perim">{p.perimetre}</div> : null}
        <div className="pf-num">{p.num}{period ? ` · ${period}` : ""}</div>
      </div>
      <div className="pf-prog">
        <div className="pf-prog-bar"><i style={{ width: `${pct}%`, background: p.meteo === "neutre" ? "var(--purple)" : color }} /></div>
        <span className="pf-prog-v">{pct}%</span>
      </div>
      <div className="pf-fin">
        <div><span>Budgété</span><b>{EUR(p.budgete)}</b></div>
        <div><span>Facturé</span><b>{EUR(p.facture)}</b></div>
        <div><span>Reste</span><b className={p.reste < 0 ? "neg" : ""}>{EUR(p.reste)}</b></div>
      </div>
      {p.attention && p.attention.length > 0 ? (
        <ul className="pf-att">{p.attention.slice(0, 2).map((a, i) => <li key={i}>{a}</li>)}{p.attention.length > 2 ? <li className="pf-more">+{p.attention.length - 2} autre(s)…</li> : null}</ul>
      ) : null}
    </button>
  );
}

export function ProjetModal({ p, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!p) return null;
  const color = METEO[p.meteo] || METEO.neutre;
  const meteoLabel = { vert: "Au vert", orange: "Vigilance", rouge: "Critique", neutre: "Non évaluée" }[p.meteo] || "Non évaluée";
  return (
    <div className="pf-modal-back" onMouseDown={onClose}>
      <div className="pf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pf-modal-hero">
          <button className="pf-modal-x" onClick={onClose} title="Fermer (Échap)">×</button>
          <div className="pf-modal-hero-l">
            <div className="pf-modal-cli">{p.client} · {p.type}</div>
            <h3>{p.nom}{p.perimetre ? <span className="pf-modal-perim"> — {p.perimetre}</span> : null}</h3>
            <div className="pf-modal-tags">
              <span className={`pf-etat ${ETAT_CLS[p.etat] || ""}`}>{p.etat}</span>
              <span className="pf-modal-meteo" style={{ "--mc": color }}>Météo : {meteoLabel}</span>
              {p.num ? <span className="pf-modal-num">{p.num}</span> : null}
            </div>
          </div>
          <div className="pf-modal-ring">
            <Ring pct={p.avancement} color={p.meteo === "neutre" ? "#ffffff" : color} size={64} />
          </div>
        </div>

        <div className="pf-modal-body">
          <h4 className="pf-modal-h">Finances</h4>
          <div className="pf-modal-fin">
            <div className="pf-fin-c"><span>Budgété</span><b>{EUR(p.budgete)}</b></div>
            <div className="pf-fin-c"><span>Facturé</span><b>{EUR(p.facture)}</b></div>
            <div className={`pf-fin-c ${p.reste < 0 ? "neg" : ""}`}><span>Reste à facturer</span><b>{EUR(p.reste)}</b></div>
          </div>

          <h4 className="pf-modal-h">Cadre du projet</h4>
          <div className="pf-modal-meta">
            <div><span>Chef de projet</span><b>{p.cdp || "—"}</b></div>
            <div><span>Avancement</span><b>{Math.round((p.avancement || 0) * 100)}%</b></div>
            <div><span>J/H vendus</span><b>{p.jh ?? "—"}</b></div>
            <div><span>Début</span><b>{frMonth(p.debut) || "—"}</b></div>
            <div><span>Fin</span><b>{frMonth(p.fin) || "—"}</b></div>
          </div>

          {p.attention && p.attention.length ? (
            <div className="pf-modal-sec"><h4>Points d'attention</h4><ul className="pf-att">{p.attention.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          ) : null}
          {p.raf && p.raf.length ? (
            <div className="pf-modal-sec"><h4>Reste à faire</h4><ul className="pf-raf">{p.raf.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          ) : null}
          {p.comment ? <div className="pf-modal-sec"><h4>Commentaire</h4><p className="pf-modal-com">{p.comment}</p></div> : null}
        </div>
      </div>
    </div>
  );
}

function ClientBlock({ c, onOpen, onOpen360 }) {
  const j = c.jira || {};
  const [openAcc, setOpenAcc] = useState(false);
  const a = c.acces;
  return (
    <section className="pf-client">
      <header className="pf-client-hd">
        <div className="pf-client-id">
          <button className="pf-client-name" onClick={() => onOpen360 && onOpen360(c)} title="Ouvrir la fiche client 360°">{c.client}</button>
          <span className={`pf-type ${c.type === "TMA" ? "tma" : ""}`}>{c.type}</span>
          {c.cdp ? <span className="pf-client-cdp">CDP {c.cdp}</span> : null}
        </div>
        <div className="pf-client-fin">
          <div><span>Budgété</span><b>{EUR(c.finances.budgete)}</b></div>
          <div><span>Facturé</span><b>{EUR(c.finances.facture)}</b></div>
          <div><span>J/H</span><b>{c.finances.jh || "—"}</b></div>
        </div>
        {j.present ? (
          <div className="pf-pulse">
            <span className="pf-chip">{j.total} tickets</span>
            {j.actifs > 0 ? <span className="pf-chip act">{j.actifs} actifs</span> : null}
            {j.recette > 0 ? <span className="pf-chip rec">{j.recette} en recette</span> : null}
            {j.retours > 0 ? <span className="pf-chip ret">{j.retours} retours</span> : null}
            {j.retard > 0 ? <span className="pf-chip late">{j.retard} en retard</span> : null}
          </div>
        ) : null}
        {a ? <button className="pf-acc-btn" onClick={() => setOpenAcc((v) => !v)} title="Accès, environnements et contacts">{openAcc ? "▾" : "▸"} Accès & contacts</button> : null}
        <button className="pf-360-btn" onClick={() => onOpen360 && onOpen360(c)} title="Vue complète du client">Fiche 360°</button>
      </header>
      {c.recette ? (
        <div className="pf-recette" title="Avancement réel de la recette, calculé depuis le référentiel + Jira">
          <span className="pf-recette-lb">Recette · données réelles</span>
          <div className="pf-recette-bar"><div style={{ width: `${c.recette.pct}%` }} /></div>
          <span className="pf-recette-pct">{c.recette.pct}%</span>
          <span className="pf-recette-meta">{c.recette.nbProgrammes} programmes{c.recette.retours ? ` · ${c.recette.retours} en retour` : ""}</span>
        </div>
      ) : null}
      {openAcc && a ? (
        <div className="pf-acc">
          {a.contexte ? <p className="pf-acc-ctx">{a.contexte}</p> : null}
          <div className="pf-acc-grid">
            <div className="pf-acc-card">
              <span className="pf-acc-lbl">Portail</span>
              {a.portail && a.portail.url ? <a href={a.portail.url} target="_blank" rel="noopener noreferrer">{a.portail.nom || "Ouvrir"}</a> : <b>{(a.portail && a.portail.nom) || "à compléter"}</b>}
            </div>
            <div className="pf-acc-card">
              <span className="pf-acc-lbl">SharePoint</span>
              {a.sharepoint && a.sharepoint.url ? <a href={a.sharepoint.url} target="_blank" rel="noopener noreferrer">{a.sharepoint.nom || "Ouvrir"}</a> : <b>{(a.sharepoint && a.sharepoint.nom) || "à compléter"}</b>}
            </div>
            <div className="pf-acc-card">
              <span className="pf-acc-lbl">Environnements</span>
              <div className="pf-acc-envs">{(a.environnements || []).length ? a.environnements.map((e, i) => <span className="pf-env" key={i}>{e}</span>) : <i className="pf-acc-todo">à compléter</i>}</div>
            </div>
          </div>
          {a.connexion && a.connexion.length ? (
            <div className="pf-acc-sec"><h5>Connexion</h5><ol className="pf-acc-steps">{a.connexion.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
          ) : null}
          {a.contacts && a.contacts.length ? (
            <div className="pf-acc-sec"><h5>Contacts</h5><div className="pf-acc-contacts">{a.contacts.map((ct, i) => (
              <span className={`pf-contact ${ct.cote === "Armonie" ? "arm" : "cli"}`} key={i}>{ct.nom}<i>{ct.role}{ct.cote ? ` · ${ct.cote}` : ""}</i></span>
            ))}</div></div>
          ) : null}
          {a.coffre ? <div className="pf-acc-coffre">🔐 {a.coffre}</div> : null}
        </div>
      ) : null}
      <div className="pf-tablewrap">
        <table className="proj-tbl pf-table">
          <thead>
            <tr>
              <th>Projet</th><th>État</th><th>N° projet</th><th>Début</th><th>Fin</th>
              <th className="r">J/H</th><th className="r">Budgété</th><th className="r">Facturé</th><th className="r">Reste</th>
              <th>Avanc.</th><th>Points d'attention</th>
            </tr>
          </thead>
          <tbody>
            {c.projets.map((p, i) => {
              const color = METEO[p.meteo] || METEO.neutre;
              const pct = Math.round((p.avancement || 0) * 100);
              return (
                <tr key={i} className={`pf-row ${ETAT_CLS[p.etat] || ""}`} onClick={() => onOpen(p)} title="Voir le détail du projet">
                  <td className="pf-c-proj"><b>{p.nom}</b>{p.perimetre ? <span className="pf-c-perim">{p.perimetre}</span> : null}</td>
                  <td className="pf-c-etat"><span className="pf-meteo" style={{ background: color }} /><span className={`pf-etat ${ETAT_CLS[p.etat] || ""}`}>{p.etat}</span></td>
                  <td className="pf-c-num">{p.num || "—"}</td>
                  <td>{frMonth(p.debut) || "—"}</td>
                  <td>{frMonth(p.fin) || "—"}</td>
                  <td className="r">{p.jh ?? "—"}</td>
                  <td className="r">{EUR(p.budgete)}</td>
                  <td className="r">{EUR(p.facture)}</td>
                  <td className={`r ${p.reste < 0 ? "neg" : ""}`}>{EUR(p.reste)}</td>
                  <td className="pf-c-av">
                    <div className="pf-cbar"><i style={{ width: `${pct}%`, background: p.meteo === "neutre" ? "var(--purple)" : color }} /></div>
                    <span className="pf-cbar-v">{pct}%</span>
                  </td>
                  <td className="pf-c-att">{(p.attention || []).join(" · ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Projets({ issues = [], onTicket, onDev }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [sel360, setSel360] = useState(null);
  const [dl, setDl] = useState(false);

  useEffect(() => {
    let alive = true; setLoading(true); setErr("");
    fetchProjets().then((r) => { if (alive) setD(r); }).catch((e) => { if (alive) setErr(e.message || "Erreur"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const openAlerte = (a) => {
    if (!d) return;
    for (const c of d.clients) for (const p of c.projets) {
      if (c.client === a.client && p.nom === a.projet && (p.perimetre || "") === (a.perimetre || "")) { setSel(p); return; }
    }
  };
  const exportXlsx = async () => { setDl(true); try { await downloadProjetsXlsx(); } catch (e) { alert("Export indisponible : " + (e.message || e)); } finally { setDl(false); } };
  const exportPdf = async () => { try { await openProjetsDoc(); } catch (e) { alert(e.message || String(e)); } };

  if (loading) return <div className="empty">Chargement du portefeuille…</div>;
  if (err) return <div className="empty">Suivi de projets indisponible : {err}</div>;
  if (!d) return null;
  const k = d.kpis, rc = d.recap || { alertes: [] };
  const KPIS = [
    ["Budget total", EUR(k.budgete), "i"], ["Facturé", EUR(k.facture), "g"], ["Reste à facturer", EUR(k.reste), "o"],
    ["J/H vendus", k.jh, "i"], ["Projets actifs", k.actifs, "g"], ["Clients", k.nbClients, "o"],
  ];
  return (
    <div className="pf-wrap">
      <div className="pf-hero">
        <div className="pf-hero-t">
          <h2>Suivi de projets</h2>
          <p>Cockpit Armonie — enrichi en temps réel par Jira</p>
        </div>
        <div className="pf-toolbar">
          <button className="pf-tb-btn" onClick={exportXlsx} disabled={dl}>{dl ? "Export…" : "⬇ Excel"}</button>
          <button className="pf-tb-btn pf-tb-pdf" onClick={exportPdf}>📄 PDF (charte)</button>
        </div>
      </div>

      <div className="pf-recap">
        <div className="pf-recap-hd">
          <h3>Ce qui demande votre attention</h3>
          <span className="pf-recap-meta">{rc.aSigner} à signer ({EUR(rc.montantPipe)} en pipe) · {rc.enRetard || 0} tickets en retard</span>
        </div>
        {rc.alertes.length === 0 ? (
          <p className="pf-recap-empty">Rien d'urgent — portefeuille sous contrôle 🎉</p>
        ) : (
          <ul className="pf-recap-list">
            {rc.alertes.map((a, i) => (
              <li key={i} className={`pf-alerte n-${a.niveau}`} onClick={() => openAlerte(a)} title="Ouvrir le projet">
                <span className="pf-alerte-dot" />
                <span className="pf-alerte-type">{a.type}</span>
                <span className="pf-alerte-proj"><b>{a.client}</b> — {a.projet}{a.perimetre ? ` · ${a.perimetre}` : ""}</span>
                <span className="pf-alerte-det">{a.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pf-fin-title">Indicateurs du portefeuille</div>
      <div className="pf-kpis">
        {KPIS.map(([l, v, t]) => (
          <div className={`pf-kpi t-${t}`} key={l}><div className="pf-kpi-v">{v}</div><div className="pf-kpi-l">{l}</div></div>
        ))}
      </div>

      <div className="pf-pipe">
        {d.pipeline.map((s) => (
          <div key={s.etat} className={`pf-pipe-seg ${ETAT_CLS[s.etat] || ""}`}>
            <b>{s.n}</b><span>{s.etat}</span><i>{s.montant ? EUR(s.montant) : "\u00a0"}</i>
          </div>
        ))}
      </div>

      {d.clients.map((c) => <ClientBlock key={c.client} c={c} onOpen={setSel} onOpen360={setSel360} />)}
      <p className="pf-foot">Couche commerciale éditable, confrontée aux tickets Jira en direct{d.majSource ? ` · ${d.majSource}` : ""}.</p>

      {sel ? <ProjetModal p={sel} onClose={() => setSel(null)} /> : null}
      {sel360 ? <Client360 c={sel360} issues={issues} onClose={() => setSel360(null)} onTicket={onTicket} onDev={onDev} /> : null}
    </div>
  );
}
