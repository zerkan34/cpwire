import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getToken } from "../api.js";
import { cle, frDateCourte } from "../lib/commun.js";
import { buildEngagementsDoc } from "../engagementsDoc.js";
import { exportHtmlPdf } from "../api.js";
import "./Engagements.css";

// ============================================================================
//  Engagements — le registre des actions et décisions.
//
//  Ce que Jira ne sait pas faire : « Catherine revient avec la volumétrie avant
//  vendredi », « on acte le report de la bascule à septembre ». Ces phrases se
//  disent en séance, finissent dans un compte rendu, et n'existent plus le lundi
//  suivant. Ici elles ont un porteur, une échéance, un statut et une trace.
//
//  Zéro invention : une échéance floue reste une note, jamais une date.
// ============================================================================

const STATUT_LABEL = { a_faire: "À faire", en_cours: "En cours", fait: "Fait", abandonne: "Abandonné" };
const URGENCE_LABEL = {
  retard: "En retard", imminent: "Sous 48 h", semaine: "Cette semaine",
  plus_tard: "Plus tard", sans_echeance: "Sans échéance", aucune: "",
};

function entetes() {
  const t = getToken ? getToken() : "";
  const h = { "Content-Type": "application/json" };
  if (t) h["x-access-token"] = t;
  return h;
}

async function appel(url, options = {}) {
  const r = await fetch(url, { headers: entetes(), ...options });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
  return d;
}

const VIDE = { quoi: "", qui: "", client: "", echeance: "", nature: "action", note: "" };

export default function Engagements({ issues = [], onClient }) {
  const [data, setData] = useState({ engagements: [], compteurs: null, stockage: null });
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState("");
  const [filtre, setFiltre] = useState({ client: "Tous", qui: "Tous", nature: "Tous", ouverts: true });
  const [nouveau, setNouveau] = useState(VIDE);
  const [ouvertForm, setOuvertForm] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const p = new URLSearchParams();
      if (filtre.ouverts) p.set("ouverts", "1");
      setData(await appel(`/api/engagements?${p.toString()}`));
      setMessage("");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setChargement(false);
    }
  }, [filtre.ouverts]);

  useEffect(() => { charger(); }, [charger]);

  // Les clients viennent du portefeuille réel, pas d'une liste écrite en dur.
  const clients = useMemo(() => {
    const dep = [...new Set(issues.map((i) => i.dossier).filter((d) => d && d !== "—"))];
    const dej = [...new Set(data.engagements.map((e) => e.client).filter(Boolean))];
    const tout = [...dep];
    dej.forEach((c) => { if (!tout.some((d) => cle(d) === cle(c))) tout.push(c); });
    return tout.sort();
  }, [issues, data.engagements]);

  const porteurs = useMemo(
    () => [...new Set(data.engagements.map((e) => e.qui).filter(Boolean))].sort(),
    [data.engagements]
  );

  const visibles = useMemo(() => data.engagements.filter((e) => {
    if (filtre.client !== "Tous" && cle(e.client) !== cle(filtre.client)) return false;
    if (filtre.qui !== "Tous" && e.qui !== filtre.qui) return false;
    if (filtre.nature !== "Tous" && e.nature !== filtre.nature) return false;
    return true;
  }), [data.engagements, filtre]);

  const c = data.compteurs || {};

  async function creer() {
    if (!nouveau.quoi.trim()) { setMessage("Il faut au moins un intitulé."); return; }
    try {
      await appel("/api/engagements", { method: "POST", body: JSON.stringify(nouveau) });
      setNouveau(VIDE); setOuvertForm(false); charger();
    } catch (e) { setMessage(e.message); }
  }

  async function majStatut(e, statut) {
    try {
      await appel(`/api/engagements/${e.id}`, { method: "PUT", body: JSON.stringify({ statut }) });
      charger();
    } catch (err) { setMessage(err.message); }
  }

  async function majEcheance(e, echeance) {
    try {
      await appel(`/api/engagements/${e.id}`, { method: "PUT", body: JSON.stringify({ echeance }) });
      charger();
    } catch (err) { setMessage(err.message); }
  }

  async function supprimer(e) {
    if (!window.confirm(`Supprimer « ${e.quoi.slice(0, 60)} » ?`)) return;
    try { await appel(`/api/engagements/${e.id}`, { method: "DELETE" }); charger(); }
    catch (err) { setMessage(err.message); }
  }

  // Export à la charte Armonie, via le même moteur que tes autres livrables.
  // Repli markdown si le rendu serveur est indisponible : mieux vaut un fichier
  // moins joli qu'un bouton qui ne fait rien.
  const [exportEnCours, setExportEnCours] = useState(false);

  async function exporter() {
    setExportEnCours(true);
    setMessage("");
    const perimetre = filtre.client === "Tous" ? "Tous" : filtre.client;
    try {
      const { html, filename } = buildEngagementsDoc({ engagements: visibles, perimetre });
      await exportHtmlPdf(html, filename);
    } catch (e) {
      setMessage("PDF indisponible (" + e.message + ") : enregistrement en markdown.");
      exporterMarkdown(perimetre);
    } finally {
      setExportEnCours(false);
    }
  }

  function exporterMarkdown(perimetre) {
    const l = ["# Registre des engagements", `Édité le ${new Date().toLocaleDateString("fr-FR")}`];
    if (perimetre !== "Tous") l.push(`Périmètre : ${perimetre}`);
    const bloc = (titre, arr) => {
      if (!arr.length) return;
      l.push(`\n## ${titre}`);
      arr.forEach((e) => {
        const bits = [e.qui || "porteur à désigner"];
        if (e.echeance) bits.push(`échéance ${frDateCourte(e.echeance)}`);
        else if (e.note) bits.push(e.note);
        l.push(`- ${e.quoi} (${bits.join(", ")})`);
      });
    };
    bloc("En retard", visibles.filter((e) => e.urgence === "retard"));
    bloc("Cette semaine", visibles.filter((e) => e.urgence === "imminent" || e.urgence === "semaine"));
    bloc("À venir", visibles.filter((e) => e.urgence === "plus_tard"));
    bloc("Sans échéance", visibles.filter((e) => e.urgence === "sans_echeance"));
    bloc("Décisions actées", visibles.filter((e) => e.nature === "decision"));
    const blob = new Blob([l.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Engagements-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return (
    <div className="eng">
      <div className="page-hero">
        <span className="page-hero-k">Atelier</span>
        <h2>Engagements</h2>
        <p>Les actions et décisions prises en séance, suivies jusqu&apos;à leur terme.</p>
      </div>

      {data.stockage && !data.stockage.durable && (
        <div className="eng-alerte">
          Stockage non durable : ces engagements seront perdus au prochain redéploiement.
          Exporte le registre avant, ou configure la persistance.
        </div>
      )}

      <div className="eng-kpis">
        <button type="button" className={`eng-kpi ${filtre.ouverts ? "on" : ""}`}
          onClick={() => setFiltre((f) => ({ ...f, ouverts: !f.ouverts }))}>
          <span className="eng-kpi-n">{c.ouverts ?? "—"}</span>
          <span className="eng-kpi-l">ouverts</span>
        </button>
        <div className={`eng-kpi ${c.retard ? "rouge" : ""}`}>
          <span className="eng-kpi-n">{c.retard ?? "—"}</span>
          <span className="eng-kpi-l">en retard</span>
        </div>
        <div className="eng-kpi">
          <span className="eng-kpi-n">{c.semaine ?? "—"}</span>
          <span className="eng-kpi-l">sous 7 jours</span>
        </div>
        <div className={`eng-kpi ${c.sansEcheance ? "ambre" : ""}`}>
          <span className="eng-kpi-n">{c.sansEcheance ?? "—"}</span>
          <span className="eng-kpi-l">sans échéance</span>
        </div>
        <div className="eng-kpi">
          <span className="eng-kpi-n">{c.decisions ?? "—"}</span>
          <span className="eng-kpi-l">décisions</span>
        </div>
      </div>

      <div className="eng-barre">
        <select value={filtre.client} onChange={(e) => setFiltre((f) => ({ ...f, client: e.target.value }))} aria-label="Client">
          <option>Tous</option>
          {clients.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={filtre.qui} onChange={(e) => setFiltre((f) => ({ ...f, qui: e.target.value }))} aria-label="Porteur">
          <option>Tous</option>
          {porteurs.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={filtre.nature} onChange={(e) => setFiltre((f) => ({ ...f, nature: e.target.value }))} aria-label="Nature">
          <option value="Tous">Actions et décisions</option>
          <option value="action">Actions</option>
          <option value="decision">Décisions</option>
        </select>
        <div className="eng-barre-fin">
          <button type="button" className="eng-btn" onClick={() => setOuvertForm((v) => !v)}>
            {ouvertForm ? "Annuler" : "Ajouter"}
          </button>
          <button type="button" className="eng-btn" onClick={exporter} disabled={!visibles.length || exportEnCours}>{exportEnCours ? "Export…" : "Exporter en PDF"}</button>
        </div>
      </div>

      {ouvertForm && (
        <div className="eng-form">
          <input className="eng-quoi" placeholder="Que faut-il faire, ou qu'a-t-on acté ?"
            value={nouveau.quoi} onChange={(e) => setNouveau({ ...nouveau, quoi: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") creer(); }} autoFocus />
          <input placeholder="Porteur" value={nouveau.qui} onChange={(e) => setNouveau({ ...nouveau, qui: e.target.value })} />
          <select value={nouveau.client} onChange={(e) => setNouveau({ ...nouveau, client: e.target.value })}>
            <option value="">Client…</option>
            {clients.map((d) => <option key={d}>{d}</option>)}
          </select>
          <input type="date" value={nouveau.echeance} onChange={(e) => setNouveau({ ...nouveau, echeance: e.target.value })} aria-label="Échéance" />
          <select value={nouveau.nature} onChange={(e) => setNouveau({ ...nouveau, nature: e.target.value })}>
            <option value="action">Action</option>
            <option value="decision">Décision</option>
          </select>
          <button type="button" className="eng-btn plein" onClick={creer}>Enregistrer</button>
        </div>
      )}

      {message && <div className="eng-msg">{message}</div>}

      {chargement ? (
        <div className="eng-vide">Chargement…</div>
      ) : visibles.length === 0 ? (
        <div className="eng-vide">
          Aucun engagement sur ce périmètre. Ils arrivent ici depuis un compte rendu de réunion,
          ou en cliquant sur « Ajouter ».
        </div>
      ) : (
        <ul className="eng-liste">
          {visibles.map((e) => (
            <li key={e.id} className={`eng-item u-${e.urgence} ${e.clos ? "clos" : ""}`}>
              <div className="eng-item-h">
                <span className={`eng-nature ${e.nature}`}>{e.nature === "decision" ? "Décision" : "Action"}</span>
                {e.urgence && e.urgence !== "aucune" && (
                  <span className={`eng-urg ${e.urgence}`}>{URGENCE_LABEL[e.urgence]}</span>
                )}
                {e.client && (
                  <button type="button" className="eng-cli" onClick={() => onClient && onClient(e.client)}>{e.client}</button>
                )}
                <span className="eng-spacer" />
                <button type="button" className="eng-x" onClick={() => supprimer(e)} aria-label="Supprimer">×</button>
              </div>

              <p className="eng-quoi-t">{e.quoi}</p>

              <div className="eng-meta">
                {/* Une décision est actée : elle n'a ni porteur à relancer ni date à tenir.
                    Lui proposer les deux, c'est inviter à remplir des cases qui n'ont pas
                    de sens et polluer les compteurs de retard. */}
                {e.nature === "action" && (
                  <span>{e.qui ? <>Porté par <b>{e.qui}</b></> : <i>porteur à désigner</i>}</span>
                )}
                {e.echeance ? (
                  <span>Échéance <b>{frDateCourte(e.echeance)}</b>{typeof e.joursRestants === "number" && !e.clos
                    ? <> · {e.joursRestants < 0 ? `${-e.joursRestants} j de retard` : `dans ${e.joursRestants} j`}</> : null}</span>
                ) : e.nature === "action" ? (
                  <span className="eng-sansdate">
                    Pas de date{e.note ? <> (dit : « {e.note} »)</> : null}
                    <input type="date" aria-label="Fixer une échéance" onChange={(ev) => majEcheance(e, ev.target.value)} />
                  </span>
                ) : null}
                {e.origine ? <span>Source : {e.origine}</span> : null}
              </div>

              <div className="eng-actions">
                {(e.nature === "decision" ? ["a_faire", "abandonne"] : ["a_faire", "en_cours", "fait", "abandonne"]).map((st) => (
                  <button key={st} type="button"
                    className={`eng-st ${e.statut === st ? "on" : ""}`}
                    onClick={() => majStatut(e, st)}>
                    {e.nature === "decision" ? (st === "a_faire" ? "Actée" : "Annulée") : STATUT_LABEL[st]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
