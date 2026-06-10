import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { fetchPortfolio, fetchDossiers, getToken, clearToken } from "./api.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import Portfolio from "./components/Portfolio.jsx";
import Filters from "./components/Filters.jsx";
import IssueTable from "./components/IssueTable.jsx";
import TicketModal from "./components/TicketModal.jsx";
import DossierModal from "./components/DossierModal.jsx";
import DailyRecap from "./components/DailyRecap.jsx";
import Developers from "./components/Developers.jsx";
import Morning from "./components/Morning.jsx";
import Meetings from "./components/Meetings.jsx";
import History from "./components/History.jsx";

const STATUTS = ["Bloqué", "À faire", "En cours", "Terminé"];
const TABS = [
  { id: "cockpit", label: "Cockpit" }, { id: "recap", label: "Récap du jour" },
  { id: "morning", label: "Brief matin" },
  { id: "devs", label: "Développeurs" },
  { id: "meetings", label: "Réunions" }, { id: "history", label: "Historique" },
];

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState("cockpit");
  const [data, setData] = useState(null);
  const [dossiers, setDossiers] = useState({});
  const [error, setError] = useState("");
  const [needsConfig, setNeedsConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dossier, setDossier] = useState("Tous");
  const [statut, setStatut] = useState("Tous");
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [fiche, setFiche] = useState(null); // {nom}
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }, []);

  useEffect(() => {
    const logout = () => { setAuthed(false); };
    window.addEventListener("cpwire-logout", logout);
    return () => window.removeEventListener("cpwire-logout", logout);
  }, []);

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(""); setNeedsConfig(false);
    try {
      const [p, d] = await Promise.all([fetchPortfolio({ refresh }), fetchDossiers().catch(() => ({ dossiers: {} }))]);
      setData(p); setDossiers(d.dossiers || {});
      if (refresh) {
        const diag = p.diagnostic || {};
        const n = diag.totalImporte ?? (p.issues?.length || 0);
        const np = diag.parProjet ? Object.keys(diag.parProjet).length : 0;
        const zero = diag.projetsSansTicket?.length || 0;
        showToast(`✓ Actualisé — ${n} ticket${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""} depuis Jira · ${np} projet${np > 1 ? "s" : ""}${zero ? ` · ⚠ ${zero} sans ticket` : ""}`);
      }
    } catch (e) { setError(e.message); if (e.needsConfig) setNeedsConfig(true); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { if (authed) load(false); }, [authed, load]);

  const issues = data?.issues || [];
  const filtered = useMemo(() => issues.filter((i) =>
    (dossier === "Tous" || i.dossier === dossier) && (statut === "Tous" || i.statut === statut) &&
    (!onlyLate || i.enRetard) && (!onlyMine || i.mine)), [issues, dossier, statut, onlyLate, onlyMine]);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  const diag = data?.diagnostic;

  return (
    <div className="wrap">
      <Header kpis={data?.kpis} source={data?.source} generatedAt={data?.generatedAt}
        loading={loading} me={data?.me} onRefresh={() => load(true)}
        onLogout={() => { clearToken(); setAuthed(false); }} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "cockpit" && data?.kpis?.mine ? <span className="b">{data.kpis.mine} pour moi</span> : null}
          </button>
        ))}
      </div>

      {needsConfig && (
        <div className="banner">
          Jira n'est pas configuré côté serveur. Renseigne <b>JIRA_BASE_URL</b>, <b>JIRA_EMAIL</b> et
          <b> JIRA_API_TOKEN</b> dans <b>server/.env</b>, puis relance le serveur. Aucune donnée fictive n'est affichée.
        </div>
      )}
      {error && !needsConfig && <div className="banner">Erreur : {error}</div>}

      {diag && diag.projetsSansTicket?.length > 0 && (
        <div className="banner">
          Import : {diag.totalImporte} tickets. ⚠ Projet(s) configuré(s) sans aucun ticket importé :
          <b> {diag.projetsSansTicket.join(", ")}</b> — vérifie la clé du projet et tes droits d'accès dans Jira.
        </div>
      )}

      {tab === "cockpit" && (
        <>
          {diag && (
            <p className="hint" style={{ marginTop: 4 }}>
              Import vérifié — {diag.totalImporte} tickets : {Object.entries(diag.parProjet).map(([k, v]) => `${k} (${v})`).join(" · ") || "—"}
            </p>
          )}
          <div className="section-title">Portefeuille <span style={{ fontFamily: "Inter", fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>— clique une carte pour ouvrir sa fiche</span></div>
          <Portfolio parDossier={data?.parDossier} onOpen={(d) => setFiche({ nom: d })} />

          <div className="section-title">{dossier === "Tous" ? "Tous les tickets" : `Tickets — ${dossier}`}</div>
          <div className="panel">
            <Filters issues={issues} statuts={STATUTS} dossier={dossier} statut={statut}
              onlyLate={onlyLate} onlyMine={onlyMine} onDossier={setDossier} onStatut={setStatut}
              onToggleLate={() => setOnlyLate((v) => !v)} onToggleMine={() => setOnlyMine((v) => !v)} />
            <div className="sep" />
            <IssueTable rows={filtered} loading={loading} onTicket={setTicket} />
          </div>
        </>
      )}

      {tab === "recap" && <DailyRecap onTicket={setTicket} />}
      {tab === "morning" && <Morning issues={issues} onTicket={setTicket} />}
      {tab === "devs" && <Developers issues={issues} onTicket={setTicket} />}
      {tab === "meetings" && <Meetings />}
      {tab === "history" && <History />}

      <div className="foot">CPwire · {data?.me ? `connecté en tant que ${data.me} · ` : ""}{data?.source || ""}</div>

      {ticket && <TicketModal ticket={ticket} onClose={() => setTicket(null)} onPushed={() => load(true)} />}
      {fiche && <DossierModal nom={fiche.nom} fiche={dossiers[fiche.nom]} onClose={() => setFiche(null)}
        onSaved={(nom, saved) => setDossiers((d) => ({ ...d, [nom]: saved }))} />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
