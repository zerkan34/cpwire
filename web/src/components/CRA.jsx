import React, { useMemo, useState, useRef } from "react";
import { fetchCRA, importCRA } from "../api.js";
import { buildSimpleDoc, esc } from "../utils.js";
import ExportBar from "./ExportBar.jsx";

const ME = "Nicolas Durand";
function pillCls(s) { return s === "Bloqué" ? "block" : s === "En cours" ? "prog" : s === "Terminé" ? "done" : "todo"; }
const iso = (d) => d.toISOString().slice(0, 10);
function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function presets() {
  const today = new Date();
  const sow = startOfWeek(today); const eow = new Date(sow); eow.setDate(sow.getDate() + 6);
  const lws = new Date(sow); lws.setDate(sow.getDate() - 7); const lwe = new Date(sow); lwe.setDate(sow.getDate() - 1);
  const som = new Date(today.getFullYear(), today.getMonth(), 1); const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const lms = new Date(today.getFullYear(), today.getMonth() - 1, 1); const lme = new Date(today.getFullYear(), today.getMonth(), 0);
  const d7 = new Date(today); d7.setDate(today.getDate() - 6);
  return {
    week: { label: "Cette semaine", start: iso(sow), end: iso(eow) },
    lastweek: { label: "Semaine dernière", start: iso(lws), end: iso(lwe) },
    month: { label: "Ce mois", start: iso(som), end: iso(eom) },
    lastmonth: { label: "Mois dernier", start: iso(lms), end: iso(lme) },
    last7: { label: "7 derniers jours", start: iso(d7), end: iso(today) },
  };
}
const frDate = (s) => { try { return new Date(s + "T00:00:00").toLocaleDateString("fr-FR"); } catch { return s; } };
const hDec = (sec) => (sec / 3600);

export default function CRA({ onTicket }) {
  const PRE = useMemo(presets, []);
  const [presetId, setPresetId] = useState("week");
  const [start, setStart] = useState(PRE.week.start);
  const [end, setEnd] = useState(PRE.week.end);
  const [basis, setBasis] = useState(7); // heures par jour pour l'équivalent jours
  const [person, setPerson] = useState("Tous");
  const [cra, setCra] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const applyPreset = (id) => { setPresetId(id); if (PRE[id]) { setStart(PRE[id].start); setEnd(PRE[id].end); } };

  const fileRef = useRef(null);
  const onImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (e.target) e.target.value = ""; // permet de réimporter le même fichier
    if (!file) return;
    setBusy(true); setErr(""); setCra(null);
    try {
      const r = await importCRA(file, basis);
      setCra(r); setPerson("Tous");
    } catch (er) { setErr(String(er.message || er)); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    if (!start || !end || start > end) { setErr("Choisis une période valide (début avant fin)."); return; }
    setBusy(true); setErr(""); setCra(null);
    try {
      const r = await fetchCRA(start, end);
      if (r && r.configured === false) { setErr("Jira n'est pas connecté côté serveur — aucun temps à consolider."); }
      else { setCra(r); setPerson("Tous"); }
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  // Vue filtrée par périmètre (Tous ou une personne)
  const view = useMemo(() => {
    if (!cra) return null;
    if (person === "Tous") {
      return { total: cra.totalSeconds, projects: cra.byProject, persons: cra.byPerson };
    }
    const P = (cra.byPerson || []).find((p) => p.who === person);
    return { total: P ? P.seconds : 0, projects: P ? P.projects : [], persons: null };
  }, [cra, person]);

  // Réalisations : tickets travaillés dans le périmètre (dédoublonnés)
  const realisations = useMemo(() => {
    if (!view) return [];
    const m = {};
    view.projects.forEach((pr) => (pr.tickets || []).forEach((t) => {
      const cur = m[t.cle] || { cle: t.cle, resume: t.resume, statut: t.statut, statutJira: t.statutJira, done: t.done, dossier: pr.dossier, seconds: 0 };
      cur.seconds += t.seconds;
      m[t.cle] = cur;
    }));
    return Object.values(m).sort((a, b) => b.seconds - a.seconds);
  }, [view]);

  const fmtH = (sec) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m ? `${h}h ${String(m).padStart(2, "0")}` : `${h}h`; };
  const totalSec = view ? view.total : 0;
  const nbDone = realisations.filter((r) => r.done).length;

  // ---- Export PDF (charte Armonie) ----
  const buildDocHtml = () => {
    const part = totalSec ? (s) => `${Math.round((s / totalSec) * 100)}%` : () => "—";
    let body = "";
    body += `<p><b>Total saisi :</b> ${fmtH(totalSec)} · <b>≈ ${hDec(totalSec).toFixed(1)} h</b> · <b>${(totalSec / 3600 / basis).toFixed(2)} j</b> (base ${basis} h/j) · ${view.projects.length} projet(s) · ${realisations.length} ticket(s) dont ${nbDone} terminé(s).</p>`;
    body += `<h2>Temps par projet</h2><table><tr><th>Projet</th><th>Temps</th><th>Heures</th><th>Part</th><th>Tickets</th><th>Terminés</th></tr>` +
      view.projects.map((pr) => {
        const done = (pr.tickets || []).filter((t) => t.done).length;
        return `<tr><td><b>${esc(pr.dossier)}</b></td><td>${esc(pr.time)}</td><td>${hDec(pr.seconds).toFixed(2)}</td><td>${part(pr.seconds)}</td><td>${(pr.tickets || []).length}</td><td>${done}</td></tr>`;
      }).join("") +
      `<tr><td><b>Total</b></td><td><b>${fmtH(totalSec)}</b></td><td><b>${hDec(totalSec).toFixed(2)}</b></td><td>100%</td><td>${realisations.length}</td><td>${nbDone}</td></tr></table>`;

    if (person === "Tous" && view.persons && view.persons.length) {
      body += `<h2>Détail par personne</h2><table><tr><th>Personne</th><th>Temps</th><th>Heures</th><th>Part</th><th>Projets</th></tr>` +
        view.persons.map((p) => `<tr><td>${esc(p.who)}</td><td>${esc(p.time)}</td><td>${hDec(p.seconds).toFixed(2)}</td><td>${part(p.seconds)}</td><td>${esc(p.projects.map((pr) => `${pr.dossier} (${pr.time})`).join(", "))}</td></tr>`).join("") +
        `</table>`;
    }

    body += `<h2>Réalisations de la période</h2><table><tr><th>Clé</th><th>Projet</th><th>Résumé</th><th>Temps</th><th>Statut</th></tr>` +
      realisations.map((r) => `<tr><td>${esc(r.cle)}</td><td>${esc(r.dossier)}</td><td>${esc(r.resume)}</td><td>${fmtH(r.seconds)}</td><td><span class="pill ${pillCls(r.statut)}">${esc(r.statutJira || r.statut)}</span></td></tr>`).join("") +
      `</table>`;

    return buildSimpleDoc({
      kicker: "Compte rendu d'activité",
      title: `CRA — ${frDate(start)} au ${frDate(end)}`,
      subtitle: person === "Tous" ? "Tous les intervenants" : person,
      cartouche: [
        ["Chef de projet", ME],
        ["Période", `${frDate(start)} → ${frDate(end)}`],
        ["Périmètre", person === "Tous" ? "Tous les intervenants" : person],
        ["Source", cra && cra.source === "excel" ? "Fichier Excel importé" : "Temps saisis dans Jira"],
      ],
      bodyHtml: body,
    });
  };

  // ---- Export CSV (consolidation Projet × Personne pour Excel) ----
  const downloadCsv = () => {
    const rows = [["Projet", "Personne", "Temps (h:m)", "Heures (décimal)"]];
    if (person === "Tous") {
      view.projects.forEach((pr) => {
        // reconstitue le temps par personne sur ce projet via cra.byProject.persons
        const src = (cra.byProject.find((x) => x.dossier === pr.dossier) || {}).persons || [];
        src.forEach((pp) => rows.push([pr.dossier, pp.who, pp.time, hDec(pp.seconds).toFixed(2)]));
      });
    } else {
      view.projects.forEach((pr) => rows.push([pr.dossier, person, pr.time, hDec(pr.seconds).toFixed(2)]));
    }
    rows.push(["TOTAL", person === "Tous" ? "(tous)" : person, fmtH(totalSec), hDec(totalSec).toFixed(2)]);
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `CRA_${start}_${end}${person === "Tous" ? "" : "_" + person.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <>
      <div className="section-title">CRA — Compte rendu d'activité
        <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
          {" "}— consolide les temps saisis dans Jira : quoi, sur quel projet, combien de temps.
        </span>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Choisis une période et un périmètre, puis « Générer » : le CRA agrège le <b>temps réellement saisi dans Jira</b> par projet et par personne. Pas de temps dans Jira ? Clique <b>« Importer un Excel »</b> pour construire le CRA depuis un fichier (colonnes reconnues : <i>Projet/Dossier, Intervenant, Clé, Résumé, Temps (ou Heures/Durée/Jours), Statut</i> — l'ordre et les libellés exacts n'ont pas d'importance).
      </p>

      <div className="panel">
        <div className="filter-box-hd" style={{ borderRadius: "12px 12px 0 0" }}>Période &amp; périmètre</div>
        <div style={{ padding: 14 }}>
          <div className="filters" style={{ marginBottom: 10 }}>
            {Object.entries(PRE).map(([id, p]) => (
              <button key={id} className={`fbtn ${presetId === id ? "active" : ""}`} onClick={() => applyPreset(id)}>{p.label}</button>
            ))}
          </div>
          <div className="cra-form">
            <label>Du <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPresetId("custom"); }} /></label>
            <label>au <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPresetId("custom"); }} /></label>
            <label>Base <select value={basis} onChange={(e) => setBasis(Number(e.target.value))}>
              <option value={7}>7 h/j</option><option value={7.5}>7,5 h/j</option><option value={8}>8 h/j</option>
            </select></label>
            <button className="btn-solid" onClick={generate} disabled={busy}>{busy ? "Consolidation…" : "Générer le CRA"}</button>
            <button className="btn-line" type="button" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} title="Construire le CRA à partir d'un fichier Excel ou CSV exporté (Jira, tableur, etc.)">Importer un Excel</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onImportFile} />
          </div>
          {busy && <p className="hint" style={{ margin: "8px 0 0" }}>Lecture des temps saisis dans Jira sur la période… (peut prendre quelques secondes selon le volume)</p>}
          {err && <p className="eb-err" style={{ marginTop: 8 }}>{err}</p>}
        </div>
      </div>

      {cra && view && (
        <>
          {totalSec === 0 ? (
            <div className="panel empty" style={{ marginTop: 16 }}>
              Aucun temps saisi dans Jira sur cette période{cra.total ? ` (${cra.total} ticket(s) consultés)` : ""}. Un CRA n'affiche que ce qui a été réellement enregistré dans les worklogs Jira.
            </div>
          ) : (
            <>
              <div className="cra-kpi-row" style={{ marginTop: 16 }}>
                <div className="cra-kpi"><span className="cra-kpi-n">{fmtH(totalSec)}</span><span className="cra-kpi-l">temps saisi</span></div>
                <div className="cra-kpi"><span className="cra-kpi-n">{(totalSec / 3600 / basis).toFixed(2)}</span><span className="cra-kpi-l">jours (base {basis} h)</span></div>
                <div className="cra-kpi"><span className="cra-kpi-n">{view.projects.length}</span><span className="cra-kpi-l">projet(s)</span></div>
                <div className="cra-kpi"><span className="cra-kpi-n">{realisations.length}</span><span className="cra-kpi-l">ticket(s) · {nbDone} terminé(s)</span></div>
              </div>

              <div className="filters" style={{ margin: "14px 0 4px", alignItems: "center" }}>
                <span className="fg-lbl">Périmètre</span>
                <select className="fselect" value={person} onChange={(e) => setPerson(e.target.value)}>
                  <option value="Tous">Tous les intervenants</option>
                  {(cra.byPerson || []).some((p) => p.who === ME) && <option value={ME}>Moi ({ME})</option>}
                  {(cra.byPerson || []).map((p) => p.who).filter((w) => w !== ME).map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
                <span className="hint" style={{ margin: 0 }}>{frDate(start)} → {frDate(end)}{cra.capped ? ` · ⚠ ${cra.scanned}/${cra.total} tickets analysés (volume plafonné)` : ""}</span>
              </div>

              <div className="cra-card">
                <div className="cra-card-h">Temps par projet</div>
                <table className="fiche-tbl cra-tbl">
                  <thead><tr><th>Projet</th><th className="num">Temps</th><th className="num">Part</th><th className="num">Tickets</th><th className="num">Terminés</th></tr></thead>
                  <tbody>
                    {view.projects.map((pr) => {
                      const done = (pr.tickets || []).filter((t) => t.done).length;
                      const pct = totalSec ? Math.round((pr.seconds / totalSec) * 100) : 0;
                      return (
                        <tr key={pr.dossier}>
                          <td><b>{pr.dossier}</b></td>
                          <td className="num">{pr.time}</td>
                          <td className="num"><span className="cra-bar"><span style={{ width: `${pct}%` }} /></span>{pct}%</td>
                          <td className="num">{(pr.tickets || []).length}</td>
                          <td className="num">{done}</td>
                        </tr>
                      );
                    })}
                    <tr className="cra-total"><td><b>Total</b></td><td className="num"><b>{fmtH(totalSec)}</b></td><td className="num">100%</td><td className="num">{realisations.length}</td><td className="num">{nbDone}</td></tr>
                  </tbody>
                </table>
              </div>

              {person === "Tous" && view.persons && view.persons.length > 0 && (
                <div className="cra-card">
                  <div className="cra-card-h">Détail par personne</div>
                  <table className="fiche-tbl cra-tbl">
                    <thead><tr><th>Personne</th><th className="num">Temps</th><th className="num">Part</th><th>Projets</th></tr></thead>
                    <tbody>
                      {view.persons.map((p) => {
                        const pct = totalSec ? Math.round((p.seconds / totalSec) * 100) : 0;
                        return (
                          <tr key={p.who}>
                            <td>{p.who}</td>
                            <td className="num">{p.time}</td>
                            <td className="num">{pct}%</td>
                            <td className="cra-proj">{p.projects.map((pr) => <span key={pr.dossier} className="tag">{pr.dossier} · {pr.time}</span>)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="cra-card">
                <div className="cra-card-h">Réalisations de la période <span className="cra-card-meta">ce qui a été fait, par ticket</span></div>
                <table className="fiche-tbl cra-tbl">
                  <thead><tr><th>Clé</th><th>Projet</th><th>Résumé</th><th className="num">Temps</th><th>Statut</th></tr></thead>
                  <tbody>
                    {realisations.map((r) => (
                      <tr key={r.cle} className="clk" onClick={() => onTicket && onTicket({ cle: r.cle, resume: r.resume, statut: r.statut, statutJira: r.statutJira, dossier: r.dossier })}>
                        <td><span className="k">{r.cle}</span></td>
                        <td><span className="tag">{r.dossier}</span></td>
                        <td>{r.resume}</td>
                        <td className="num">{fmtH(r.seconds)}</td>
                        <td><span className={`pill ${pillCls(r.statut)}`}>{r.statutJira || r.statut}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row-actions" style={{ marginTop: 12, gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-line sm" onClick={downloadCsv} title="Télécharger un CSV (s'ouvre dans Excel) — temps par projet et par personne">⬇ CSV pour Excel</button>
                <ExportBar buildHtml={buildDocHtml} filename={`CRA_${start}_${end}.html`} subject={`CRA — ${frDate(start)} au ${frDate(end)}`} />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
