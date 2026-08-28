import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Morning from "./Morning.jsx";
import History from "./History.jsx";
import PointDuSoir from "./PointDuSoir.jsx";
import { computeFacts } from "../facts.js";
import { cle } from "../lib/commun.js";
import { getToken } from "../api.js";

// ============================================================================
//  Récap — UN SEUL écran, desktop et mobile.
//
//  Remplace : l'ancien Recap.jsx (desktop) + MobileRecap.jsx (mobile) +
//  DailyRecap.jsx (qui n'était plus rendu nulle part). Avant, l'écran se
//  dédoublait selon la largeur : deux barres de filtres différentes, deux
//  façons de choisir le client, et le périmètre choisi sur un support était
//  perdu sur l'autre. Les deux fichiers évoluaient séparément.
//
//  Principe : une barre de périmètre UNIQUE en haut, qui pilote toutes les
//  vues, puis un carrousel de vues (boutons, flèches du clavier, glissement
//  au doigt sur mobile).
//
//  Source des chiffres : computeFacts, et lui seul. Le filtrage de périmètre
//  passe par cle() du socle commun, donc « Bellion » et « bellion » désignent
//  enfin le même client sur toutes les vues.
// ============================================================================

const VUES = [
  { id: "jour", label: "Aujourd'hui", sub: "Ce qui bouge maintenant, client par client." },
  { id: "compteurs", label: "Compteurs", sub: "Où en est chaque catégorie sur le périmètre choisi." },
  { id: "histo", label: "Historique", sub: "Les récaps passés et les totaux par période." },
];

const PERIODES = [
  { id: 0, label: "Aujourd'hui" },
  { id: 1, label: "Hier" },
  { id: 7, label: "7 jours" },
];

const TOUS = "Tous dossiers";

// Ordre d'affichage habituel des dossiers, puis le reste par ordre alphabétique.
const ORDRE_HABITUEL = ["Tafanel", "EDL", "DS Smith", "IMA", "DIAPAR", "Balas", "Bellion"];

export default function Recap({
  issues = [],
  canCR = true,
  onTicket,
  onDev,
  deletedDevs = [],
  inactiveDevs = [],
  syncedAt,
}) {
  const [vue, setVue] = useState("jour");
  const [periode, setPeriode] = useState(0);
  const [client, setClient] = useState(TOUS);
  // Les engagements pris en séance n'apparaissaient nulle part dans le quotidien : le récap
  // disait tout de Jira et rien de ce qui avait été promis en réunion. On boucle la boucle.
  const [eng, setEng] = useState(null);

  const facts = useMemo(() => computeFacts(issues), [issues]);

  useEffect(() => {
    const t = getToken ? getToken() : "";
    fetch("/api/engagements?ouverts=1", { headers: t ? { "x-access-token": t } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEng(d && d.compteurs ? d.compteurs : null))
      .catch(() => setEng(null));   // le registre indisponible ne casse pas le récap
  }, []);

  const dossiers = useMemo(() => {
    const presents = [...new Set(issues.map((i) => i.dossier).filter((d) => d && d !== "—"))];
    const connus = ORDRE_HABITUEL.filter((d) => presents.some((p) => cle(p) === cle(d)));
    const autres = presents.filter((p) => !connus.some((d) => cle(d) === cle(p))).sort();
    return [TOUS, ...connus, ...autres];
  }, [issues]);

  // Un client mémorisé qui disparaît du portefeuille ne doit pas figer l'écran sur du vide.
  useEffect(() => {
    if (client !== TOUS && !dossiers.some((d) => cle(d) === cle(client))) setClient(TOUS);
  }, [dossiers, client]);

  const surPerimetre = useMemo(
    () => (client === TOUS ? issues : issues.filter((i) => cle(i.dossier) === cle(client))),
    [issues, client]
  );

  const bloc = client === TOUS ? facts.global : facts.get(client);

  const idx = Math.max(0, VUES.findIndex((v) => v.id === vue));
  const courante = VUES[idx];

  const aller = useCallback((n) => {
    const i = Math.min(VUES.length - 1, Math.max(0, n));
    setVue(VUES[i].id);
  }, []);

  // Glissement au doigt : le carrousel se manipule au pouce sur mobile.
  const toucher = useRef({ x: 0, y: 0, actif: false });
  const onTouchStart = (e) => {
    const t = e.touches[0];
    toucher.current = { x: t.clientX, y: t.clientY, actif: true };
  };
  const onTouchEnd = (e) => {
    if (!toucher.current.actif) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - toucher.current.x;
    const dy = t.clientY - toucher.current.y;
    toucher.current.actif = false;
    // Seuil généreux, et on ignore les gestes plutôt verticaux (défilement de page).
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    aller(idx + (dx < 0 ? 1 : -1));
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); aller(idx + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); aller(idx - 1); }
  };

  const majTxt = syncedAt ? new Date(syncedAt).toLocaleTimeString("fr-FR") : "";

  return (
    <div className="recapu">
      <div className="page-hero">
        <span className="page-hero-k">Récap</span>
        <h2>Récap</h2>
        <p>{courante.sub}</p>
      </div>

      {/* Périmètre : une seule barre, elle pilote les trois vues. */}
      <div className="recapu-scope">
        <label className="recapu-scope-f">
          <span>Client</span>
          <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client suivi">
            {dossiers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <div className="recapu-scope-info">
          <span className="recapu-count">{surPerimetre.length} ticket{surPerimetre.length > 1 ? "s" : ""}</span>
          {majTxt ? <span className="recapu-maj">Mise à jour {majTxt}</span> : null}
        </div>
      </div>

      {/* Engagements dus : discret quand tout va bien, visible dès qu'il y a du retard. */}
      {eng && (eng.retard > 0 || eng.semaine > 0) && (
        <div className={"recapu-eng" + (eng.retard > 0 ? " alerte" : "")}>
          <strong>{eng.retard > 0 ? `${eng.retard} engagement${eng.retard > 1 ? "s" : ""} en retard` : "Engagements à jour"}</strong>
          {eng.semaine > 0 && <span> · {eng.semaine} à tenir sous 7 jours</span>}
          <span className="recapu-eng-src">pris en réunion</span>
        </div>
      )}

      {/* Sélecteur de vue. */}
      <div className="recapu-tabs" role="tablist" aria-label="Vues du récap" onKeyDown={onKeyDown}>
        {VUES.map((v, i) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={vue === v.id}
            tabIndex={vue === v.id ? 0 : -1}
            className={`recapu-tab ${vue === v.id ? "on" : ""}`}
            onClick={() => aller(i)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Carrousel. */}
      <div className="recapu-car" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button
          type="button"
          className="recapu-nav prev"
          onClick={() => aller(idx - 1)}
          disabled={idx === 0}
          aria-label="Vue precedente"
        >&#8249;</button>

        <div className="recapu-piste">
          {vue === "jour" && (
            <section className="recapu-vue" role="tabpanel" aria-label="Aujourd'hui">
              <div className="recapu-periode" role="group" aria-label="Fenêtre de mouvement">
                {PERIODES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={periode === p.id}
                    className={`recapu-per ${periode === p.id ? "on" : ""}`}
                    onClick={() => setPeriode(p.id)}
                  >{p.label}</button>
                ))}
              </div>
              <Morning issues={surPerimetre} onTicket={onTicket} embedded windowDays={periode} />
            </section>
          )}

          {vue === "compteurs" && (
            <section className="recapu-vue" role="tabpanel" aria-label="Compteurs">
              <PointDuSoir dossier={client} cats={bloc.cats} items={surPerimetre} onTicket={onTicket} />
            </section>
          )}

          {vue === "histo" && (
            <section className="recapu-vue" role="tabpanel" aria-label="Historique">
              <History
                issues={surPerimetre}
                canCR={canCR}
                onTicket={onTicket}
                onDev={onDev}
                deletedDevs={deletedDevs}
                inactiveDevs={inactiveDevs}
              />
            </section>
          )}
        </div>

        <button
          type="button"
          className="recapu-nav next"
          onClick={() => aller(idx + 1)}
          disabled={idx === VUES.length - 1}
          aria-label="Vue suivante"
        >&#8250;</button>
      </div>

      <div className="recapu-points" aria-hidden="true">
        {VUES.map((v, i) => (
          <span key={v.id} className={`recapu-point ${i === idx ? "on" : ""}`} />
        ))}
      </div>
    </div>
  );
}
