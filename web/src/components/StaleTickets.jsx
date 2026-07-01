import { useEffect, useMemo, useState } from "react";
import { fetchSla } from "../api.js";

// Tickets figés — depuis combien de temps chaque ticket n'a pas changé d'état.
// Donnée RÉELLE : statutDepuis (date d'entrée dans le statut courant, champ Jira), repli sur maj (marqué ≈).
// On exclut ce qui est terminé / mis en prod / annulé (catégorie Jira réelle). Zéro invention.

const DONE_CATS = new Set(["termine", "miseEnProd", "annule"]);
const PILL = { Bloqué: "block", "À faire": "todo", "En cours": "prog", Terminé: "done" };
const norm = (s) => String(s || "").trim();
const daysSince = (iso) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000); };
const fmtD = (iso) => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`; } catch { return "—"; } };
const ageCls = (n) => (n == null ? "" : n >= 30 ? "crit" : n >= 15 ? "warn" : n >= 7 ? "mid" : "ok");

const SEUILS = [["7", "≥ 7 j", 7], ["15", "≥ 15 j", 15], ["30", "≥ 30 j", 30], ["0", "Tous", 0]];

export default function StaleTickets({ issues = [], onTicket, onDev, onClient, changedKeys }) {
  const [client, setClient] = useState("Tous");
  const [seuil, setSeuil] = useState(7);
  const [slaOnly, setSlaOnly] = useState(false);
  const [slaMap, setSlaMap] = useState(null); // cle -> "over" | "risk"

  // Croisement SLA : on récupère les tickets en alerte (dépassé / à risque) pour les badger.
  useEffect(() => {
    let alive = true;
    fetchSla()
      .then((r) => { if (!alive) return; const m = {}; for (const a of (r.alerts || [])) m[a.cle] = a.state; setSlaMap(m); })
      .catch(() => { if (alive) setSlaMap({}); });
    return () => { alive = false; };
  }, []);
  const slaOf = (cle) => (slaMap ? slaMap[cle] : undefined);

  // Base : tickets ouverts (hors terminé/prod/annulé), avec âge dans le statut courant.
  const base = useMemo(() => issues
    .filter((i) => !DONE_CATS.has(i.categorie))
    .map((i) => {
      const src = i.statutDepuis || i.maj || null;
      return { ...i, _age: daysSince(src), _since: src, _approx: !i.statutDepuis };
    })
    .filter((i) => i._age != null)
    .sort((a, b) => b._age - a._age), [issues]);

  const clients = useMemo(() => [...new Set(base.map((i) => norm(i.dossier)).filter((d) => d && d !== "—"))].sort(), [base]);

  const shown = useMemo(() => base.filter((i) =>
    (client === "Tous" || norm(i.dossier) === client) && i._age >= seuil &&
    (!slaOnly || !!slaOf(i.cle))
  ), [base, client, seuil, slaOnly, slaMap]);

  const nCrit = shown.filter((i) => i._age >= 30).length;
  const nSla = shown.filter((i) => !!slaOf(i.cle)).length;
  const median = shown.length ? shown[Math.floor(shown.length / 2)]._age : null;

  const openTicket = (i) => { if (onTicket) onTicket(i); };

  return (
    <div className="sf">
      <div className="af-intro">
        <b>Tickets figés.</b> Depuis combien de temps chaque ticket n'a pas changé d'état — d'après <b>statutDepuis</b> (entrée dans le statut courant, champ Jira ; ≈ = repli sur la dernière mise à jour). Ce qui <b>ne</b> bouge <b>pas</b> est souvent le vrai sujet d'un pilote. Terminés / mis en prod / annulés exclus.
      </div>
      <p className="af-do">→ <b>Quoi en faire :</b> trie par âge. Au-delà de <b>30 j</b>, tranche : relancer, changer le statut, ou clôturer. Le badge <b>SLA</b> repère ceux qui sont aussi hors délai. Clique un ticket, un client ou un dev.</p>

      <div className="sf-kpis">
        <div className="af-kpi"><b>{shown.length}</b><span>tickets figés (≥ {seuil} j)</span></div>
        <div className={`af-kpi ${nCrit ? "af-kpi-reg" : ""}`}><b>{nCrit}</b><span>≥ 30 jours</span></div>
        <div className={`af-kpi ${nSla ? "af-kpi-reg" : ""}`}><b>{slaMap ? nSla : "…"}</b><span>en alerte SLA</span></div>
        <div className="af-kpi af-kpi-d"><b>{median != null ? `${median} j` : "—"}</b><span>âge médian</span></div>
      </div>

      <div className="af-filters">
        <button type="button" className={`af-chip ${client === "Tous" ? "on" : ""}`} onClick={() => setClient("Tous")}>Tous <b>{base.length}</b></button>
        {clients.map((c) => (
          <button type="button" key={c} className={`af-chip ${client === c ? "on" : ""}`} onClick={() => setClient(c)}>{c}</button>
        ))}
      </div>
      <div className="af-types" role="tablist" aria-label="Seuil d'ancienneté">
        {SEUILS.map(([id, lbl, v]) => (
          <button type="button" key={id} className={`af-type ${seuil === v ? "on" : ""}`} onClick={() => setSeuil(v)}>{lbl}</button>
        ))}
        <label className="sf-slaonly"><input type="checkbox" checked={slaOnly} onChange={(e) => setSlaOnly(e.target.checked)} disabled={!slaMap} /> En alerte SLA</label>
      </div>

      {shown.length ? (
        <ul className="af-list sf-list">
          {shown.map((i) => (
            <li className={`af-ev sf-ev${changedKeys && changedKeys.has && changedKeys.has(i.cle) ? " is-fresh" : ""}`} key={i.cle}>
              <span className={`sf-age ${ageCls(i._age)}`}>{i._age} j</span>
              {onClient
                ? <button type="button" className="af-cli af-cli-btn" onClick={() => onClient(i.dossier)} title="Ouvrir la fiche client">{norm(i.dossier) || "—"}</button>
                : <span className="af-cli">{norm(i.dossier) || "—"}</span>}
              <button type="button" className="af-cle" onClick={() => openTicket(i)} title="Ouvrir le ticket">{i.cle}</button>
              <span className="sf-st">
                <span className={`pill ${PILL[i.statut] || ""}`}>{i.statut}</span>
                {slaOf(i.cle) ? <span className={`sla-badge sla-badge-${slaOf(i.cle)}`} title={slaOf(i.cle) === "over" ? "SLA dépassé" : "SLA à risque"}>{slaOf(i.cle) === "over" ? "SLA ⚠" : "SLA ◔"}</span> : null}
              </span>
              <span className="af-t" title={i.resume}>{i.resume || "—"}</span>
              <span className="sf-since">depuis le {fmtD(i._since)}{i._approx ? " ≈" : ""}</span>
              <span className="af-who">{(i.contributors && i.contributors.length) ? (onDev ? <button type="button" className="sf-dev-l" onClick={() => onDev(i.contributors[0])}>{i.contributors[0]}</button> : i.contributors[0]) : <span className="af-who-none">non assigné</span>}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="af-empty">Aucun ticket figé au-delà de {seuil} j{client !== "Tous" ? ` sur ${client}` : ""}. Tout bouge — ou presque.</p>
      )}
    </div>
  );
}
