import React, { useState } from "react";
import { genTicketReport, pushTicket, explainTicket, fetchTicketActivity } from "../api.js";
import { frDate, esc, buildSimpleDoc, openExternal } from "../utils.js";
import { useModalBack, backOut } from "../modalNav.js";
import { useReadOnly } from "../readonly.js";
import ExportBar from "./ExportBar.jsx";
import { PILL } from "../groups.js";


function whenFmt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function ago(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime(); if (isNaN(t)) return "";
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24); if (d < 30) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
}
// Dernier évènement réel (changement statut/assigné OU saisie de temps) — pour « Dernière mise à jour ».
function lastEvent(activity) {
  if (!activity) return null;
  const tl = (activity.timeline && activity.timeline[0]) || null; // listes déjà triées du + récent au + ancien
  const wl = (activity.worklogs && activity.worklogs[0]) || null;
  const cand = [];
  if (tl) cand.push({ kind: "change", date: tl.date, who: tl.who, text: `${tl.champ} : ${tl.from} → ${tl.to}` });
  if (wl) cand.push({ kind: "time", date: wl.date, who: wl.who, text: `a saisi ${wl.time}${wl.comment ? ` — ${wl.comment}` : ""}` });
  if (!cand.length) return null;
  cand.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return cand[0];
}

export default function TicketModal({ ticket, onClose, onPushed }) {
  const [cmtTous, setCmtTous] = useState(false);   // fil replié à 4 commentaires par défaut
  const [note, setNote] = useState("");
  const [report, setReport] = useState("");
  const [markDone, setMarkDone] = useState(true);
  const [busy, setBusy] = useState("");
  const ro = useReadOnly();
  const [msg, setMsg] = useState(null);
  const [explication, setExplication] = useState("");
  const [explLoading, setExplLoading] = useState(false);
  const [activity, setActivity] = useState(null);
  const [actLoading, setActLoading] = useState(false);

  useModalBack(onClose);

  React.useEffect(() => {
    let alive = true;
    if (ticket?.cle && ticket.url && ticket.url !== "#") {
      setExplication(""); setExplLoading(true);
      explainTicket(ticket.cle)
        .then((r) => { if (alive) setExplication(r.explication); })
        .catch(() => { if (alive) setExplication(""); })
        .finally(() => { if (alive) setExplLoading(false); });

      setActivity(null); setActLoading(true);
      fetchTicketActivity(ticket.cle)
        .then((r) => { if (alive) setActivity(r); })
        .catch(() => { if (alive) setActivity(null); })
        .finally(() => { if (alive) setActLoading(false); });
    }
    return () => { alive = false; };
  }, [ticket?.cle]);

  if (!ticket) return null;

  const draft = async () => {
    setBusy("draft"); setMsg(null);
    try { const { text } = await genTicketReport(ticket.cle, note, ticket.resume); setReport(text); }
    catch (e) {
      console.error("[TicketModal]", e && e.message ? e.message : e); setMsg({ type: "warn", text: e.message }); }
    finally { setBusy(""); }
  };

  const push = async () => {
    if (!report.trim()) { setMsg({ type: "warn", text: "Rédige d'abord le rapport." }); return; }
    if (!window.confirm(`Envoyer ce rapport dans Jira sur ${ticket.cle}${markDone ? " et passer le ticket à « Terminé »" : ""} ?`)) return;
    setBusy("push"); setMsg(null);
    try {
      const r = await pushTicket(ticket.cle, report, markDone);
      setMsg({ type: "ok", text: r.simulated ? "Mode démo : envoi simulé et journalisé." : `Envoyé dans Jira${r.transition?.applied ? " · statut : " + r.transition.applied : ""}.` });
      onPushed && onPushed();
    } catch (e) {
      console.error("[TicketModal]", e && e.message ? e.message : e); setMsg({ type: "warn", text: e.message }); }
    finally { setBusy(""); }
  };

  const hasActivity = activity && ((activity.worklogs && activity.worklogs.length) || (activity.timeline && activity.timeline.length) || (activity.comments && activity.comments.length));

  const buildTicketHtml = () => {
    const cartouche = [
      ["Clé", ticket.cle],
      ["Client / dossier", `${ticket.dossier} — équipe Armonie`],
      ["Chef de projet", "Nicolas Durand"],
      ["Statut", `${ticket.statut}${ticket.flagged ? " · 🚩 flaggé" : ""}${ticket.enRetard ? " · en retard" : ""}`],
      ["Assigné", ticket.assigne],
      ["Priorité", ticket.priorite || "—"],
      ["Échéance", ticket.echeance || "—"],
    ];
    let body = "";
    if (explication) body += `<h2>Explication</h2><p>${esc(explication)}</p>`;
    if (note) body += `<h2>Note du chef de projet</h2><p>${esc(note)}</p>`;
    if (report) body += `<h2>Rapport</h2><p>${esc(report).replace(/\n/g, "<br>")}</p>`;
    if (activity?.comments?.length) {
      // Les commentaires partent aussi dans le document : c'est souvent la seule trace
      // écrite de ce que le client a demandé. Les commentaires à visibilité restreinte
      // sont signalés, pour qu'on ne les lise pas par mégarde en réunion client.
      body += `<h2>Commentaires</h2>` +
        activity.comments.map((c) =>
          `<p><b>${esc(c.who)}</b> <span class="muted">${esc(whenFmt(c.date))}` +
          `${c.restreint ? " · interne" : ""}</span><br>` +
          `${esc(c.texte).replace(/\n/g, "<br>")}${c.tronque ? " […]" : ""}</p>`
        ).join("");
    }
    if (activity?.timeline?.length) {
      body += `<h2>Historique des changements</h2>` +
        `<table><tr><th>Quand</th><th>Qui</th><th>Action</th></tr>` +
        activity.timeline.map((t) => `<tr><td>${esc(whenFmt(t.date))}</td><td>${esc(t.who)}</td><td>${esc(t.champ)} : ${esc(t.from)} → <b>${esc(t.to)}</b></td></tr>`).join("") + `</table>`;
    }
    if (activity?.worklogs?.length) {
      body += `<h2>Temps saisi${activity.totalSeconds > 0 ? ` — total ${esc(activity.totalTime)}` : ""}</h2>` +
        `<table><tr><th>Quand</th><th>Qui</th><th>Durée &amp; détail</th></tr>` +
        activity.worklogs.map((w) => `<tr><td>${esc(whenFmt(w.date))}</td><td>${esc(w.who)}</td><td><b>${esc(w.time)}</b>${w.comment ? ` — ${esc(w.comment)}` : ""}</td></tr>`).join("") + `</table>`;
    }
    if (!body) body = "<p class='muted'>Aucun détail complémentaire pour ce ticket.</p>";
    return buildSimpleDoc({ kicker: "Fiche ticket", title: `${ticket.cle} — ${ticket.resume}`, cartouche, bodyHtml: body });
  };

  return (
    <div className="overlay" onClick={backOut}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <button className="modal-back" onClick={backOut} title="Retour">←</button>
          <button className="x" onClick={backOut}>×</button>
          <div className="k">{ticket.cle}{ticket.mine ? "  ·  pour moi" : ""}</div>
          <h3>{ticket.resume}</h3>
        </div>
        <div className="modal-bd">
          <div className="meta-grid">
            <div className="cell"><div className="l">Dossier</div><div className="v">{ticket.dossier}</div></div>
            <div className="cell"><div className="l">Statut</div><div className="v"><span className={`pill ${PILL[ticket.statut]}`}>{ticket.statut}</span>{ticket.flagged ? <span className="flag-badge">🚩 FLAGGÉ</span> : null}{ticket.enRetard ? <span className="late"> · en retard</span> : null}</div></div>
            <div className="cell"><div className="l">Assigné</div><div className="v">{ticket.assigne}</div></div>
            <div className="cell"><div className="l">Priorité</div><div className="v">{ticket.priorite || "—"}</div></div>
            <div className="cell"><div className="l">Échéance</div><div className="v">{ticket.echeance || "—"}</div></div>
            <div className="cell"><div className="l">Mise à jour</div><div className="v">{frDate(ticket.maj)}</div></div>
          </div>

          {ticket.url && ticket.url !== "#" && (
            <a className="jira-link" href={ticket.url} target="_blank" rel="noreferrer"
              onClick={(e) => { if (typeof window !== "undefined" && window.__TAURI__) { e.preventDefault(); openExternal(ticket.url); } }}>Ouvrir le ticket dans Jira ↗</a>
          )}

          {ticket.prog && (ticket.prog.found ? (
            <div className="prog-loc">
              <div className="prog-h">📦 Programme localisé</div>
              <div className="prog-grid">
                <div className="pl-cell"><span className="pl-l">Programme</span><span className="pl-v mono">{ticket.prog.name}</span></div>
                <div className="pl-cell"><span className="pl-l">Bibliothèque</span><span className="pl-v mono">{ticket.prog.lib || "—"}</span></div>
                <div className="pl-cell"><span className="pl-l">Source</span><span className="pl-v mono">{(ticket.prog.srcFile ? ticket.prog.srcFile + "/" : "") + (ticket.prog.srcMember || "—")}</span></div>
                <div className="pl-cell"><span className="pl-l">Type</span><span className="pl-v">{ticket.prog.type || "—"}</span></div>
                {ticket.prog.version ? <div className="pl-cell"><span className="pl-l">Version</span><span className="pl-v">{ticket.prog.version}</span></div> : null}
                {ticket.prog.compile ? <div className="pl-cell"><span className="pl-l">Dernière compil</span><span className="pl-v">{ticket.prog.compile}</span></div> : null}
              </div>
              <p className="prog-src">Source : référentiel Arcad importé dans cp|WIRE.</p>
            </div>
          ) : (
            <div className="prog-loc nf">
              <div className="prog-h">📦 Programme <span className="mono">{ticket.prog.name}</span></div>
              <p className="prog-src">Localisation non référencée — à compléter dans l'annuaire Arcad (bibliothèque, membre source).</p>
            </div>
          ))}

          <ExportBar buildHtml={buildTicketHtml} filename={`${ticket.cle}.html`} subject={`${ticket.cle} — ${ticket.resume}`} />

          <div className="expl">
            <div className="expl-h">Explication simple</div>
            {explLoading ? (
              <p className="hint">Analyse du ticket en cours…</p>
            ) : explication ? (
              <p>{explication}</p>
            ) : (
              <p className="hint">Disponible une fois connecté à Jira (et avec la clé IA pour une explication détaillée).</p>
            )}
          </div>

          {/* Historique & temps : qui a fait quoi, quand, et heures saisies */}
          <div className="expl">
            <div className="expl-h">Historique &amp; temps</div>
            <p className="hint" style={{ marginTop: -2 }}>
              Tout ce qui a bougé sur <b>ce ticket précis</b> dans Jira : changements de statut et de personne assignée (qui l'a pris, à qui il a été passé), et le temps saisi par chacun. C'est la trace réelle des intervenants et de leurs actions.
            </p>
            {actLoading ? (
              <p className="hint">Chargement de l'historique…</p>
            ) : !hasActivity ? (
              <p className="act-empty">Aucun historique ni temps saisi pour ce ticket (ou Jira non connecté).</p>
            ) : (
              <>
                {(() => {
                  const le = lastEvent(activity);
                  return le ? (
                    <div className="last-update">
                      <div className="lu-tag">Dernière mise à jour</div>
                      <div className="lu-body"><span className="lu-who">{le.who}</span>{le.kind === "change" ? <span className="lu-sep"> · </span> : " "}{le.text}</div>
                      <div className="lu-when">{whenFmt(le.date)} · {ago(le.date)}</div>
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const st = (activity.timeline || []).filter((t) => t.champ === "Statut").slice().reverse(); // chrono : ancien → récent
                  if (st.length < 1) return null;
                  const steps = [{ name: st[0].from || "?", at: st[0]?.date || null }];
                  st.forEach((t) => steps.push({ name: t.to || "?", at: t.date, who: t.who, from: t.from }));
                  for (let i = 0; i < steps.length; i++) {
                    const start = steps[i].at;
                    const end = i < steps.length - 1 ? steps[i + 1].at : Date.now();
                    steps[i].days = start ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000)) : null;
                  }
                  const retours = st.filter((t) => /retour/i.test(t.to || "")).map((t) => ({ from: t.from || "?", date: t.date, who: t.who }));
                  const hasRetour = retours.length > 0;
                  return (
                    <div className="status-chain">
                      <div className="sc-h">Chaîne de statuts {hasRetour ? <span className="sc-flag">↩ {retours.length} retour{retours.length > 1 ? "s" : ""}</span> : null}</div>
                      <div className="sc-path">
                        {steps.map((s, i) => (
                          <span key={i} className="sc-seg">
                            {i > 0 ? <span className="sc-arrow">→</span> : null}
                            <span className={`sc-step${/retour/i.test(s.name) ? " is-retour" : ""}${i === steps.length - 1 ? " is-now" : ""}`}>
                              {s.name}{s.days != null ? <span className="sc-dur">{s.days} j</span> : null}
                            </span>
                          </span>
                        ))}
                      </div>
                      {hasRetour && (
                        <div className="sc-clues">
                          <div className="scc-h">Où ça a coincé</div>
                          {retours.map((r, i) => (
                            <div className="scc-line" key={i}>
                              <span className="scc-dot">↩</span> Rejeté depuis <b>{r.from}</b>{r.who && r.who !== "—" ? <> par {r.who}</> : null}{r.date ? <> · {whenFmt(r.date)}</> : null}
                            </div>
                          ))}
                          <div className="scc-tip">Astuce : regarde l'historique et le temps saisi ci-dessous autour de ces dates pour comprendre la cause du retour.</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {activity.comments && activity.comments.length > 0 && (
                  <>
                    {/* Le fil de commentaires vient AVANT l'historique : l'historique dit
                        quand un ticket a bougé, les commentaires disent pourquoi. C'est
                        cette raison qu'on cherche en ouvrant une fiche. */}
                    <div className="act-sub">
                      Commentaires <span className="act-n">{activity.comments.length}</span>
                    </div>
                    <ul className="cmt-list">
                      {(cmtTous ? activity.comments : activity.comments.slice(0, 4)).map((c) => (
                        <li key={c.id} className="cmt">
                          <div className="cmt-h">
                            <b className="cmt-who">{c.who}</b>
                            <span className="cmt-when">{whenFmt(c.date)}</span>
                            {c.modifie && <span className="cmt-edit" title={`Modifié le ${whenFmt(c.modifie)}`}>modifié</span>}
                            {c.restreint && <span className="cmt-priv" title="Visibilité restreinte dans Jira">interne</span>}
                          </div>
                          <div className="cmt-txt">{c.texte}{c.tronque ? " […]" : ""}</div>
                        </li>
                      ))}
                    </ul>
                    {activity.comments.length > 4 && (
                      <button type="button" className="cmt-more" onClick={() => setCmtTous((v) => !v)}>
                        {cmtTous ? "Réduire" : `Voir les ${activity.comments.length} commentaires`}
                      </button>
                    )}
                  </>
                )}
                {activity.timeline && activity.timeline.length > 0 && (
                  <>
                    <div className="act-sub">Historique des changements</div>
                    <table className="cpw-tbl act-tbl">
                      <thead><tr><th className="c-when">Quand</th><th className="c-who">Qui</th><th>Action</th></tr></thead>
                      <tbody>
                        {activity.timeline.map((t, k) => (
                          <tr key={k}>
                            <td className="c-when">{whenFmt(t.date)}</td>
                            <td className="c-who">{t.who}</td>
                            <td className="c-act"><span className="chg-field">{t.champ}</span> <span className="chg-from">{t.from || "—"}</span><span className="chg-arrow">→</span><span className="chg-to">{t.to || "—"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {activity.worklogs && activity.worklogs.length > 0 && (
                  <>
                    <div className="act-sub">Temps saisi{activity.totalSeconds > 0 ? ` — total ${activity.totalTime}` : ""}</div>
                    <table className="cpw-tbl act-tbl">
                      <thead><tr><th className="c-when">Quand</th><th className="c-who">Qui</th><th>Durée &amp; détail</th></tr></thead>
                      <tbody>
                        {activity.worklogs.map((w, k) => (
                          <tr key={k}>
                            <td className="c-when">{whenFmt(w.date)}</td>
                            <td className="c-who">{w.who}</td>
                            <td className="c-act"><b>{w.time}</b>{w.comment ? ` — ${w.comment}` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </div>

          <div className="field">
            <label>Ce que j'ai fait (note rapide)</label>
            <textarea className="ta" style={{ minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. Développement terminé, testé en recette, livré." />
          </div>

          <div className="row-actions">
            <button className="btn-line" onClick={draft} disabled={busy === "draft"}>
              {busy === "draft" ? "Rédaction…" : "Rédiger le rapport (IA)"}
            </button>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Rapport (modifiable avant envoi)</label>
            <textarea className="ta" value={report} onChange={(e) => setReport(e.target.value)}
              placeholder="Le rapport généré apparaît ici — ajuste-le librement." />
          </div>

          {!ro && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, margin: "4px 0 10px" }}>
              <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} />
              Marquer le ticket comme « Terminé » dans Jira
            </label>
          )}

          <div className="row-actions">
            {!ro && (
              <button className="btn-solid gold" onClick={push} disabled={busy === "push"}>
                {busy === "push" ? "Envoi…" : "Envoyer dans Jira"}
              </button>
            )}
            <button className="btn-line" onClick={backOut}>Fermer</button>
          </div>

          {msg && <div className={msg.type === "ok" ? "ok-note" : "warn-note"}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}
