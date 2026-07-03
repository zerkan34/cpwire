import React, { useEffect, useState, useMemo } from "react";
import { progResume } from "../ticket.js";
import { pointBaseline } from "../api.js";
import { charterDoc, cover } from "../charter.js";
import { printHtml } from "../utils.js";

// « Le point du soir » — reproduit le relevé quotidien par statut (mêmes libellés
// que le mail de la direction), avec les écarts vs le dernier relevé d'un jour
// antérieur. Les chiffres viennent de computeFacts (cats atomiques) → toujours vrais.
// L'historique jour-à-jour est désormais mémorisé CÔTÉ SERVEUR (partagé entre
// navigateurs, persistant, insensible au « Clear PWA cache ») : les écarts
// apparaissent dès qu'au moins deux jours distincts ont été relevés. Le localStorage
// reste en repli si l'endpoint serveur est indisponible (hors-ligne, version
// serveur antérieure).
const ROWS = [
  ["miseEnProd", "Mise en production"],
  ["termine", "Terminé"],
  ["recetteClient", "Recette client"],
  ["recetteArmonie", "Recette Armonie"],
  ["encours", "En cours"],
  ["retourTest", "Retour de test"],
  ["attenteClient", "En attente client"],
];
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDelta = (d) => (d == null ? "·" : d === 0 ? "(=)" : d > 0 ? `(+${d})` : `(${d})`);
const CAT_FR = { afaire: "À faire", encours: "En cours", retourTest: "Retour de test", retourProd: "Retour prod", recetteArmonie: "Recette Armonie", recetteClient: "Recette client", attenteClient: "En attente client", miseEnProd: "Mise en production", termine: "Terminé", annule: "Annulé" };

export default function PointDuSoir({ dossier, cats, items = [], onTicket }) {
  const cats0 = cats || {};
  const [localBaseline, setLocalBaseline] = useState(null); // repli : historique localStorage (par navigateur)
  const [serverBaseline, setServerBaseline] = useState(null); // source primaire : historique serveur (partagé)
  const [copied, setCopied] = useState(false);
  const [openK, setOpenK] = useState(null);
  const [period, setPeriod] = useState("tout");
  // Périmètre : pour un dossier multi-projets (ex. Tafanel = PTAF + TMT), on peut isoler un préfixe.
  const [scope, setScope] = useState("all");
  const prefixes = useMemo(() => [...new Set((items || []).map((i) => i.projet).filter(Boolean))].sort(), [items]);
  const multi = prefixes.length > 1;
  useEffect(() => { setScope("all"); }, [dossier]);
  const srcItems = (scope === "all" || !multi) ? (items || []) : (items || []).filter((i) => i.projet === scope);
  const scopeKey = scope === "all" ? "" : `::${scope}`;
  const scopeLbl = scope === "all" ? prefixes.join(" + ") : scope;

  useEffect(() => {
    if (!dossier) return;
    const key = `cpwire:point:${dossier}${scopeKey}`;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {
      console.error("[PointDuSoir]", e && e.message ? e.message : e); store = {}; }
    const today = todayStr();
    const past = Object.keys(store).filter((d) => d < today).sort();
    setLocalBaseline(past.length ? { date: past[past.length - 1], cats: store[past[past.length - 1]] } : null);
    const curKeys = {}; ROWS.forEach(([k]) => { curKeys[k] = []; });
    (srcItems || []).forEach((i) => { if (curKeys[i.categorie]) curKeys[i.categorie].push(i.cle); });
    store[today] = curKeys;
    const keep = Object.keys(store).sort().slice(-14);
    const trimmed = {}; keep.forEach((d) => { trimmed[d] = store[d]; });
    try { localStorage.setItem(key, JSON.stringify(trimmed)); } catch (e) { /* quota / privé : on ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier, scope]);

  // Baseline SERVEUR (partagée, persistante) — source primaire des écarts.
  // En cas d'indisponibilité (hors-ligne, serveur antérieur), on retombe sur le localStorage.
  useEffect(() => {
    if (!dossier) { setServerBaseline(null); return; }
    let on = true;
    setServerBaseline(null);
    pointBaseline(dossier, scopeKey)
      .then((r) => { if (on) setServerBaseline(r && r.baseline ? r.baseline : null); })
      .catch(() => { if (on) setServerBaseline(null); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier, scope]);

  // Effective : le serveur prime ; le localStorage ne sert que de repli.
  const baseline = serverBaseline || localBaseline;

  const WIN = { jour: 1, semaine: 7, mois: 30, annee: 365, tout: null };
  const cutoff = WIN[period] ? Date.now() - WIN[period] * 86400000 : null;
  const inWin = (i) => !cutoff || new Date(i.maj || i.resolu || i.cree || 0).getTime() >= cutoff;
  const periodItems = cutoff ? srcItems.filter(inWin) : srcItems;
  const itemsForCat = (k) => periodItems.filter((i) => i.categorie === k);
  const prevCount = (k) => {
    const p = baseline ? baseline.cats[k] : null;
    if (Array.isArray(p)) return p.length;
    return typeof p === "number" ? p : null;
  };
  const rows = ROWS.map(([k, label]) => {
    const n = itemsForCat(k).length;
    const pc = prevCount(k);
    return { k, label, n, delta: cutoff ? null : (pc == null ? null : n - pc) };
  });
  const total = rows.reduce((s, r) => s + r.n, 0);
  const horsPoint = cutoff ? 0 : srcItems.filter((i) => i.categorie === "afaire" || i.categorie === "annule" || i.categorie === "retourProd").length;

  const copy = async () => {
    const lines = rows.map((r) => `* ${r.label} : ${r.n} ${fmtDelta(r.delta)}`).join("\n");
    const entete = (dossier && dossier !== "Tous dossiers" ? ` — ${dossier}` : "") + (multi ? ` (${scopeLbl})` : "");
    const txt = `Données suivies du ${new Date().toLocaleDateString("fr-FR")}${entete}\n\n${lines}`;
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { /* clipboard indispo */ }
  };

  // Export PDF à la charte Armonie (moteur standard : serveur WeasyPrint → navigateur → repli).
  const exportPdf = () => {
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const dateStr = new Date().toLocaleDateString("fr-FR");
    const dossierLbl = dossier && dossier !== "Tous dossiers" ? dossier : "Tous dossiers";
    const periodLbl = { tout: "État actuel", jour: "Aujourd'hui", semaine: "7 jours", mois: "30 jours", annee: "1 an" }[period] || "État actuel";
    const tblRows = rows.map((r) => {
      const d = r.delta == null ? "·" : r.delta === 0 ? "(=)" : r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
      const cls = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "";
      return `<tr><td>${esc(r.label)}</td><td class="num">${r.n}</td><td class="num ${cls}">${d}</td></tr>`;
    }).join("");
    const breakdown = rows.filter((r) => r.n > 0).map((r) => {
      const lis = itemsForCat(r.k).map((i) =>
        `<li><b>${esc(i.cle)}</b> ${i.flagged ? "🚩 " : ""}${esc(progResume(i))} <span class="asg">${esc(i.assigne || "non assigné")}</span></li>`
      ).join("");
      return `<h4>${esc(r.label)} <span class="cnt">${r.n}</span></h4><ul class="tk">${lis}</ul>`;
    }).join("");
    const bodyHtml = `
      <table class="ps"><thead><tr><th>Statut</th><th class="num">Nombre</th><th class="num">Écart</th></tr></thead>
      <tbody>${tblRows}</tbody></table>
      <p class="tot">${total} tickets suivis${horsPoint ? ` · ${horsPoint} hors point (à faire / annulés / retour prod)` : ""}${!cutoff && baseline ? ` · écarts vs le ${esc(baseline.date)}` : ""}</p>
      ${breakdown ? `<h3>Détail par statut</h3>${breakdown}` : ""}`;
    const extraCss = `
      table.ps { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 13px; }
      table.ps th { background: var(--indigo-deep); color: #fff; text-align: left; padding: 7px 11px; font-family: Poppins, Inter, sans-serif; font-size: 12px; font-weight: 600; }
      table.ps th.num, table.ps td.num { text-align: right; }
      table.ps td { padding: 6px 11px; border-bottom: 1px solid var(--line); }
      table.ps tbody tr:nth-child(even) { background: var(--purple-soft); }
      table.ps td.num.up { color: #1f8a5f; } table.ps td.num.down { color: #C0392B; }
      .tot { color: var(--muted); font-size: 12px; margin: 2px 0 14px; }
      .ch-body h3 { font-family: Poppins, Inter, sans-serif; color: var(--indigo-deep); font-size: 15px; margin: 16px 0 6px; }
      .ch-body h4 { font-family: Poppins, Inter, sans-serif; color: var(--purple-strong); font-size: 13px; margin: 11px 0 3px; }
      .ch-body h4 .cnt { color: var(--gold); font-weight: 700; }
      ul.tk { margin: 3px 0 8px; padding-left: 18px; } ul.tk li { margin: 2px 0; font-size: 12.5px; line-height: 1.4; }
      ul.tk .asg { color: var(--muted); }`;
    const html = charterDoc({
      docTitle: `Le point du soir — ${dossierLbl}`,
      extraCss,
      coverHtml: cover({
        kicker: "Pilotage TMA",
        title: "Le point du soir",
        subtitle: `${dossierLbl}${multi ? ` · ${scopeLbl}` : ""} — ${periodLbl}`,
        meta: dateStr,
        pill: dossierLbl,
        enBref: `Relevé quotidien par statut${!cutoff && baseline ? `, avec écarts vs le ${esc(baseline.date)}` : ""}. Chiffres issus du point du soir (source Jira), sans recalcul ni invention.`,
        callout: { value: String(total), label: "tickets suivis" },
        etabliPar: "Nicolas Durand",
      }),
      bodyHtml,
      footerText: "cp|WIRE · Le point du soir",
    });
    const slug = String(dossierLbl).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    printHtml(html, `Point_du_soir_${slug}_${todayStr()}.pdf`);
  };

  return (
    <div className="pds">
      <div className="pds-head">
        <h3 className="c360-sec" style={{ margin: 0 }}>Le point du soir{dossier === "Tous dossiers" ? " — tous dossiers" : ""}</h3>
        <div className="pds-head-r">
          {multi && (
            <div className="pds-scope" role="group" aria-label="Périmètre projet">
              {["all", ...prefixes].map((s) => (
                <button key={s} type="button" className={`pds-scope-b ${scope === s ? "on" : ""}`}
                  onClick={() => { setScope(s); setOpenK(null); }}>
                  {s === "all" ? prefixes.join(" + ") : s}
                </button>
              ))}
            </div>
          )}
          <select className="c360-sortsel" value={period} onChange={(e) => { setPeriod(e.target.value); setOpenK(null); }} aria-label="Période du point du soir">
            <option value="tout">Tout (état actuel)</option>
            <option value="jour">Aujourd'hui</option>
            <option value="semaine">7 jours</option>
            <option value="mois">30 jours</option>
            <option value="annee">1 an</option>
          </select>
          <button className="pds-copy" onClick={exportPdf} title="Télécharger le point du soir en PDF (charte Armonie)">⤓ PDF</button>
          <button className="pds-copy" onClick={copy}>{copied ? "Copié ✓" : "Copier le point"}</button>
        </div>
      </div>
      <table className="cpw-tbl pds-tbl">
        <tbody>
          {rows.map((r) => {
            const open = openK === r.k;
            const clickable = r.n > 0 && typeof onTicket === "function";
            const its = open ? itemsForCat(r.k) : null;
            const prevK = !cutoff && baseline && Array.isArray(baseline.cats[r.k]) ? baseline.cats[r.k] : null;
            let entered = null, leftKeys = null;
            if (open && its && prevK) {
              const curSet = new Set(its.map((i) => i.cle));
              const prevSet = new Set(prevK);
              entered = new Set(its.filter((i) => !prevSet.has(i.cle)).map((i) => i.cle));
              leftKeys = prevK.filter((c) => !curSet.has(c));
            }
            return (
              <React.Fragment key={r.k}>
                <tr className={`pds-row ${clickable ? "clk" : ""} ${open ? "open" : ""}`}
                    onClick={clickable ? () => setOpenK(open ? null : r.k) : undefined}>
                  <td className="pds-lbl">{clickable ? <span className="pds-cv" aria-hidden="true">›</span> : null}{r.label}</td>
                  <td className="pds-n">{r.n}</td>
                  <td className={`pds-d ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}`}><span className="pds-delta">{fmtDelta(r.delta)}</span></td>
                </tr>
                {open && its && its.length > 0 ? (
                  <tr className="pds-sub"><td colSpan={3}>
                    {prevK ? (
                      <div className="pds-move">
                        <span className="pds-move-h">Depuis le {baseline.date}</span>
                        <span className="pds-move-up">+{entered.size} entré{entered.size > 1 ? "s" : ""}</span>
                        <span className="pds-move-dn">−{leftKeys.length} sorti{leftKeys.length > 1 ? "s" : ""}</span>
                        {leftKeys.length ? (
                          <div className="pds-left">Sortis : {leftKeys.map((c) => { const m = srcItems.find((x) => x.cle === c); return c + (m ? ` → ${CAT_FR[m.categorie] || m.categorie}` : " (hors point)"); }).join(" · ")}</div>
                        ) : null}
                      </div>
                    ) : null}
                    <ul className="pds-tickets">
                      {its.map((i) => (
                        <li key={i.cle}>
                          <button className="pds-tk" onClick={(e) => { e.stopPropagation(); onTicket(i); }}>
                            {i.flagged ? <span className="pds-flag">🚩</span> : null}
                            <b className="pds-tk-key">{i.cle}</b>
                            <span className="pds-tk-res">{progResume(i)}</span>
                            {entered && entered.has(i.cle) ? <span className="pds-new">nouveau</span> : null}
                            <span className="pds-tk-asg">{i.assigne || "non assigné"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </td></tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="pds-foot">
        {cutoff
          ? `${total} ticket${total > 1 ? "s" : ""} avec activité sur la période sélectionnée`
          : <>{total} tickets suivis{horsPoint ? ` · ${horsPoint} hors point (à faire / annulés / retour prod)` : ""}{baseline ? ` · écarts vs le ${baseline.date}` : " · pas encore de jour antérieur relevé — les écarts apparaîtront ensuite"}</>}
      </p>
    </div>
  );
}
