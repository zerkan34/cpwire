import { useCallback, useEffect, useState } from "react";
import { fetchDigest } from "../api.js";

// Vue « Digest » — le point du soir composé automatiquement à partir des données
// réelles. L'ENVOI (mail) n'est proposé que si Microsoft 365 est configuré côté
// serveur ; sinon on ne prétend rien avoir envoyé. Zéro invention.

const norm = (s) => String(s || "").trim();

export default function Digest({ onTicket, onClient }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { const r = await fetchDigest(); setData(r); } catch (e) { setErr(e && e.message ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setSending(true); setSentMsg("");
    try {
      const r = await fetchDigest({ send: "mail" });
      if (r.envoi && r.envoi.envoye) setSentMsg(`Envoyé à ${r.envoi.to}.`);
      else setSentMsg(r.envoi && r.envoi.raison ? r.envoi.raison : "Envoi impossible.");
    } catch (e) { setSentMsg(e && e.message ? e.message : String(e)); }
    finally { setSending(false); }
  };

  const Cli = (d) => (onClient
    ? <button type="button" className="af-cli af-cli-btn" onClick={() => onClient(d)} title="Ouvrir la fiche client">{norm(d) || "—"}</button>
    : <span className="af-cli">{norm(d) || "—"}</span>);
  const Cle = (cle) => (cle ? <button type="button" className="af-cle" onClick={() => onTicket && onTicket({ cle })} title="Ouvrir le ticket">{cle}</button> : null);

  const d = data && data.digest;

  return (
    <div className="af digest">
      <div className="af-intro"><b>Point du soir.</b> Ce qui a bougé, ce qui a dépassé, les échéances de la semaine et les récurrences — composé à partir des données Jira réelles. Aucune valeur estimée.</div>
      <p className="af-do">→ <b>Quoi en faire :</b> ta revue de fin de journée en un écran. L'envoi automatique par mail nécessite Microsoft 365 configuré côté serveur (et un destinataire).</p>

      <div className="af-bar">
        <div className="af-live"><span className="af-live-t">{d ? `Point du ${d.date}` : "…"}</span></div>
        <div className="af-bar-r">
          <button type="button" className="af-refresh" onClick={load} title="Recomposer">↻ Actualiser</button>
          <button type="button" className="af-refresh" onClick={send} disabled={sending} title="Envoyer par mail (si Microsoft 365 configuré)">{sending ? "Envoi…" : "✉ Envoyer par mail"}</button>
        </div>
      </div>
      {sentMsg ? <p className="af-empty" style={{ margin: "0 0 12px" }}>{sentMsg}</p> : null}

      {err ? <p className="af-empty af-err">Digest indisponible : {err}</p> : !d ? (
        <div className="af-skel" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div className="af-skel-row" key={i} />)}</div>
      ) : d.vide ? (
        <p className="af-empty">Rien à signaler aujourd'hui : aucun mouvement, dépassement ni échéance imminente.</p>
      ) : (
        <div className="panel sante-panel">
          <div className="af-kpis">
            <div className="af-kpi"><b>{d.mouvements.total}</b><span>mouvements</span></div>
            <div className={`af-kpi ${d.regressions.length ? "af-kpi-reg" : ""}`}><b>{d.regressions.length}</b><span>retours en arrière</span></div>
            <div className={`af-kpi ${d.sla.depasses ? "af-kpi-reg" : ""}`}><b>{d.sla.depasses}</b><span>SLA dépassés</span></div>
            <div className={`af-kpi ${d.gti.depasses ? "af-kpi-reg" : ""}`}><b>{d.gti.depasses}</b><span>prise en charge (GTI)</span></div>
          </div>

          {d.echeances.retard.length || d.echeances.semaine.length ? (
            <div className="digest-sec">
              <div className="digest-sec-hd">Échéances</div>
              <ul className="sante-items">
                {d.echeances.retard.map((e, i) => <li key={"r" + i} className="sante-item">{Cli(e.dossier)}<span className="sante-sev sante-sev-alerte">en retard</span><span className="sante-item-d">{e.label}</span></li>)}
                {d.echeances.semaine.map((e, i) => <li key={"s" + i} className="sante-item">{Cli(e.dossier)}<span className="sante-sev sante-sev-attention">cette semaine</span><span className="sante-item-d">{e.label}</span></li>)}
              </ul>
            </div>
          ) : null}

          {d.regressions.length ? (
            <div className="digest-sec">
              <div className="digest-sec-hd">Retours en arrière</div>
              <ul className="sante-items">
                {d.regressions.map((r, i) => <li key={i} className="sante-item">{Cli(r.dossier)}{Cle(r.cle)}<span className="sante-item-d">{r.detail}</span></li>)}
              </ul>
            </div>
          ) : null}

          {d.sla.top.length ? (
            <div className="digest-sec">
              <div className="digest-sec-hd">SLA dépassés</div>
              <ul className="sante-items">
                {d.sla.top.map((r, i) => <li key={i} className="sante-item">{Cli(r.dossier)}{Cle(r.cle)}<span className="sante-item-d">{r.detail}</span></li>)}
              </ul>
            </div>
          ) : null}

          {d.recurrences.length ? (
            <div className="digest-sec">
              <div className="digest-sec-hd">Récurrences à surveiller</div>
              <div className="sante-recur-list">
                {d.recurrences.map((r, i) => <span className="sante-recur-chip" key={i}>{Cli(r.dossier)} {r.type} <b>×{r.n}</b></span>)}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
