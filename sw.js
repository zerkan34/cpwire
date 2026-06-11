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
import InstallPWA from "./components/InstallPWA.jsx";
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
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("Tous");
  const [priorite, setPriorite] = useState("Tous");
  const [changedKeys, setChangedKeys] = useState(null); // Set des clés modifiées (surbrillance)
  const [ticket, setTicket] = useState(null);
  const [fiche, setFiche] = useState(null); // {nom}
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const highlightTimer = useRef(null);

  const resetFilters = useCallback(() => {
    setDossier("Tous"); setStatut("Tous"); setOnlyLate(false); setOnlyMine(false);
    setQuery(""); setPerson("Tous"); setPriorite("Tous");
  }, []);

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

  const load = useCallback(async (refresh = false, full = false) => {
    setLoading(true); setError(""); setNeedsConfig(false);
    try {
      const [p, d] = await Promise.all([fetchPortfolio({ refresh, full }), fetchDossiers().catch(() => ({ dossiers: {} }))]);
      setData(p); setDossiers(d.dossiers || {});
      if (refresh || full) {
        const ch = Array.isArray(p.changed) ? p.changed : [];
        if (ch.length) {
          setChangedKeys(new Set(ch));
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setChangedKeys(null), 30000);
        } else {
          setChangedKeys(null);
        }
        const n = p.diagnostic?.totalImporte ?? (p.issues?.length || 0);
        const msg = full
          ? `✓ Tout rechargé — ${n} ticket${n > 1 ? "s" : ""} en mémoire.`
          : ch.length
            ? `✓ Actualisé — ${ch.length} ticket${ch.length > 1 ? "s" : ""} modifié${ch.length > 1 ? "s" : ""} (surbrillance 30 s).`
            : `✓ Actualisé — aucun changement depuis la dernière synchro.`;
        showToast(msg);
      }
    } catch (e) { setError(e.message); if (e.needsConfig) setNeedsConfig(true); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { if (authed) load(false); }, [authed, load]);

  const issues = data?.issues || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((i) => {
      if (dossier !== "Tous" && i.dossier !== dossier) return false;
      if (statut !== "Tous" && i.statut !== statut) return false;
      if (onlyLate && !i.enRetard) return false;
      if (onlyMine && !i.mine) return false;
      if (person !== "Tous" && (i.assigne || "Non assigné") !== person) return false;
      if (priorite !== "Tous" && (i.priorite || "—") !== priorite) return false;
      if (q) {
        const hay = `${i.cle} ${i.resume} ${i.dossier} ${i.assigne || ""} ${i.dev || ""} ${i.statut} ${i.statutJira || ""} ${i.priorite || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, dossier, statut, onlyLate, onlyMine, person, priorite, query]);

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

          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>{dossier === "Tous" ? "Tous les tickets" : `Tickets — ${dossier}`}</span>
            <button className="btn-line sm" onClick={() => load(false, true)} disabled={loading} title="Recharge l'intégralité des tickets depuis Jira (à utiliser rarement)">
              ↻ Tout recharger
            </button>
          </div>
          <div className="panel">
            <Filters issues={issues} statuts={STATUTS} dossier={dossier} statut={statut}
              onlyLate={onlyLate} onlyMine={onlyMine} query={query} person={person} priorite={priorite}
              onDossier={setDossier} onStatut={setStatut}
              onToggleLate={() => setOnlyLate((v) => !v)} onToggleMine={() => setOnlyMine((v) => !v)}
              onQuery={setQuery} onPerson={setPerson} onPriorite={setPriorite} onReset={resetFilters} />
            <div className="sep" />
            <IssueTable rows={filtered} loading={loading} onTicket={setTicket} changedKeys={changedKeys} />
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
      <InstallPWA />
    </div>
  );
}
