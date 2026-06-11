import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { fetchPortfolio, fetchDossiers, getToken, clearToken, fetchDeletedDevs, deleteDevFiche, restoreDevFiche, fetchChangesSummary } from "./api.js";
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
import EnCours from "./components/EnCours.jsx";
import Morning from "./components/Morning.jsx";
import InstallPWA from "./components/InstallPWA.jsx";
import Meetings from "./components/Meetings.jsx";
import CRA from "./components/CRA.jsx";
import History from "./components/History.jsx";

const STATUTS = ["Bloqué", "À faire", "En cours", "Terminé"];
const TABS = [
  { id: "cockpit", label: "Cockpit" },
  { id: "encours", label: "En cours" },
  { id: "recap", label: "Récap du jour" },
  { id: "morning", label: "Brief matin" },
  { id: "devs", label: "Développeurs" },
  { id: "meetings", label: "Réunions" }, { id: "cra", label: "CRA" }, { id: "history", label: "Historique" },
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
  const [bootMsg, setBootMsg] = useState("");
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
  const [notifs, setNotifs] = useState([]);
  const [notifOn, setNotifOn] = useState(() => { try { return localStorage.getItem("cpwire_notif") === "1"; } catch { return false; } });
  const toastTimer = useRef(null);
  const highlightTimer = useRef(null);
  const inFlight = useRef(false);
  const prevFlagged = useRef(null);

  // Déclaré tôt : utilisé par des callbacks plus bas (évite une erreur d'initialisation au rendu).
  const issues = data?.issues || [];

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
    if (!silent) setLoading(true); // un rafraîchissement silencieux (sondage notifs en fond) ne doit PAS afficher la barre
    setError(""); setNeedsConfig(false);
    try {
      const d = await fetchDossiers().catch(() => ({ dossiers: {} }));
      let p = await fetchPortfolio({ refresh, full });
      // Import en arrière-plan : on sonde rapidement jusqu'à ce qu'il soit prêt.
      // Chaque requête est instantanée (pas de requête longue), donc la barre ne peut plus geler.
      let waited = 0;
      if (p && p.importing) setBootMsg("⏳ Premier import de tes tickets en cours… (≈20–30 s, uniquement au démarrage)");
      while (p && p.importing && !p.importError && waited < 180000) {
        await new Promise((r) => setTimeout(r, 2000));
        waited += 2000;
        setBootMsg(`⏳ Import des tickets en cours… ${Math.round(waited / 1000)} s (≈20–30 s au démarrage, ne ferme pas la page)`);
        p = await fetchPortfolio({});
      }
      setBootMsg("");
      setData(p); setDossiers(d.dossiers || {});
      if (p && p.importError && !(p.issues && p.issues.length)) setError(`Import impossible : ${p.importError}`);
      if (refresh || full) {
        const ch = Array.isArray(p.changed) ? p.changed : [];
        if (ch.length) {
          setChangedKeys(new Set(ch));
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setChangedKeys(null), 30000);
        } else {
          setChangedKeys(null);
        }
        // Notifications : sur une actualisation auto (silencieuse), on explique CE QUI a changé
        // (qui / quoi / quand), en lisant le changelog — la MÊME source que « Historique & temps ».
        if (silent && ch.length) {
          const byKey = new Map((p.issues || []).map((i) => [i.cle, i]));
          const prevByKey = new Map((data?.issues || []).map((i) => [i.cle, i]));
          notify(`🔔 ${ch.length} ticket(s) modifié(s) dans Jira`, ch.slice(0, 4).join(", "));
          const mkId = (k) => `${k}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const fallback = (k) => {
            const i = byKey.get(k) || {}; const old = prevByKey.get(k); let action = "Mis à jour";
            if (old && old.statut !== i.statut) action = `Statut : ${old.statut} → ${i.statut}`;
            else if (old && (old.assigne || "") !== (i.assigne || "")) action = `Réassigné à ${i.assigne || "Non assigné"}`;
            return { id: mkId(k), cle: k, resume: i.resume || "Ticket", who: "", action, kind: "update", statut: i.statut || "", at: Date.now(), read: false };
          };
          fetchChangesSummary(ch)
            .then((res) => {
              if (res.configured === false || !(res.items || []).length) { setNotifs((prev) => [...ch.map(fallback), ...prev].slice(0, 60)); return; }
              const sum = new Map(res.items.map((it) => [it.cle, it]));
              const entries = ch.map((k) => {
                const i = byKey.get(k) || {}; const s = sum.get(k);
                if (!s || !s.action) return fallback(k);
                return { id: mkId(k), cle: k, resume: i.resume || "Ticket", who: s.who || "", action: s.action, kind: s.kind || "update", statut: i.statut || "", at: s.at || Date.now(), read: false };
              });
              setNotifs((prev) => [...entries, ...prev].slice(0, 60));
            })
            .catch(() => setNotifs((prev) => [...ch.map(fallback), ...prev].slice(0, 60)));
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

  // La recherche filtre le Cockpit : si on tape depuis un autre onglet, on y bascule pour voir les résultats.
  useEffect(() => { if (query.trim() && tab !== "cockpit") setTab("cockpit"); /* eslint-disable-next-line */ }, [query]);

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

  const openNotif = useCallback((cle) => {
    const it = issues.find((i) => i.cle === cle);
    if (it) setTicket(it);
    setNotifs((prev) => prev.map((n) => (n.cle === cle ? { ...n, read: true } : n)));
  }, [issues]);
  const markAllNotifRead = useCallback(() => setNotifs((prev) => prev.map((n) => ({ ...n, read: true }))), []);

  const removeDev = useCallback(async (name) => {
    try { const r = await deleteDevFiche(name); setDeletedDevs(r.deleted || []); showToast(`Fiche de ${name} masquée. Restaurable depuis la fiche.`); }
    catch (e) { showToast("Échec : " + e.message); }
  }, [showToast]);
  const restoreDev = useCallback(async (name) => {
    try { const r = await restoreDevFiche(name); setDeletedDevs(r.deleted || []); showToast(`Fiche de ${name} restaurée.`); }
    catch (e) { showToast("Échec : " + e.message); }
  }, [showToast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((i) => {
      if (dossier !== "Tous" && i.dossier !== dossier) return false;
      if (statut !== "Tous" && i.statut !== statut) return false;
      if (onlyLate && !i.enRetard) return false;
      if (onlyMine && !i.mine) return false;
      if (onlyFlagged && !i.flagged) return false;
      const workers = (i.contributors && i.contributors.length) ? i.contributors : [i.assigne || "Non assigné"];
      if (person !== "Tous" && !workers.includes(person)) return false;
      if (priorite !== "Tous" && (i.priorite || "—") !== priorite) return false;
      if (q) {
        const hay = `${i.cle} ${i.resume} ${i.dossier} ${i.assigne || ""} ${i.dev || ""} ${workers.join(" ")} ${(i.labels || []).join(" ")} ${i.statut} ${i.statutJira || ""} ${i.priorite || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, dossier, statut, onlyLate, onlyMine, onlyFlagged, person, priorite, query]);

  // Compteurs des pastilles : reflètent la COMBINAISON de filtres en cours (sauf la dimension comptée),
  // pour qu'un compteur ne contredise jamais le tableau (ex. plus de "26" alors que le tableau est vide).
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const workers = (i) => (i.contributors && i.contributors.length) ? i.contributors : [i.assigne || "Non assigné"];
    const hay = (i) => `${i.cle} ${i.resume} ${i.dossier} ${i.assigne || ""} ${i.dev || ""} ${workers(i).join(" ")} ${(i.labels || []).join(" ")} ${i.statut} ${i.statutJira || ""} ${i.priorite || ""}`.toLowerCase();
    const ok = (i, except) => {
      if (except !== "dossier" && dossier !== "Tous" && i.dossier !== dossier) return false;
      if (except !== "statut" && statut !== "Tous" && i.statut !== statut) return false;
      if (except !== "late" && onlyLate && !i.enRetard) return false;
      if (except !== "mine" && onlyMine && !i.mine) return false;
      if (except !== "flagged" && onlyFlagged && !i.flagged) return false;
      if (except !== "person" && person !== "Tous" && !workers(i).includes(person)) return false;
      if (except !== "priorite" && priorite !== "Tous" && (i.priorite || "—") !== priorite) return false;
      if (except !== "query" && q && !hay(i).includes(q)) return false;
      return true;
    };
    const dossierC = {}, statutC = {}, prioriteC = {}, personC = {};
    issues.forEach((i) => {
      if (ok(i, "dossier")) dossierC[i.dossier] = (dossierC[i.dossier] || 0) + 1;
      if (ok(i, "statut")) statutC[i.statut] = (statutC[i.statut] || 0) + 1;
      if (ok(i, "priorite")) { const p = i.priorite || "—"; prioriteC[p] = (prioriteC[p] || 0) + 1; }
      if (ok(i, "person")) workers(i).forEach((w) => { personC[w] = (personC[w] || 0) + 1; });
    });
    return {
      dossier: dossierC, statut: statutC, priorite: prioriteC, person: personC,
      dossierAll: issues.filter((i) => ok(i, "dossier")).length,
      statutAll: issues.filter((i) => ok(i, "statut")).length,
      personAll: issues.filter((i) => ok(i, "person")).length,
      prioriteAll: issues.filter((i) => ok(i, "priorite")).length,
      late: issues.filter((i) => ok(i, "late") && i.enRetard).length,
      mine: issues.filter((i) => ok(i, "mine") && i.mine).length,
      flagged: issues.filter((i) => ok(i, "flagged") && i.flagged).length,
    };
  }, [issues, dossier, statut, onlyLate, onlyMine, onlyFlagged, person, priorite, query]);

  const diag = data?.diagnostic;

  return (
    <div className="wrap">
      <Header kpis={data?.kpis} source={data?.source} generatedAt={data?.generatedAt}
        loading={loading} me={data?.me} onRefresh={() => load(true)}
        onLogout={() => { clearToken(); setAuthed(false); }}
        query={query} onQuery={setQuery}
        notifOn={notifOn} onToggleNotifOn={notifToggle}
        notifs={notifs} onOpenNotif={openNotif} onMarkAllRead={markAllNotifRead}
        issues={issues} onOpenTicket={setTicket} />

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
      {bootMsg && <div className="banner" style={{ background: "var(--hd-grad)", color: "#fff", borderColor: "transparent" }}>{bootMsg}</div>}
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
            <button className={`reload-btn ${loading ? "spin" : ""}`} onClick={() => load(false, true)} disabled={loading}
              title="Tout recharger : réimporte l'intégralité des tickets depuis Jira" aria-label="Tout recharger">
              <span className="reload-ico">⟳</span>
              <span className="reload-txt">Tout recharger</span>
            </button>
          </div>
          <div className="panel">
            <Filters issues={issues} counts={counts} statuts={STATUTS} dossier={dossier} statut={statut}
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
      {tab === "encours" && <EnCours issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}
      {tab === "morning" && <Morning issues={issues} onTicket={setTicket} />}
      {tab === "devs" && <Developers issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}
      {tab === "meetings" && <Meetings issues={issues} />}
      {tab === "cra" && <CRA onTicket={setTicket} />}
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
