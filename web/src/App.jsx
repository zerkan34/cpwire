import React, { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import { fetchPortfolio, fetchDossiers, getToken, clearToken, fetchDeletedDevs, deleteDevFiche, restoreDevFiche, fetchChangesSummary,
  getInviteFromUrl, stripInviteFromUrl, fetchSession, createInvite, fetchProjets, ping, fetchAdminUsers } from "./api.js";
import { saveSnapshot, loadSnapshot } from "./snapshot.js";
import { ReadOnlyContext } from "./readonly.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import Home from "./components/Home.jsx";
import PosteCommandement from "./components/PosteCommandement.jsx";
import MissionControl from "./components/MissionControl.jsx";
import { computeFacts } from "./facts.js";
import Filters from "./components/Filters.jsx";
import IssueTable from "./components/IssueTable.jsx";
import ActivityFeed from "./components/ActivityFeed.jsx";
import StaleTickets from "./components/StaleTickets.jsx";
import SlaAlert from "./components/SlaAlert.jsx";
import DeadlineRadar from "./components/DeadlineRadar.jsx";
import Sante from "./components/Sante.jsx";
import Digest from "./components/Digest.jsx";
import Charge from "./components/Charge.jsx";
import GanttTool from "./components/GanttTool.jsx";
import QuoteBoard from "./components/QuoteBoard.jsx";
import ExportBar from "./components/ExportBar.jsx";

// ---- Découpage du bundle (code-splitting) ----------------------------------
// Tout ce qui n'est PAS visible au premier écran (tab="cockpit" sub="accueil")
// est chargé à la demande via lazy() : ces composants ne pèsent plus rien sur
// le chargement initial, ils n'arrivent que quand l'onglet/la modale concernée
// s'ouvre réellement. Chacun est rendu sous un <Suspense> (page ou modale).
const Planning = lazy(() => import("./components/Planning.jsx"));
const Explorateur = lazy(() => import("./components/Explorateur.jsx"));
const Signaux = lazy(() => import("./components/Signaux.jsx"));
const Assistant = lazy(() => import("./components/Assistant.jsx"));
const ImportSources = lazy(() => import("./components/ImportSources.jsx"));
const Recette = lazy(() => import("./components/Recette.jsx"));
const Reference = lazy(() => import("./components/Reference.jsx"));
const Projets = lazy(() => import("./components/Projets.jsx"));
const SharePointFiles = lazy(() => import("./components/SharePointFiles.jsx"));
const Hygiene = lazy(() => import("./components/Hygiene.jsx"));
const Admin = lazy(() => import("./components/Admin.jsx"));
const DailyCRModal = lazy(() => import("./components/DailyCRModal.jsx"));
const TicketModal = lazy(() => import("./components/TicketModal.jsx"));
const DossierModal = lazy(() => import("./components/DossierModal.jsx"));
const Client360 = lazy(() => import("./components/Client360.jsx"));
const DeveloperModal = lazy(() => import("./components/DeveloperModal.jsx"));
const DailyRecap = lazy(() => import("./components/DailyRecap.jsx"));
const Developers = lazy(() => import("./components/Developers.jsx"));
const EnCours = lazy(() => import("./components/EnCours.jsx"));
const Recap = lazy(() => import("./components/Recap.jsx"));
const Meetings = lazy(() => import("./components/Meetings.jsx"));
const CRA = lazy(() => import("./components/CRA.jsx"));
const MobileRecap = lazy(() => import("./components/MobileRecap.jsx"));
const ShareFly = lazy(() => import("./components/ShareFly.jsx"));

const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
import InstallPWA from "./components/InstallPWA.jsx";
import MobileHome from "./components/MobileHome.jsx";
import { PILOT_DATA_URI } from "./pilot.js";
import { computeBlockers } from "./blockers.js";

const STATUTS = ["Bloqué", "À faire", "En cours", "Terminé"];

// Repli affiché pendant le chargement à la demande d'une page secondaire (code-splitting).
function PageLoading() {
  return <div className="page-loading" role="status" aria-live="polite"><span className="page-loading-spin" /> Chargement…</div>;
}

// En-tête de page brandé, partagé par toutes les pages (harmonisation visuelle).
function PageHero({ k, title, sub }) {
  return (
    <div className="page-hero">
      {k ? <span className="page-hero-k">{k}</span> : null}
      <h2>{title}</h2>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}

// Salutation contextualisée : heure du jour + prénom + « Re » si reconnexion récente.
const norm360 = (x) => String(x || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
const GREET_NAMES = { groutier: "Guy", fblain: "Fabrice" }; // invités connus (email → prénom), extensible
function greetMessage(role, me) {
  let name = "";
  if (role === "owner") name = "Nikko";
  else {
    const local = String(me || "").split("@")[0].toLowerCase();
    name = GREET_NAMES[local] || (local.replace(/[^a-zàâäéèêëîïôöùûüç]/gi, " ").trim().split(/\s+/)[0] || "");
    if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  const last = Number(localStorage.getItem("cpwire_greet_at") || 0);
  const re = last && (Date.now() - last < 8 * 3600 * 1000);
  localStorage.setItem("cpwire_greet_at", String(Date.now()));
  if (re) return name ? `Re ${name} !` : "Re !";
  const h = new Date().getHours();
  const w = h < 12 ? "Bonjour" : h < 18 ? "Bonne après-midi" : "Bonsoir";
  return name ? `${w} ${name} !` : `${w} !`;
}
const TABS = [
  { id: "cockpit", label: "Pilotage" },
  { id: "explorateur", label: "Explorateur" },
  { id: "atelier", label: "Atelier" },
  { id: "sharefly", label: "ShareFly", annex: true },
];

// Sous-onglets internes à un onglet groupé. Le 1er est l'onglet par défaut à l'ouverture du groupe.
const SUBTABS = {
  // Pilotage = une seule page (le Poste de commandement) : aucun sous-onglet.
  cockpit: [],
  atelier: [
    { id: "morning", label: "Récap" },
    { id: "charge", label: "Charge & capacité" },
    { id: "devs", label: "Développeurs" },
    { id: "gantt", label: "GANTT" },
    { id: "planning", label: "Planning" },
    { id: "cra", label: "CRA" },
    { id: "reunions", label: "Réunions" },
    { id: "reference", label: "Référence" },
    { id: "hygiene", label: "Qualité" },
  ],
};

// Navigation mobile : 4 onglets en barre du bas, le reste dans le tiroir (burger).
const PRIMARY = ["cockpit", "explorateur", "atelier"];
const SECONDARY = [];
// Rôle "consultation" : onglets autorisés (aucun récap, aucune réunion ; la Mémoire est masquée dans Qualité).
const CONSULT_TABS = ["cockpit", "explorateur", "atelier", "sharefly", "signaux"];
const ADMIN_TAB = { id: "admin", label: "Admin" };
const TAB_SHORT = { cockpit: "Pilotage", explorateur: "Explorateur", atelier: "Atelier" };

// Sous-onglets visibles d'un groupe selon le rôle (la Mémoire est réservée à l'owner).
function subsForRole(groupId, role) {
  const subs = SUBTABS[groupId] || [];
  if (role === "owner") return subs;
  const hidden = new Set(["memoire", "recap", "morning", "reunions", "cra"]);
  return subs.filter((s) => !hidden.has(s.id));
}

// Icônes simples (traits) pour la barre du bas et le tiroir — pas d'émojis.
function NavIcon({ id }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (id) {
    case "accueil": return (<svg viewBox="0 0 24 24" {...p}><path d="M4 11.5L12 4l8 7.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>);
    case "tickets": return (<svg viewBox="0 0 24 24" {...p}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" /><line x1="12" y1="7" x2="12" y2="17" strokeDasharray="1.5 2.5" /></svg>);
    case "cockpit": return (<svg viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
    case "encours": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>);
    case "recap": return (<svg viewBox="0 0 24 24" {...p}><line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="0.7" /><circle cx="4" cy="12" r="0.7" /><circle cx="4" cy="18" r="0.7" /></svg>);
    case "morning": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>);
    case "devs": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>);
    case "outils": return (<svg viewBox="0 0 24 24" {...p}><circle cx="8.5" cy="8" r="3.2" /><path d="M3 19c0-3 2.6-4.6 5.5-4.6" /><path d="M14.8 14.2l4.5 4.5M19.3 14.7l-4.5 4.5" /><circle cx="16.8" cy="9" r="2.4" /></svg>);
    case "meetings": return (<svg viewBox="0 0 24 24" {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="9.5" x2="21" y2="9.5" /><line x1="8" y1="3" x2="8" y2="6" /><line x1="16" y1="3" x2="16" y2="6" /></svg>);
    case "cra": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5M9.5 2.5h5M12 2.5v2" /></svg>);
    case "history": return (<svg viewBox="0 0 24 24" {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2" /><path d="M3 4.5V9h4.5" /><path d="M12 8v4l3 2" /></svg>);
    case "recette": return (<svg viewBox="0 0 24 24" {...p}><path d="M9 11.5l2.2 2.2L15 9.5" /><path d="M12 3l7 3v5c0 4.2-2.8 7.7-7 9-4.2-1.3-7-4.8-7-9V6l7-3z" /></svg>);
    case "qualite": return (<svg viewBox="0 0 24 24" {...p}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>);
    case "comptesrendus": return (<svg viewBox="0 0 24 24" {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v4h4" /><line x1="9" y1="12" x2="16" y2="12" /><line x1="9" y1="16" x2="16" y2="16" /></svg>);
    case "hygiene": return (<svg viewBox="0 0 24 24" {...p}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>);
    case "qualite": return (<svg viewBox="0 0 24 24" {...p}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>);
    case "memoire": return (<svg viewBox="0 0 24 24" {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M19 17H6a2 2 0 0 0-2 2" /><line x1="8" y1="7" x2="15" y2="7" /></svg>);
    case "admin": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" /><path d="M18 4l1 1.6L20.8 6l-1.3 1.2.3 1.8L18 8.1 16.2 9l.3-1.8L15.2 6l1.8-.4z" /></svg>);
    case "cadence": return (<svg viewBox="0 0 24 24" {...p}><path d="M3 12h3l2-6 4 14 3-9 2 4h4" /></svg>);
    case "referentiel": return (<svg viewBox="0 0 24 24" {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></svg>);
    case "projets": return (<svg viewBox="0 0 24 24" {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" /><line x1="3" y1="12" x2="21" y2="12" /></svg>);
    case "documents": return (<svg viewBox="0 0 24 24" {...p}><path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M13 3v5h5" /><path d="M8.5 13l2 2 3.5-3.5" /></svg>);
    default: return null;
  }
}

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
  const [role, setRole] = useState("owner");
  const [presence, setPresence] = useState([]);       // (owner) comptes consultation actuellement en ligne
  const seenOnlineRef = useRef(null);                  // suivi pour détecter les nouvelles connexions
  const [invite] = useState(getInviteFromUrl());           // jeton d'invitation présent dans l'URL (le cas échéant)
  const [readOnly, setReadOnly] = useState(getToken().startsWith("g.")); // estimation immédiate, confirmée par /api/session
  const [tab, setTab] = useState("cockpit");
  const [sub, setSub] = useState("poste");   // sous-onglet actif dans un onglet groupé
  const pwaGoRef = useRef(false);              // raccourci PWA (?go=) appliqué une seule fois
  const [drawer, setDrawer] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);   // feuille « accès rapide » (bouton central mobile)
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(max-width: 768px)");
    const h = () => setIsMobile(m.matches);
    m.addEventListener ? m.addEventListener("change", h) : m.addListener(h);
    return () => { m.removeEventListener ? m.removeEventListener("change", h) : m.removeListener(h); };
  }, []);
  const [data, setData] = useState(null);
  const [dossiers, setDossiers] = useState({});
  const [deletedDevs, setDeletedDevs] = useState([]);
  const [error, setError] = useState("");
  const [needsConfig, setNeedsConfig] = useState(false);
  const [bootMsg, setBootMsg] = useState("");
  const [diagBannerOn, setDiagBannerOn] = useState(true);
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
  const [sel360, setSel360] = useState(null);      // objet client pour la Fiche 360
  const [projetsData, setProjetsData] = useState(null);
  const [devFiche, setDevFiche] = useState(null);  // fiche développeur (nom)
  const [toast, setToast] = useState("");
  const [greet, setGreet] = useState("");
  const [showGreetPop, setShowGreetPop] = useState(false);
  const [persistent, setPersistent] = useState(null);
  const greetedRef = useRef(false);
  const [showTop, setShowTop] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifOn, setNotifOn] = useState(() => { try { return localStorage.getItem("cpwire_notif") === "1"; } catch { return false; } });
  const toastTimer = useRef(null);
  const highlightTimer = useRef(null);
  const inFlight = useRef(false);
  const prevFlagged = useRef(null);

  // Déclaré tôt : utilisé par des callbacks plus bas (évite une erreur d'initialisation au rendu).
  const issues = data?.issues || [];
  // SOURCE DE VÉRITÉ UNIQUE des chiffres par dossier (live Jira). Cf. facts.js.
  const facts = useMemo(() => computeFacts(issues), [issues]);
  const inactiveDevs = data?.inactiveDevs || [];

  const resetFilters = useCallback(() => {
    setDossier("Tous"); setStatut("Tous"); setOnlyLate(false); setOnlyMine(false); setOnlyFlagged(false);
    setQuery(""); setPerson("Tous"); setPriorite("Tous");
  }, []);

  // KPI du header (Total / À faire / En cours / Bloqués / En retard / Terminés) cliquables :
  // on remet les filtres à zéro, on applique le filtre demandé et on bascule sur le cockpit.
  const applyKpi = useCallback((kind) => {
    resetFilters();
    if (kind === "late") setOnlyLate(true);
    else if (kind !== "total") setStatut(kind);
    setTab("cockpit");
    window.scrollTo({ top: 0 });
  }, [resetFilters]);

  // Bouton « CR du jour » : visible uniquement en semaine (lundi→vendredi) à partir de 17h30.
  // Une minuterie réévalue chaque minute pour qu'il apparaisse tout seul, sans recharger.
  const [dailyCrOpen, setDailyCrOpen] = useState(false);
  // Import sources : OneNote, Excel, fichier query/CSV… cp|WIRE lit la source,
  // montre ce qui a changé + un récap, puis met à jour sur validation (modale dédiée).
  const [importOpen, setImportOpen] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNowTick(Date.now()), 60000); return () => clearInterval(t); }, []);
  const showDailyCr = useMemo(() => {
    const d = new Date(nowTick); const day = d.getDay(); const mins = d.getHours() * 60 + d.getMinutes();
    return day >= 1 && day <= 5 && mins >= 17 * 60 + 30; // lun(1)→ven(5), ≥ 17:30
  }, [nowTick]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }, []);

  // Génère un lien d'invitation en lecture seule, le copie dans le presse-papier.
  const makeInvite = useCallback(async () => {
    const raw = window.prompt("Durée de validité du lien d'invitation, en heures (ex. 24 = 1 jour, 168 = 1 semaine) :", "24");
    if (raw === null) return;
    const hours = Math.min(Math.max(parseInt(raw, 10) || 24, 1), 720);
    try {
      const r = await createInvite(hours);
      const link = `${window.location.origin}/?invite=${encodeURIComponent(r.token)}`;
      const until = new Date(r.expiresAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      try {
        await navigator.clipboard.writeText(link);
        showToast(`🔗 Lien d'invitation (lecture seule) copié — valable jusqu'au ${until}.`);
      } catch {
        window.prompt(`Copie automatique impossible. Copie ce lien (valable jusqu'au ${until}) :`, link);
      }
    } catch (e) {
      console.error("[App]", e && e.message ? e.message : e); showToast("Échec de création du lien : " + e.message); }
  }, [showToast]);

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
      if (p && Array.isArray(p.issues) && p.issues.length) saveSnapshot(p); // cache hors-ligne (fail-safe)
      fetchProjets().then(setProjetsData).catch(() => {});
      if (p && p.importError && !(p.issues && p.issues.length)) setError(`Import impossible : ${p.importError}`);
      if (refresh || full) {
        const ch = Array.isArray(p.changed) ? p.changed : [];
        if (ch.length) {
          setChangedKeys(new Set(ch));
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setChangedKeys(null), 120000);
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
    } catch (e) {
      console.error("[App]", e && e.message ? e.message : e); setError(e.message); if (e.needsConfig) setNeedsConfig(true);
      try { const snap = await loadSnapshot(); if (snap) setData((cur) => cur || snap); } catch { /* pas de cache */ } }
    finally { setLoading(false); inFlight.current = false; }
  }, [showToast]);

  useEffect(() => { if (authed) loadSnapshot().then((snap) => { if (snap) setData((cur) => cur || snap); }).catch(() => {}); }, [authed]);
  useEffect(() => { if (authed) load(false).then(() => load(true, false, true)).catch(() => {}); }, [authed, load]);
  useEffect(() => { if (authed) fetchDeletedDevs().then((r) => setDeletedDevs(r.deleted || [])).catch(() => {}); }, [authed]);

  // Confirme le rôle auprès du serveur (lecture seule pour un invité).
  useEffect(() => {
    if (!authed) return;
    const fire = (r, m) => {
      if (greetedRef.current) return;
      greetedRef.current = true;
      setGreet(greetMessage(r, m));
      setShowGreetPop(true);
      setTimeout(() => setShowGreetPop(false), 3800);
    };
    fetchSession().then((s) => {
      setRole(s.role); setReadOnly(s.role !== "owner");
      setPersistent(typeof s.persistent === "boolean" ? s.persistent : null);
      fire(s.role, s.me);
    }).catch(() => fire(role, data?.me));
    const t = setTimeout(() => fire(role, data?.me), 2500); // filet desktop : si la session traîne/échoue, on salue quand même
    return () => clearTimeout(t);
  }, [authed]);

  // Charge les fiches 360 dès le démarrage (indépendamment du portefeuille).
  useEffect(() => { fetchProjets().then(setProjetsData).catch(() => {}); }, []);

  // Bannière d'import : visible au démarrage puis s'efface.
  useEffect(() => {
    const dg = data?.diagnostic;
    if (dg && dg.projetsSansTicket && dg.projetsSansTicket.length) {
      setDiagBannerOn(true);
      const t = setTimeout(() => setDiagBannerOn(false), 8000);
      return () => clearTimeout(t);
    }
  }, [data]);

  // Si le rôle consultation a un onglet interdit sélectionné, on revient au Cockpit.
  useEffect(() => { if (role === "consultation" && !CONSULT_TABS.includes(tab)) setTab("cockpit"); }, [role, tab]);

  // À chaque changement d'onglet groupé, on positionne le sous-onglet sur le 1er autorisé.
  useEffect(() => { const subs = subsForRole(tab, role); setSub(subs.length ? subs[0].id : ""); }, [tab, role]);

  // Raccourcis PWA (long-appui sur l'icône) : « /?go=morning » ouvre directement
  // la bonne page. Appliqué une seule fois, après que le rôle (et donc les
  // sous-onglets autorisés) soit connu.
  useEffect(() => {
    if (pwaGoRef.current || !role) return;
    let go = "";
    try { go = new URLSearchParams(window.location.search).get("go") || ""; } catch { /* ignoré */ }
    if (!go) { pwaGoRef.current = true; return; }
    pwaGoRef.current = true;
    const grp = Object.keys(SUBTABS).find((g) => SUBTABS[g].some((s) => s.id === go));
    if (grp && subsForRole(grp, role).some((s) => s.id === go)) {
      setTab(grp);
      setTimeout(() => setSub(go), 0); // après le reset de sous-onglet déclenché par setTab
    }
    try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignoré */ }
  }, [role]);

  // Battement de cœur (présence) : permet au super-admin de voir qui est en ligne.
  useEffect(() => {
    if (!authed) return;
    ping().catch(() => {});
    const id = setInterval(() => ping().catch(() => {}), 30000);
    return () => clearInterval(id);
  }, [authed]);

  // (Owner) Présence des invités + alerte « quelqu'un vient de se connecter ».
  useEffect(() => {
    if (!authed || role !== "owner") return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetchAdminUsers();
        if (!alive) return;
        const online = (r.users || []).filter((u) => u.online);
        setPresence(online);
        const now = new Set(online.map((u) => u.email));
        const prev = seenOnlineRef.current;
        if (prev) {                                   // on n'alerte pas au tout premier sondage
          for (const u of online) {
            if (!prev.has(u.email)) {
              showToast(`👤 ${u.email} vient de se connecter`);
              notify("cp|WIRE — connexion", `${u.email} vient de se connecter au cockpit`);
              setNotifs((p) => [{ id: "login-" + u.email + "-" + Date.now(), cle: "👤 Connexion", resume: u.email, who: "", action: "vient de se connecter", kind: "login", statut: "", at: Date.now(), read: false }, ...p].slice(0, 60));
            }
          }
        }
        seenOnlineRef.current = now;
      } catch { /* admin indisponible : on ignore */ }
    };
    poll();
    const id = setInterval(poll, 25000);
    return () => { alive = false; clearInterval(id); };
  }, [authed, role, showToast]);

  // La recherche filtre le Cockpit : si on tape depuis un autre onglet, on y bascule pour voir les résultats.
  useEffect(() => { if (query.trim()) { setTab("explorateur"); } /* eslint-disable-next-line */ }, [query]);

  // Actualisation automatique EN CONTINU (toutes les 60 s), tant qu'on est connecté —
  // incrémentale et silencieuse : ne récupère dans Jira que les tickets modifiés.
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => { load(true, false, true); }, 40000);
    return () => clearInterval(id);
  }, [authed, load]);

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
    catch (e) {
      console.error("[App]", e && e.message ? e.message : e); showToast("Échec : " + e.message); }
  }, [showToast]);
  const restoreDev = useCallback(async (name) => {
    try { const r = await restoreDevFiche(name); setDeletedDevs(r.deleted || []); showToast(`Fiche de ${name} restaurée.`); }
    catch (e) {
      console.error("[App]", e && e.message ? e.message : e); showToast("Échec : " + e.message); }
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

  // Libellé clair du filtre courant (titre d'export + en-tête du cockpit).
  const cockpitFilterLabel = useMemo(() => {
    const parts = [];
    if (statut !== "Tous") parts.push(statut);
    if (onlyLate) parts.push("en retard");
    if (onlyMine) parts.push("pour moi");
    if (onlyFlagged) parts.push("flaggés");
    if (dossier !== "Tous") parts.push(dossier);
    if (person !== "Tous") parts.push(person);
    if (priorite !== "Tous") parts.push("priorité " + priorite);
    if (query.trim()) parts.push(`« ${query.trim()} »`);
    return parts.length ? parts.join(" · ") : "Tous les tickets";
  }, [statut, onlyLate, onlyMine, onlyFlagged, dossier, person, priorite, query]);

  // Document HTML de la liste filtrée (pour l'export PDF / téléchargement / e-mail / copie).
  const buildCockpitHtml = useCallback(() => {
    const rows = filtered.map((i) => `<tr><td>${escHtml(i.cle)}</td><td>${escHtml(i.dossier || "")}</td><td>${escHtml(i.resume || "")}</td><td>${escHtml((i.contributors && i.contributors.join(", ")) || i.dev || i.assigne || "")}</td><td>${escHtml(i.echeance || "")}</td><td>${escHtml(i.statutJira || i.statut || "")}${i.enRetard ? " ⚠" : ""}</td></tr>`).join("");
    const title = `Tickets — ${cockpitFilterLabel}`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#1f1d2b;margin:24px}h1{font-size:18px;margin:0 0 2px}small{color:#666}table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#2c2945;color:#fff}tr:nth-child(even) td{background:#f7f6fb}</style></head><body><h1>${escHtml(title)}</h1><small>${filtered.length} ticket(s) · cp|WIRE · ${new Date().toLocaleString("fr-FR")}</small><table><thead><tr><th>Clé</th><th>Dossier</th><th>Résumé</th><th>Sur le ticket</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }, [filtered, cockpitFilterLabel]);

  // Engagement par client (déduit des clés Jira des tickets) : "TMA", "Projet" ou "TMA + Projet".
  const engagementByDossier = useMemo(() => {
    const m = {};
    issues.forEach((i) => { const d = i.dossier || "Autre"; (m[d] ||= new Set()).add(i.engagement || "—"); });
    const out = {};
    Object.entries(m).forEach(([d, set]) => { set.delete("—"); const a = [...set]; out[d] = a.length === 0 ? "" : a.length === 1 ? a[0] : "TMA + Projet"; });
    return out;
  }, [issues]);
  // Correspondance nom de client (cockpit) -> objet complet de la Fiche 360 (données /api/projets).
  const c360Map = useMemo(() => {
    const m = new Map();
    (projetsData?.clients || []).forEach((c) => m.set(norm360(c.client), c));
    return m;
  }, [projetsData]);
  const can360 = useCallback((d) => c360Map.has(norm360(d)), [c360Map]);
  const open360 = useCallback((d) => { const c = c360Map.get(norm360(d)); if (c) setSel360(c); }, [c360Map]);
  // Ouvre la Fiche 360 si on a les données du client ; sinon repli sur la fiche dossier classique.
  const openClient = useCallback((d) => {
    const c = c360Map.get(norm360(d));
    if (c) setSel360(c); else setFiche({ nom: d });
  }, [c360Map]);
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
  // L'accueil bascule sur l'écran natif MobileHome UNIQUEMENT sur petit écran (largeur),
  // jamais à cause du mode PWA installé : sur ordinateur (plein écran), Pilotage = dashboard desktop comme les autres pages.
  const pwaAccueil = isMobile && tab === "cockpit" && (sub === "accueil" || sub === "cote");
  const mhWarning = (diag && diag.projetsSansTicket?.length > 0)
    ? `Import : ${diag.totalImporte} tickets. ⚠ Projet(s) configuré(s) sans aucun ticket importé : ${diag.projetsSansTicket.join(", ")} — vérifie la clé du projet et tes droits d'accès dans Jira.`
    : "";
  const mhDate = useMemo(() => new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), []);
  // Badge Radar = points bloquants graves issus de Jira (même calcul que le voyant MASTER WARNING).
  const mhBlockers = useMemo(() => { try { return computeBlockers(issues); } catch { return []; } }, [issues]);
  const mhRadar = useMemo(() => {
    const crit = mhBlockers.filter((b) => b && b.severity === "critique").length;
    return crit || mhBlockers.length;
  }, [mhBlockers]);

  // Onglets selon le rôle : owner = tout + Admin ; consultation = whitelist ; guest (ancien) = tout.
  const visibleTabs = role === "consultation" ? TABS.filter((t) => CONSULT_TABS.includes(t.id))
    : TABS;
  const primaryTabs = PRIMARY;
  const secondaryTabs = role === "consultation" ? SECONDARY.filter((id) => CONSULT_TABS.includes(id))
    : SECONDARY;
  const tabLabel = (id) => ([...TABS, ADMIN_TAB].find((t) => t.id === id) || {}).label;
  const canCR = role === "owner";

  // Garde-fou d'authentification : sans jeton valide, on affiche l'écran de connexion
  // (au lieu de rester bloqué sur la barre de chargement sans rien proposer).
  if (!authed) return (
    <Login
      invite={invite}
      onSuccess={(d) => {
        if (invite || (d && d.role === "guest")) { stripInviteFromUrl(); setReadOnly(true); }
        setAuthed(true);
      }}
    />
  );

  return (
    <ReadOnlyContext.Provider value={readOnly}>
    <div className={`wrap tab-${tab}${pwaAccueil ? " pwahome" : ""}`}>
      <Header kpis={data?.kpis} source={data?.source} generatedAt={data?.generatedAt} syncedAt={data?.syncedAt}
        loading={loading} me={data?.me} onRefresh={() => load(true)} onReloadAll={() => load(false, true)}
        onLogout={() => { clearToken(); setAuthed(false); }}
        role={role} presence={presence} onPresence={() => setTab("admin")}
        query={query} onQuery={setQuery}
        notifOn={notifOn} onToggleNotifOn={notifToggle}
        notifs={notifs} onOpenNotif={openNotif} onMarkAllRead={markAllNotifRead}
        issues={issues} onOpenTicket={setTicket} onOpen360={open360} onDev={setDevFiche} onBurger={() => setDrawer(true)}
        tab={tab} pageLabel={tabLabel(tab)}
        onKpi={applyKpi} activeKpi={tab === "outils" && sub === "portefeuille" ? (onlyLate ? "late" : (statut !== "Tous" ? statut : (dossier === "Tous" && !onlyMine && !onlyFlagged && person === "Tous" && priorite === "Tous" && !query.trim() ? "total" : null))) : null} />

      {role === "owner" ? (
        <div className="owner-bar">
          {greet && <span className="greet-inline">{greet}</span>}
          {persistent !== null && (
            <span className={`mem-badge ${persistent ? "ok" : "warn"}`}
              title={persistent
                ? "La mémoire de Natacha et les données sont sauvegardées sur une base durable — conservées après chaque redéploiement."
                : "Données éphémères : définissez DATABASE_URL (base Neon gratuite) pour conserver la mémoire de Natacha entre les sessions."}>
              {persistent ? "● Mémoire persistante" : "○ Mémoire éphémère"}
            </span>
          )}
          {(() => { const d = new Date(); return d.getHours() > 16 || (d.getHours() === 16 && d.getMinutes() >= 45); })() && (
            <span className="greet-memo" role="note" title="Pense-bête de fin de journée">
              📌 Pense-bête : importer la <b>situation actuelle du SharePoint</b> + les <b>fichiers Excel des projets en cours</b>.
            </span>
          )}
          <button className="btn-line cr-day-btn" onClick={() => setDailyCrOpen(true)} title="Générer le compte rendu du jour (ZIP) à transférer à votre direction">📦 CR du jour</button>
          <button className="btn-line" onClick={() => setImportOpen(true)}
            title="Importer une source (OneNote, Excel, fichier query/CSV…) : cp|WIRE la lit, montre ce qui a changé et met à jour ses chiffres après validation">
            📥 Import sources
          </button>
          <button className="btn-line invite-btn" onClick={() => setTab("admin")} title="Gérer les accès et inviter quelqu'un">👥 Admin & accès</button>
        </div>
      ) : role === "guest" ? (
        <div className="ro-banner">👁 Mode lecture seule — accès invité. Consultation et export uniquement ; aucune modification.</div>
      ) : null}

      {diagBannerOn && diag && diag.projetsSansTicket?.length > 0 && (
        <div className="banner import-warning import-fade">
          Import : {diag.totalImporte} tickets. ⚠ Projet(s) configuré(s) sans aucun ticket importé :
          <b> {diag.projetsSansTicket.join(", ")}</b> — vérifie la clé du projet et tes droits d'accès dans Jira.
        </div>
      )}

      <div className="tabs">
        {visibleTabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""} ${t.annex ? "tab-annex" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "cockpit" && data?.kpis?.mine ? <span className="b">{data.kpis.mine} pour moi</span> : null}
          </button>
        ))}
      </div>

      {subsForRole(tab, role).length > 1 && (
        <div className="subtabs">
          {subsForRole(tab, role).map((s) => (
            <button key={s.id} className={`subtab ${sub === s.id ? "active" : ""}`} onClick={() => setSub(s.id)}>{s.label}{s.id === "activite" && changedKeys && changedKeys.size > 0 && sub !== "activite" && <span className="sub-badge">{changedKeys.size}</span>}</button>
          ))}
        </div>
      )}

      {needsConfig && (
        <div className="banner">
          Jira n'est pas configuré côté serveur. Renseigne <b>JIRA_BASE_URL</b>, <b>JIRA_EMAIL</b> et
          <b> JIRA_API_TOKEN</b> dans <b>server/.env</b>, puis relance le serveur. Aucune donnée fictive n'est affichée.
        </div>
      )}
      {bootMsg && <div className="banner" style={{ background: "var(--hd-grad)", color: "#fff", borderColor: "transparent" }}>{bootMsg}</div>}
      {error && !needsConfig && <div className="banner">Erreur : {error}</div>}

      <div className="page-anim" key={tab + ":" + sub}>
      <Suspense fallback={<PageLoading />}>
      {tab === "cockpit" && !["recette", "activite", "documents"].includes(sub) && (
        isMobile ? (
          <MobileHome
            build="stable-v416"
            source={data?.source || "Jira"}
            whenText={data?.generatedAt ? `Données Jira au ${new Date(data.generatedAt).toLocaleString("fr-FR")}` : ""}
            pct={data?.kpis?.avancement || 0}
            valides={data?.kpis?.valides ?? data?.kpis?.["Terminé"] ?? Math.round((data?.kpis?.total || 0) * (data?.kpis?.avancement || 0) / 100)}
            total={data?.kpis?.total || 0}
            dateLabel={mhDate}
            notif={notifs?.length || 0}
            alertCount={notifs?.length || 0}
            radarCount={mhRadar}
            warningText={mhWarning}
            avatarUri={PILOT_DATA_URI}
            onSearch={() => setQuickOpen(true)}
            onAvatar={() => window.dispatchEvent(new CustomEvent("cpwire-pilot"))}
            onBell={() => window.dispatchEvent(new CustomEvent("cpwire-pilot"))}
            onRadar={() => window.dispatchEvent(new CustomEvent("cpwire-pilot-ask", { detail: { prompt: "Qu'est-ce qui est bloqué en ce moment sur le portefeuille ?" } }))}
            onAlerts={() => window.dispatchEvent(new CustomEvent("cpwire-pilot-ask", { detail: { prompt: "Quelles sont les alertes du jour : tickets en retard ou en attente ?" } }))}
            onTeam={() => { setTab("atelier"); setTimeout(() => setSub("devs"), 0); }}
            onRefresh={() => load(true)}
            onSync={() => load(true, true)}
            onCR={() => setDailyCrOpen(true)}
            onImport={() => setImportOpen(true)}
            onMemo={() => setImportOpen(true)}
            onAdmin={() => setTab("admin")}
          />
        ) : (
          <PosteCommandement
            facts={facts}
            issues={issues}
            changedKeys={changedKeys}
            engagement={engagementByDossier}
            onClient={openClient}
            onTicket={setTicket}
            onDev={setDevFiche}
            goTo={(t, sb) => { setTab(t); setTimeout(() => setSub(sb), 0); }}
          />
        )
      )}
      {/* Signaux : plus un onglet — atteignable en drill depuis les KPI du Poste. */}
      {tab === "signaux" && (
        <>
          <PageHero k="Signaux" title="Signaux" sub="Risque, cohérence, projections, stagnation et SLA." />
          <Signaux issues={issues} onTicket={setTicket} onClient={openClient} changedKeys={changedKeys} />
        </>
      )}
      {tab === "explorateur" && (
        <>
          <PageHero k="Explorateur" title="Explorateur" sub="Tickets, flux, figés et suivi projets — une seule surface, mêmes facettes." />
          <Explorateur issues={issues} facts={facts} loading={loading} externalQuery={query} onTicket={setTicket} onDev={setDevFiche} onClient={openClient} changedKeys={changedKeys} />
        </>
      )}
      {tab === "cockpit" && sub === "activite" && (
        <>
          <PageHero k="Cockpit" title="Activité" sub="Les tickets actifs et les mouvements Jira récents." />
          <EnCours issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} changedKeys={changedKeys} />
        </>
      )}
      {tab === "atelier" && sub === "morning" && (isMobile
        ? <MobileRecap issues={issues} syncedAt={data?.syncedAt || data?.generatedAt} onTicket={setTicket} onBack={() => { setTab("cockpit"); setSub(""); }} />
        : <Recap issues={issues} canCR={canCR} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} inactiveDevs={inactiveDevs} />
      )}
      {tab === "atelier" && sub === "devs" && <Developers issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} inactiveDevs={inactiveDevs} inactiveMonths={data?.inactiveMonths || 2} onMarkLeft={removeDev} onRestoreDev={restoreDev} />}
      {tab === "atelier" && sub === "charge" && (
        <>
          <PageHero k="Atelier" title="Charge & capacité" sub="Qui porte quoi, qui est en surcharge, qui a de la marge." />
          <Charge onDev={setDevFiche} />
        </>
      )}
      {tab === "atelier" && sub === "reunions" && <Meetings issues={issues} />}
      {tab === "atelier" && sub === "cra" && (<><PageHero k="Atelier" title="CRA — compte rendu d'activité" sub="Temps saisi par personne et par projet (import Excel)." /><CRA onTicket={setTicket} /></>)}
      {tab === "atelier" && sub === "gantt" && (<><PageHero k="Atelier" title="GANTT" sub="Choisis un client et un projet, puis construis ton planning à la charte Armonie." /><GanttTool dossiers={Object.keys(facts?.byDossier || {})} /></>)}
      {tab === "atelier" && sub === "planning" && (<><PageHero k="Atelier" title="Planning" sub="Importe un planning fourni : cp|WIRE l'analyse et le réaffiche à la charte." /><Planning /></>)}
      {tab === "cockpit" && sub === "recette" && <Recette issues={issues} facts={facts} onTicket={setTicket} />}
      {tab === "atelier" && sub === "reference" && (
        <>
          <PageHero k="Atelier" title="Référence" sub="Le cœur de connaissance : annuaire programmes ↔ tickets, analyse du portefeuille, mémoire d'équipe." />
          <Reference issues={issues} role={role} onTicket={setTicket} onDev={setDevFiche} />
        </>
      )}
      {tab === "cockpit" && sub === "documents" && <SharePointFiles />}
      {tab === "atelier" && sub === "hygiene" && <Hygiene issues={issues} onTicket={setTicket} />}
      {tab === "admin" && role === "owner" && <Admin />}
      {tab === "sharefly" && <ShareFly />}

      </Suspense>
      </div>

      <div className="foot">cp|WIRE · {data?.me ? `connecté en tant que ${data.me} · ` : ""}{data?.source || ""}</div>

      {devFiche && (
        <Suspense fallback={null}>
          <DeveloperModal devName={devFiche} allIssues={issues}
            deleted={deletedDevs.includes(devFiche)}
            onDelete={() => removeDev(devFiche)} onRestore={() => restoreDev(devFiche)}
            onRefresh={() => load(true, false, true)}
            onClose={() => setDevFiche(null)} onTicket={setTicket} />
        </Suspense>
      )}
      {fiche && (
        <Suspense fallback={null}>
          <DossierModal nom={fiche.nom} fiche={dossiers[fiche.nom]} onClose={() => setFiche(null)}
            onSaved={(nom, saved) => setDossiers((d) => ({ ...d, [nom]: saved }))} />
        </Suspense>
      )}
      {sel360 && (
        <Suspense fallback={null}>
          <Client360 c={sel360} issues={issues} facts={facts} canCR={canCR} onClose={() => setSel360(null)} onTicket={setTicket} onDev={setDevFiche} />
        </Suspense>
      )}
      {ticket && (
        <Suspense fallback={null}>
          <TicketModal ticket={ticket} onClose={() => setTicket(null)} onPushed={() => load(true)} />
        </Suspense>
      )}
      {dailyCrOpen && (
        <Suspense fallback={null}>
          <DailyCRModal issues={issues} onClose={() => setDailyCrOpen(false)} />
        </Suspense>
      )}

      {showTop && <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Remonter en haut">↑</button>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <InstallPWA />

      {/* ---- Nav (mobile) : Accueil · ✚ · Outils ---- */}
      <nav className="cockpit-nav" aria-label="Navigation principale">
        <div className="cnav-shell">
          <button className={`cnav-tab ${tab === "cockpit" && (sub === "accueil" || sub === "cote") ? "active" : ""}`}
            onClick={() => { setTab("cockpit"); setSub("cote"); window.scrollTo({ top: 0 }); }}>
            <span className="cnav-ic" aria-hidden="true"><NavIcon id="accueil" /></span><span className="cnav-lb">Accueil</span>
          </button>
          <button className="cnav-plus" aria-label="Accès rapide" onClick={() => setQuickOpen(true)}>
            <span className="cnav-plus-in"><span className="cnav-plus-ic">+</span></span>
          </button>
          <button className={`cnav-tab ${tab === "atelier" ? "active" : ""}`}
            onClick={() => { setTab("atelier"); window.scrollTo({ top: 0 }); }}>
            <span className="cnav-ic" aria-hidden="true"><NavIcon id="outils" /></span><span className="cnav-lb">Atelier</span>
          </button>
        </div>
      </nav>

      {/* ---- Feuille « accès rapide » (bouton central) ---- */}
      {quickOpen && (
        <div className="qa-back" onClick={() => setQuickOpen(false)}>
          <div className="qa-sheet" role="dialog" aria-label="Accès rapide" onClick={(e) => e.stopPropagation()}>
            <div className="qa-grab" />
            <div className="qa-title">Accès rapide</div>
            <button className="qa-act" onClick={() => { setQuickOpen(false); load(true); }}>
              <span className="qa-act-ic">⟳</span> Actualiser les données
            </button>
            <div className="qa-lbl">Ouvrir un client</div>
            <div className="qa-clients">
              {Object.keys(facts?.byDossier || {}).filter((d) => can360(d)).map((d) => (
                <button key={d} className="qa-client" onClick={() => { setQuickOpen(false); open360(d); }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Tiroir (burger) : sections secondaires, glisse de la gauche ---- */}
      <div className={`drawer-backdrop ${drawer ? "show" : ""}`} onClick={() => setDrawer(false)} />
      <aside className={`drawer ${drawer ? "open" : ""}`} role="dialog" aria-label="Menu" aria-hidden={!drawer}>
        <div className="drawer-hd"><span>Menu</span><button className="drawer-x" aria-label="Fermer" onClick={() => setDrawer(false)}>✕</button></div>
        <nav className="drawer-nav">
          {secondaryTabs.map((id) => (
              <button key={id} className={`drawer-item ${tab === id ? "active" : ""}`}
                onClick={() => { setTab(id); setDrawer(false); window.scrollTo({ top: 0 }); }}>
                <span className="di-ic" aria-hidden="true"><NavIcon id={id} /></span>{tabLabel(id)}
              </button>
          ))}
        </nav>
        <div className="drawer-foot">cp|WIRE — Armonie Group</div>
      </aside>

      {showGreetPop && greet && (
        <div className="greet-veil" onClick={() => setShowGreetPop(false)}>
          <div className="greet-card" onClick={(e) => e.stopPropagation()}>
            <div className="greet-top" />
            <div className="greet-hd">
              <div className="greet-logo">armo<i>n</i>ie<small>notos <i>phl</i>soft</small></div>
              <button className="greet-x" onClick={() => setShowGreetPop(false)} aria-label="Fermer">×</button>
            </div>
            <div className="greet-bd">
              <div className="greet-wave">👋</div>
              <div className="greet-msg">{greet}</div>
              <div className="greet-sub">Bon pilotage sur cp|WIRE.</div>
            </div>
          </div>
        </div>
      )}
      {importOpen && (
        <Suspense fallback={null}>
          <ImportSources onClose={() => setImportOpen(false)} onApplied={() => load(true)} />
        </Suspense>
      )}
      <Suspense fallback={null}><Assistant /></Suspense>
    </div>
    </ReadOnlyContext.Provider>
  );
}
