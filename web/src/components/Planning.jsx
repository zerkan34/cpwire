import React, { useState, useMemo, useRef } from "react";
import { parsePlanning } from "../planning.js";
import { buildSimpleDoc } from "../utils.js";
import ExportBar from "./ExportBar.jsx";

const ME = "Nicolas Durand";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function Planning() {
  const [data, setData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setErr(""); setFileName(f.name);
    try {
      const text = await f.text();
      const r = parsePlanning(text);
      if (!r.items.length) { setErr("Aucune ligne de planning reconnue. Vérifie qu'il s'agit bien d'un planning exporté en CSV."); setData(null); return; }
      setData(r);
    } catch (ex) { setErr("Lecture impossible : " + ex.message); setData(null); }
  };

  const stats = useMemo(() => {
    if (!data) return null;
    const imp = data.items.filter((i) => i.imperative);
    const slips = data.items.filter((i) => i.slip);
    const gate = data.items.find((i) => i.gate);
    const done = data.items.filter((i) => i.statusKind === "done").length;
    const block = data.items.filter((i) => i.statusKind === "block").length;
    return { imp, slips, gate, done, block, total: data.items.length };
  }, [data]);

  const buildDocHtml = () => {
    let body = "";
    if (stats) {
      body += `<p><b>${stats.total} jalon(s)</b> · ${stats.imp.length} date(s) impérative(s) · ${stats.slips.length} report(s) · ${stats.done} validé(s)${stats.block ? ` · <b style="color:#c0392b">${stats.block} bloquant(s)/KO</b>` : ""}${stats.gate ? ` · Go/No-Go : <b>${esc(stats.gate.status || "—")}</b>` : ""}.</p>`;
    }
    body += `<table><tr><th>Date prévue</th><th>Report</th><th>Fait le</th><th>Description</th><th>Statut</th></tr>` +
      data.items.map((it) => {
        const pill = it.statusKind ? `<span class="pill ${it.statusKind}">${esc(it.status)}</span>` : "—";
        const flags = [it.imperative ? "⚠ IMPÉRATIVE" : "", it.gate ? "Go/No-Go" : ""].filter(Boolean).join(" · ");
        const desc = `${flags ? `<b>${flags}</b> — ` : ""}${esc(it.title)}${it.detail ? `<br><i>${esc(it.detail)}</i>` : ""}${it.notes.length ? `<br><small>${esc(it.notes.join(" · "))}</small>` : ""}`;
        return `<tr><td>${esc(it.datePrevue || it.timeNote || "—")}</td><td>${esc(it.newDate || "")}</td><td>${esc(it.dateEffective || "")}</td><td>${desc}</td><td>${pill}</td></tr>`;
      }).join("") + `</table>`;
    return buildSimpleDoc({
      kicker: "Planning projet",
      title: data.title || "Planning",
      subtitle: "Vue consolidée — cp|WIRE",
      cartouche: [["Chef de projet", ME], ["Source", fileName || "Import"], ["Jalons", String(stats ? stats.total : 0)]],
      bodyHtml: body,
    });
  };

  return (
    <>
      <div className="panel pl-import">
        <div className="filter-box-hd" style={{ borderRadius: "12px 12px 0 0" }}>Importer un planning</div>
        <div style={{ padding: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Dépose le planning fourni par un client/partenaire (export <b>CSV</b>). cp|WIRE l'<b>analyse</b> et le réaffiche à la charte : jalons, statuts, <b>dates impératives</b>, retards, Go/No-Go — même si le fichier d'origine est mal structuré.
          </p>
          <button type="button" className="btn-solid" onClick={() => fileRef.current && fileRef.current.click()}>Choisir un fichier CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          {fileName && <span className="pl-file">📄 {fileName}</span>}
          {err && <p className="cn-err" style={{ marginTop: 10 }}>{err}</p>}
        </div>
      </div>

      {data && stats && (
        <>
          <div className="pl-summary">
            <div className="pl-kpi"><span className="pl-kpi-n">{stats.total}</span><span className="pl-kpi-l">jalons</span></div>
            <div className="pl-kpi imp"><span className="pl-kpi-n">{stats.imp.length}</span><span className="pl-kpi-l">dates impératives</span></div>
            <div className="pl-kpi slip"><span className="pl-kpi-n">{stats.slips.length}</span><span className="pl-kpi-l">reports</span></div>
            <div className="pl-kpi done"><span className="pl-kpi-n">{stats.done}</span><span className="pl-kpi-l">validés</span></div>
            {stats.block > 0 && <div className="pl-kpi block"><span className="pl-kpi-n">{stats.block}</span><span className="pl-kpi-l">bloquants / KO</span></div>}
          </div>

          {stats.gate && (
            <div className={`pl-gate ${stats.gate.statusKind === "block" ? "no" : "ok"}`}>
              <span className="pl-gate-k">Go / No-Go {stats.gate.datePrevue ? `· ${stats.gate.datePrevue}` : ""}</span>
              <span className="pl-gate-v">{stats.gate.status || "—"}</span>
            </div>
          )}

          <div className="section-title"><span>{data.title}</span></div>
          <div className="pl-list">
            {data.items.map((it, idx) => (
              <div key={idx} className={`pl-item${it.imperative ? " imp" : ""}${it.statusKind === "block" ? " block" : ""}`}>
                <div className="pl-when">
                  <span className="pl-date">{it.datePrevue || it.timeNote || "—"}</span>
                  {it.newDate && <span className="pl-slip">→ {it.newDate}</span>}
                  {it.dateEffective && <span className="pl-eff">✓ {it.dateEffective}</span>}
                </div>
                <div className="pl-body">
                  <div className="pl-titlerow">
                    {it.imperative && <span className="pl-flag imp">⚠ Date impérative</span>}
                    {it.gate && <span className="pl-flag gate">Go / No-Go</span>}
                    <span className="pl-title">{it.title}</span>
                  </div>
                  {it.detail && <div className="pl-detail">{it.detail}</div>}
                  {it.notes.map((n, i) => <div key={i} className="pl-note">— {n}</div>)}
                </div>
                {it.status && <span className={`pill ${it.statusKind}`}>{it.status}</span>}
              </div>
            ))}
          </div>

          <ExportBar buildHtml={buildDocHtml} filename={`Planning_${(data.title || "projet").replace(/\s+/g, "_")}.html`} subject={`Planning — ${data.title || "projet"}`} />
        </>
      )}
    </>
  );
}
