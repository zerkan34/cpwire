import React, { useEffect, useMemo, useState, useRef } from "react";
import { progResume } from "../ticket.js";
import { ProjetModal } from "./Projets.jsx";
import { genDailyCR, genWrittenCR, fetchClientMails, fetchHygiene, fetchReferentiel, importAnalyze, importApply } from "../api.js";
import { buildRecapDoc } from "../recapDoc.js";
import EdlMax from "./EdlMax.jsx";
import { RECETTE, RETOUR } from "../groups.js";
import { useModalBack } from "../modalNav.js";
import PointDuSoir from "./PointDuSoir.jsx";
import { printHtml } from "../utils.js";

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

export default function Client360({ c, issues = [], facts, canCR = true, onClose, onTicket, onDev }) {
  const [selP, setSelP] = useState(null);
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  // Import d'un document pour alimenter les données de l'app (rien n'est appliqué sans confirmation).
  const onImportFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (ev.target) ev.target.value = "";
    if (!file) return;
    setBusy("import");
    try {
      const r = await importAnalyze(file);
      if (!r || r.ok === false || r.error) { alert(r && r.error ? r.error : "Type de fichier non géré pour l'import."); setBusy(""); return; }
      const resume = (r.proposal && (r.proposal.resume || r.proposal.cible)) || r.apercu || "Document analysé.";
      const ok = window.confirm(`Import détecté — ${file.name}\n\n${resume}\n\nMettre à jour les données de l'application ?`);
      if (!ok) { setBusy(""); return; }
      await importApply({ filename: r.filename || file.name, proposal: r.proposal, apercu: r.apercu, dataset: r.dataset, diff: r.diff });
      alert("Données mises à jour ✓");
    } catch (e) {
      alert("Échec de l'import : " + (e && e.message ? e.message : "erreur"));
    }
    setBusy("");
  };
  const [mails, setMails] = useState({ loading: true });
  const [hyg, setHyg] = useState(null);
  const [qualOpen, setQualOpen] = useState(false);
  const [q, setQ] = useState("");
  const [actSort, setActSort] = useState("date");
  const [openCheck, setOpenCheck] = useState(null);
  const [ref, setRef] = useState(null);
  useEffect(() => {
    let on = true;
    setMails({ loading: true });
    fetchClientMails(c.client).then((r) => on && setMails({ loading: false, ...r })).catch(() => on && setMails({ loading: false, configured: false, mails: [] }));
    return () => { on = false; };
  }, [c.client]);
  useEffect(() => { let on = true; fetchHygiene().then((r) => on && setHyg(r)).catch(() => on && setHyg(null)); return () => { on = false; }; }, []);
  useEffect(() => { let on = true; setRef(null); fetchReferentiel(c.client).then((r) => on && setRef(r)).catch(() => on && setRef(null)); return () => { on = false; }; }, [c.client]);
  useModalBack(onClose);
  const hasBoth = /TMA/i.test(c.type || "") && /projet/i.test(c.type || "");
  const [seg, setSeg] = useState("all");
  const engOf = (k) => (/^P/i.test(k || "") ? "Projet" : "TMA");
  if (!c) return null;
  const fin = c.finances || {}, a = c.acces;
  const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Chiffres tickets canoniques (facts, live Jira) du client — insensible à la casse.
  let j = c.jira || {}, fblock = null, canonDossier = c.client;
  if (facts && facts.byDossier) {
    const t = norm(c.client);
    for (const [d, f] of Object.entries(facts.byDossier)) {
      if (norm(d) === t) { fblock = f; canonDossier = d; j = { present: true, total: f.total, actifs: f.actifsDev, recette: f.enRecette, retours: f.retours, retard: f.enRetard }; break; }
    }
  }

  const recent = useMemo(() => {
    return issues.filter((i) => norm(i.dossier) === norm(c.client) && (!hasBoth || seg === "all" || engOf(i.cle) === seg))
      .slice().sort((x, y) => String(y.maj || "").localeCompare(String(x.maj || "")))
      .slice(0, 12);
  }, [issues, c.client, seg, hasBoth]);

  const dossierIssues = useMemo(() => issues.filter((i) => norm(i.dossier) === norm(c.client) && (!hasBoth || seg === "all" || engOf(i.cle) === seg)), [issues, c.client, seg, hasBoth]);
  const recSet = new Set(RECETTE), retSet = new Set(RETOUR);
  const recetteItems = dossierIssues.filter((i) => recSet.has(i.categorie) || retSet.has(i.categorie))
    .sort((a, b) => (retSet.has(b.categorie) ? 1 : 0) - (retSet.has(a.categorie) ? 1 : 0));
  const hygScore = hyg ? (hyg.byDossier || []).find((d) => norm(d.dossier) === norm(c.client)) : null;
  const hygChecks = hyg ? (hyg.checks || []).map((ch) => ({ id: ch.id, label: ch.label, tickets: (ch.tickets || []).filter((t) => norm(t.dossier) === norm(c.client)) })).filter((x) => x.tickets.length) : [];
  // Recherche transverse de la fiche : filtre les listes (projets, activité, recette, anomalies).
  const qx = q.trim().toLowerCase();
  const qmatch = (...parts) => !qx || parts.filter(Boolean).join(" ").toLowerCase().includes(qx);
  const projetsShown = qx ? (c.projets || []).filter((p) => qmatch(p.nom, p.perimetre, p.num, p.etat)) : (c.projets || []);
  const recentShown = qx
    ? dossierIssues.filter((i) => qmatch(i.cle, i.resume, i.dev, i.assigne, i.statut, i.statutJira)).slice().sort((x, y) => String(y.maj || "").localeCompare(String(x.maj || ""))).slice(0, 50)
    : recent;
  const recetteShown = qx ? recetteItems.filter((i) => qmatch(i.cle, i.resume, i.dev, i.assigne, i.statut, i.statutJira)) : recetteItems;
  const hygChecksShown = qx ? hygChecks.map((ch) => ({ ...ch, tickets: ch.tickets.filter((t) => qmatch(t.cle, t.resume)) })).filter((ch) => ch.tickets.length) : hygChecks;
  const actSorted = recentShown.slice().sort((a, b) => {
    if (actSort === "statut") return String(a.categorie || a.statut || "").localeCompare(String(b.categorie || b.statut || "")) || String(b.maj || "").localeCompare(String(a.maj || ""));
    if (actSort === "nom") return String(a.dev || a.assigne || "~").localeCompare(String(b.dev || b.assigne || "~"));
    if (actSort === "cle") return String(a.cle).localeCompare(String(b.cle), "fr", { numeric: true });
    return String(b.maj || "").localeCompare(String(a.maj || ""));
  });
  const hygByKey = useMemo(() => { const m = {}; issues.forEach((i) => { m[i.cle] = i; }); return m; }, [issues]);
  const hygTotal = hygChecks.reduce((s, ch) => s + ch.tickets.length, 0);

  const reste = (fin.budgete || 0) - (fin.facture || 0);
  const doc = async (kind) => {
    setBusy(kind);
    try {
      let html;
      if (kind === "daily") {
        // Récap = générateur unique (mêmes chiffres que le point du soir du client).
        ({ html } = buildRecapDoc({ issues, scope: c.client }));
      } else {
        ({ html } = await genWrittenCR(c.client));
      }
      const iso = new Date().toISOString().slice(0, 10);
      const base = kind === "daily" ? "Recap" : "CR_ecrit";
      const fname = `${base}_${String(c.client).replace(/[^\w-]+/g, "_")}_${iso}.pdf`;
      // Vrai PDF (serveur WeasyPrint sinon navigateur), voile de progression + choix du dossier.
      await printHtml(html, fname);
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
            <button className="pf-tb-btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy === "import"} title="Importer un fichier (CSV, PowerPoint, OneNote…) pour mettre à jour les données">{busy === "import" ? "…" : "📥 Importer"}</button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,.md,.log,.pptx,.one,.iqy,.pdf,.zip,.xlsx,.docx" style={{ display: "none" }} onChange={onImportFile} />
            <button className="c360-x" onClick={onClose} title="Fermer (Échap)">×</button>
          </div>
        </div>

        <div className="c360-body">
          <div className="c360-search c360-search-hdr">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans toute la fiche (ticket, projet, écran, anomalie, dév…)" aria-label="Rechercher dans la fiche" />
            {qx ? <button type="button" className="c360-search-x" onClick={() => setQ("")} aria-label="Effacer la recherche">✕</button> : null}
          </div>
          {hasBoth && (
            <div className="c360-seg" role="tablist" aria-label="Périmètre">
              <button className={seg === "all" ? "on" : ""} onClick={() => setSeg("all")} role="tab" aria-selected={seg === "all"}>Vue d'ensemble</button>
              <button className={seg === "TMA" ? "on" : ""} onClick={() => setSeg("TMA")} role="tab" aria-selected={seg === "TMA"}>TMA</button>
              <button className={seg === "Projet" ? "on" : ""} onClick={() => setSeg("Projet")} role="tab" aria-selected={seg === "Projet"}>Projet</button>
            </div>
          )}
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
              {!qx && fblock ? <PointDuSoir dossier={canonDossier} cats={fblock.cats} items={fblock.items} onTicket={onTicket} /> : null}
              {seg !== "TMA" && (!qx || projetsShown.length > 0) && (<>
              <h3 className="c360-sec">Projets ({projetsShown.length})</h3>
              <div className="pf-tablewrap">
                <table className="proj-tbl pf-table">
                  <thead><tr><th>Projet</th><th>État</th><th>N°</th><th className="r">Budgété</th><th className="r">Facturé</th><th className="r">Reste</th><th>Avanc.</th></tr></thead>
                  <tbody>
                    {projetsShown.map((p, i) => {
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
              </>)}

              {(!qx || recentShown.length > 0) && (<>
              <div className="c360-sec-row">
                <h3 className="c360-sec" style={{ margin: 0 }}>Activité récente{hasBoth && seg !== "all" ? ` — ${seg}` : ""}</h3>
                {actSorted.length > 1 ? (
                  <select className="c360-sortsel" value={actSort} onChange={(e) => setActSort(e.target.value)} aria-label="Trier l'activité">
                    <option value="date">Plus récent</option>
                    <option value="statut">Par statut</option>
                    <option value="nom">Par personne</option>
                    <option value="cle">Par clé</option>
                  </select>
                ) : null}
              </div>
              {actSorted.length === 0 ? <p className="c360-empty">Aucun ticket pour ce client.</p> : (
                <ul className="c360-act">
                  {actSorted.map((i) => (
                    <li key={i.cle} onClick={() => onTicket && onTicket(i)} title="Ouvrir le ticket">
                      <span className="c360-act-k">{i.cle}</span>
                      <span className="c360-act-res">{progResume(i)}</span>
                      <span className={`pill ${CAT_PILL[i.categorie] || "todo"}`}>{CAT_LABEL[i.categorie] || i.statut}</span>
                      <span className="c360-act-meta">{i.dev && i.dev !== "Non assigné" ? i.dev + " · " : ""}{frDay(i.maj)}</span>
                    </li>
                  ))}
                </ul>
              )}
              </>)}

              {recetteShown.length > 0 && (<>
                <h3 className="c360-sec">Recette — en validation ({recetteShown.length})</h3>
                <ul className="c360-act">
                  {recetteShown.slice(0, 12).map((i) => (
                    <li key={i.cle} onClick={() => onTicket && onTicket(i)} title="Ouvrir le ticket">
                      <span className="c360-act-k">{i.cle}</span>
                      <span className="c360-act-res">{progResume(i)}</span>
                      <span className={`pill ${CAT_PILL[i.categorie] || "todo"}`}>{CAT_LABEL[i.categorie] || i.statut}</span>
                      <span className="c360-act-meta">{i.dev && i.dev !== "Non assigné" ? i.dev : ""}</span>
                    </li>
                  ))}
                </ul>
              </>)}

              {!qx && c.client === "EDL" ? <EdlMax /> : null}

              {!qx && ref && ref.domaines && ref.domaines.length > 0 ? (
                <>
                  <h3 className="c360-sec">Référentiel — {ref.nbProgrammes} programme{ref.nbProgrammes > 1 ? "s" : ""}</h3>
                  <ul className="c360-ref">
                    {ref.domaines.map((d) => (
                      <li key={d.code || d.domaine}>
                        <span className="c360-ref-dom">{d.libelle || d.domaine}{d.code ? ` (${d.code})` : ""}</span>
                        <span className="c360-ref-progs">
                          {(d.programmes || []).map((p) => (
                            <span key={p.nom} className={`c360-ref-prog ${p.lie ? "lie" : ""}`} title={p.lie ? "Lié à des tickets" : "Aucun ticket lié"}>{p.nom}</span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {(!qx || hygChecksShown.length > 0) && (<>
              <h3 className="c360-sec c360-sec-clk" onClick={() => setQualOpen((o) => !o)} role="button" aria-expanded={qualOpen || !!qx}>
                <span className={`c360-cv ${qualOpen || qx ? "o" : ""}`} aria-hidden="true">›</span>
                Qualité Jira{hygScore && hygScore.score != null ? ` — ${hygScore.score}%` : ""}
                {hyg && hygTotal ? <span className="c360-sec-badge">{hygTotal} à corriger</span> : null}
              </h3>
              {(qualOpen || qx) && (
                hyg == null ? <p className="c360-empty">Analyse en cours…</p>
                : hygChecksShown.length === 0 ? <p className="c360-empty">Aucune anomalie sur ce dossier 🎉</p>
                : (
                <ul className="c360-act">
                  {hygChecksShown.map((ch) => {
                    const o = openCheck === ch.id || !!qx;
                    return (
                      <li key={ch.id} className="c360-qrow">
                        <button type="button" className="c360-qhd" onClick={() => setOpenCheck(o ? null : ch.id)} title={ch.label}>
                          <span className="c360-act-k">{ch.tickets.length}</span>
                          <span className="c360-act-res">{ch.label}</span>
                          <span className="pill block">à corriger</span>
                          <span className={`c360-cv ${o ? "o" : ""}`} aria-hidden="true">›</span>
                        </button>
                        {o ? (
                          <ul className="c360-qtks">
                            {ch.tickets.map((t) => (
                              <li key={t.cle}>
                                <button type="button" className="c360-qtk" onClick={() => onTicket && onTicket(hygByKey[t.cle] || t)}>
                                  {t.flagged ? <span className="c360-qtk-flag">🚩</span> : null}
                                  <b className="c360-qtk-key">{t.cle}</b>
                                  <span className="c360-qtk-res">{progResume(t)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ))}
              </>)}

              {!qx && !mails.loading && mails.configured ? (
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
