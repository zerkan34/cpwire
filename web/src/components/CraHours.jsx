import React, { useMemo, useState, useEffect } from "react";
import { buildSimpleDoc, frDateFromIso } from "../utils.js";
import ExportBar from "./ExportBar.jsx";
import { esc } from "../utils.js";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DOW = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const storeKey = (y, m) => `cpwire:craHours:${y}-${String(m + 1).padStart(2, "0")}`;
const nf = (n) => Number(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ");

// Saisie manuelle des heures réellement effectuées, jour par jour, sur un mois.
// Indépendant du CRA Jira (qui agrège le temps loggé). Persistance locale (localStorage) par mois.
export default function CraHours({ basis = 7 }) {
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth()); // 0-11
  const [hours, setHours] = useState({});       // { "YYYY-MM-DD": number }

  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey(y, m)); setHours(raw ? JSON.parse(raw) : {}); }
    catch { setHours({}); }
  }, [y, m]);

  const persist = (next) => { setHours(next); try { localStorage.setItem(storeKey(y, m), JSON.stringify(next)); } catch { /* quota */ } };

  const days = useMemo(() => {
    const n = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(y, m, i + 1);
      const dow = (d.getDay() + 6) % 7; // 0 = lundi
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      const isToday = iso === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      return { day: i + 1, dow, weekend: dow >= 5, iso, isToday };
    });
  }, [y, m]); // eslint-disable-line

  const setH = (iso, v) => {
    let num = Number(String(v).replace(",", ".")) || 0;
    num = Math.max(0, Math.min(24, num));
    const next = { ...hours };
    if (num) next[iso] = num; else delete next[iso];
    persist(next);
  };
  const bump = (iso, delta) => setH(iso, (hours[iso] || 0) + delta);

  const total = useMemo(() => Object.values(hours).reduce((s, v) => s + (Number(v) || 0), 0), [hours]);
  const daysWorked = Object.keys(hours).length;
  const eqDays = basis ? total / basis : 0;

  const prevMonth = () => (m === 0 ? (setY(y - 1), setM(11)) : setM(m - 1));
  const nextMonth = () => (m === 11 ? (setY(y + 1), setM(0)) : setM(m + 1));

  const fill8 = () => { const next = { ...hours }; days.forEach((d) => { if (!d.weekend && !next[d.iso]) next[d.iso] = 8; }); persist(next); };
  const fillAll = (h) => { const next = { ...hours }; days.forEach((d) => { if (!d.weekend) next[d.iso] = h; }); persist(next); };
  const clearAll = () => { if (window.confirm(`Effacer toutes les heures de ${MONTHS[m]} ${y} ?`)) persist({}); };

  const buildHoursDoc = () => {
    const rowsHtml = days.map((d) => `<tr><td>${esc(DOW[d.dow])} ${d.day}</td><td>${esc(frDateFromIso(d.iso))}</td><td style="text-align:right">${d.weekend && !hours[d.iso] ? "—" : (hours[d.iso] != null ? String(hours[d.iso]).replace(".", ",") + " h" : "—")}</td></tr>`).join("");
    const body = `<p><b>Total du mois :</b> ${nf(total)} h · <b>${daysWorked} jour(s) saisi(s)</b> · \u2248 ${eqDays.toFixed(2)} j (base ${basis} h/j).</p>` +
      `<table><tr><th>Jour</th><th>Date</th><th>Heures</th></tr>${rowsHtml}<tr><td colspan="2"><b>Total</b></td><td style="text-align:right"><b>${nf(total)} h</b></td></tr></table>`;
    return buildSimpleDoc({
      kicker: "Heures déclarées",
      title: `Heures effectuées \u2014 ${MONTHS[m]} ${y}`,
      subtitle: "Saisie personnelle",
      cartouche: [["Personne", "Nicolas Durand"], ["Mois", `${MONTHS[m]} ${y}`], ["Total", `${nf(total)} h`], ["Base", `${basis} h/j`]],
      bodyHtml: body,
    });
  };

  const exportCsv = () => {
    const rows = [["Date", "Jour", "Heures"]];
    days.forEach((d) => rows.push([d.iso, DOW[d.dow], hours[d.iso] != null ? String(hours[d.iso]).replace(".", ",") : ""]));
    rows.push(["TOTAL", "", String(total).replace(".", ",")]);
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Heures_${y}-${String(m + 1).padStart(2, "0")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="panel cra-hours">
      <div className="filter-box-hd" style={{ borderRadius: "12px 12px 0 0" }}>Mes heures par jour — saisie perso</div>
      <div style={{ padding: 14 }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Saisis le nombre d'heures <b>réellement effectuées</b> chaque jour (8 h, 10 h…). Indépendant du temps loggé dans Jira. Enregistrement automatique sur cet appareil, mois par mois.
        </p>

        <div className="crh-nav">
          <button type="button" className="crh-arrow" onClick={prevMonth} aria-label="Mois précédent">‹</button>
          <span className="crh-month">{MONTHS[m]} {y}</span>
          <button type="button" className="crh-arrow" onClick={nextMonth} aria-label="Mois suivant">›</button>
        </div>

        <div className="crh-actions">
          <button type="button" className="btn-line" onClick={fill8}>Préremplir 8 h (jours ouvrés vides)</button>
          <button type="button" className="btn-line" onClick={() => fillAll(10)}>Tout à 10 h</button>
          <button type="button" className="btn-line" onClick={clearAll}>Tout effacer</button>
        </div>

        <div className="crh-grid">
          {days.map((d) => (
            <div key={d.iso} className={`crh-row${d.weekend ? " we" : ""}${d.isToday ? " today" : ""}${hours[d.iso] ? " filled" : ""}`}>
              <span className="crh-day">{DOW[d.dow]} {d.day}{d.isToday ? " · auj." : ""}</span>
              <div className="crh-stepper">
                <button type="button" onClick={() => bump(d.iso, -0.5)} aria-label="Retirer 30 min">−</button>
                <input type="number" inputMode="decimal" step="0.5" min="0" max="24"
                  value={hours[d.iso] ?? ""} placeholder="0"
                  onChange={(e) => setH(d.iso, e.target.value)} />
                <button type="button" onClick={() => bump(d.iso, 0.5)} aria-label="Ajouter 30 min">+</button>
                <span className="crh-h">h</span>
              </div>
            </div>
          ))}
        </div>

        <div className="crh-total">
          <span className="crh-total-l">Total du mois</span>
          <b className="crh-total-n">{nf(total)} h</b>
          <span className="crh-sub">{daysWorked} jour(s) saisi(s) · ≈ {eqDays.toFixed(2)} j (base {basis} h/j)</span>
        </div>

        <ExportBar buildHtml={buildHoursDoc} filename={`Heures_${y}-${String(m + 1).padStart(2, "0")}.html`} subject={`Heures effectuées — ${MONTHS[m]} ${y}`} />
        <button type="button" className="btn-line" onClick={exportCsv} style={{ width: "100%", marginTop: 8 }}>Export CSV (pour Excel)</button>
      </div>
    </div>
  );
}
