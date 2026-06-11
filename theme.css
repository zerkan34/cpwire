import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { fetchPortfolio, fetchDossiers, getToken, clearToken, fetchDeletedDevs, deleteDevFiche, restoreDevFiche } from "./api.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import Portfolio from "./components/Portfolio.jsx";
import Filters from "./components/Filters.jsx";
import IssueTable from "./components/IssueTable.jsx";
import TicketModal from "./components/TicketModal.jsx";
import DossierModal from "./components/DossierModal.jsx";
import DeveloperModal from "./components/DeveloperModal.jsx";
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

function notify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body: body || "", icon: "/icons/icon-192.png", tag: "cpwire-" + Date.now() });
      setTimeout(() => { try { n.close(); } catch { /* */ } }, 9000);
    }
  } catch { /* */ }
}

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState("cockpit");
  const [data, setData] = useState(null);
  const [dossiers, setDossiers] = useState({});
  const [deletedDevs, setDeletedDevs] = useState([]);
  const [error, setError] = useState("");
  const [needsConfig, setNeedsConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dossier, setDossier] = useState("Tous");
  const [statut, setStatut] = useState("Tous");
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("Tous");
  const [priorite, setPriorite] = useState("Tous");
  const [changedKeys, setChangedKeys] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [fiche, setFiche] = useState(null);        // dossier (client)
  const [devFiche, setDevFiche] = useState(null);  // fiche développeur (nom)
  const [toast, setToast] = useState("");
  const [showTop, setShowTop] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifOn, setNotifOn] = useState(() => { try { return localStorage.getItem("cpwire_notif") === "1"; } catch { return false; } });
  const toastTimer = useRef(null);
  const highlightTimer = useRef(null);
  const inFlight = useRef(false);
  const prevFlagged = useRef(null);

  const resetFilters = useCallback(() => {
    setDossier("Tous"); setStatut("Tous"); setOnlyLate(false); setOnlyMine(false); setOnlyFlagged(false);
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

  // Bouton "remonter en haut"
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 350);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const load = useCallback(async (refresh = false, full = false, silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    else setLoading(true);
    setError(""); setNeedsConfig(false);
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
        // Pastille de notifications : on incrémente sur une actualisation auto (silencieuse),
        // on remet à zéro quand l'utilisateur actualise lui-même (il voit les données fraîches).
        if (!silent) setNotifCount(0);
        if (silent && ch.length) {
          setNotifCount((c) => c + ch.length);
          notify(`🔔 ${ch.length} ticket(s) modifié(s) dans Jira`, ch.slice(0, 4).join(", "));
        }
        const n = p.diagnostic?.totalImporte ?? (p.issues?.length || 0);
        if (full) {
          showToast(`✓ Tout rechargé — ${n} ticket${n > 1 ? "s" : ""} en mémoire.`);
        } else if (ch.length) {
          showToast(`✓ Actualisé — ${ch.length} ticket${ch.length > 1 ? "s" : ""} modifié${ch.length > 1 ? "s" : ""} (surbrillance 30 s).`);
        } else if (!silent) {
          showToast(`✓ Actualisé — aucun changement depuis la dernière synchro.`);
        }
      }
    } catch (e) { setError(e.message); if (e.needsConfig) setNeedsConfig(true); }
    finally { setLoading(false); inFlight.current = false; }
  }, [showToast]);

  useEffect(() => { if (authed) load(false); }, [authed, load]);
  useEffect(() => { if (authed) fetchDeletedDevs().then((r) => setDeletedDevs(r.deleted || [])).catch(() => {}); }, [authed]);

  // Actualisation automatique (toutes les 90 s) quand les notifications sont activées.
  useEffect(() => {
    if (!authed || !notifOn) return;
    const id = setInterval(() => { load(true, false, true); }, 90000);
    return () => clearInterval(id);
  }, [authed, notifOn, load]);

  // Détection des nouveaux tickets flaggés -> notification.
  useEffect(() => {
    const list = data?.issues;
    if (!list) return;
    const nf = new Set(list.filter((i) => i.flagged).map((i) => i.cle));
    if (prevFlagged.current) {
      const newly = [...nf].filter((c) => !prevFlagged.current.has(c));
      if (newly.length && notifOn) {
        newly.slice(0, 5).forEach((c) => { const it = list.find((x) => x.cle === c); notify(`🚩 Ticket flaggé : ${c}`, it?.resume || ""); });
        showToast(`🚩 ${newly.length} ticket${newly.length > 1 ? "s" : ""} viennent d'être flaggé${newly.length > 1 ? "s" : ""}.`);
      }
    }
    prevFlagged.current = nf;
  }, [data, notifOn, showToast]);

  const notifToggle = useCallback(async () => {
    if (!notifOn) {
      if ("Notification" in window && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch { /* */ }
      }
      setNotifOn(true);
      try { localStorage.setItem("cpwire_notif", "1"); } catch { /* */ }
      const granted = "Notification" in window && Notification.permission === "granted";
      showToast(granted
        ? "🔔 Notifications activées — actualisation auto toutes les 90 s (garde l'onglet ouvert)."
        : "Actualisation auto activée (90 s). Notifications système non autorisées : les alertes s'afficheront dans l'appli.");
    } else {
      setNotifOn(false);
      try { localStorage.removeItem("cpwire_notif"); } catch { /* */ }
      showToast("Notifications et actualisation auto désactivées.");
    }
  }, [notifOn, showToast]);

  const onBell = useCallback(() => {
    if (notifCount > 0) { setNotifCount(0); return; } // acquitter la pastille
    notifToggle();
  }, [notifCount, notifToggle]);

  const removeDev = useCallback(async (name) => {
    try { const r = await deleteDevFiche(name); setDeletedDevs(r.deleted || []); showToast(`Fiche de ${name} masquée. Restaurable depuis la fiche.`); }
    catch (e) { showToast("Échec : " + e.message); }
  }, [showToast]);
  const restoreDev = useCallback(async (name) => {
    try { const r = await restoreDevFiche(name); setDeletedDevs(r.deleted || []); showToast(`Fiche de ${name} restaurée.`); }
    catch (e) { showToast("Échec : " + e.message); }
  }, [showToast]);

  const issues = data?.issues || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((i) => {
      if (dossier !== "Tous" && i.dossier !== dossier) return false;
      if (statut !== "Tous" && i.statut !== statut) return false;
      if (onlyLate && !i.enRetard) return false;
      if (onlyMine && !i.mine) return false;
      if (onlyFlagged && !i.flagged) return false;
      if (person !== "Tous" && (i.assigne || "Non assigné") !== person) return false;
      if (priorite !== "Tous" && (i.priorite || "—") !== priorite) return false;
      if (q) {
        const hay = `${i.cle} ${i.resume} ${i.dossier} ${i.assigne || ""} ${i.dev || ""} ${i.statut} ${i.statutJira || ""} ${i.priorite || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, dossier, statut, onlyLate, onlyMine, onlyFlagged, person, priorite, query]);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  const diag = data?.diagnostic;

  return (
    <div className="wrap">
      <Header kpis={data?.kpis} source={data?.source} generatedAt={data?.generatedAt}
        loading={loading} me={data?.me} onRefresh={() => load(true)}
        onLogout={() => { clearToken(); setAuthed(false); }}
        query={query} onQuery={setQuery}
        notifOn={notifOn} onToggleNotif={onBell} notifCount={notifCount} />

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
              onlyLate={onlyLate} onlyMine={onlyMine} onlyFlagged={onlyFlagged} query={query} person={person} priorite={priorite}
              onDossier={setDossier} onStatut={setStatut}
              onToggleLate={() => setOnlyLate((v) => !v)} onToggleMine={() => setOnlyMine((v) => !v)}
              onToggleFlagged={() => setOnlyFlagged((v) => !v)}
              onQuery={setQuery} onPerson={setPerson} onPriorite={setPriorite} onReset={resetFilters} />
            <div className="sep" />
            <IssueTable rows={filtered} loading={loading} onTicket={setTicket} onDev={setDevFiche} changedKeys={changedKeys} />
          </div>
        </>
      )}

      {tab === "recap" && <DailyRecap onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}
      {tab === "morning" && <Morning issues={issues} onTicket={setTicket} />}
      {tab === "devs" && <Developers issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}
      {tab === "meetings" && <Meetings />}
      {tab === "history" && <History issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}

      <div className="foot">cp|WIRE · {data?.me ? `connecté en tant que ${data.me} · ` : ""}{data?.source || ""}</div>

      {devFiche && (
        <DeveloperModal devName={devFiche} allIssues={issues}
          deleted={deletedDevs.includes(devFiche)}
          onDelete={() => removeDev(devFiche)} onRestore={() => restoreDev(devFiche)}
          onClose={() => setDevFiche(null)} onTicket={setTicket} />
      )}
      {fiche && <DossierModal nom={fiche.nom} fiche={dossiers[fiche.nom]} onClose={() => setFiche(null)}
        onSaved={(nom, saved) => setDossiers((d) => ({ ...d, [nom]: saved }))} />}
      {ticket && <TicketModal ticket={ticket} onClose={() => setTicket(null)} onPushed={() => load(true)} />}

      {showTop && <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Remonter en haut">↑</button>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <InstallPWA />
    </div>
  );
}
