import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { fetchPortfolio, fetchDossiers, getToken, clearToken, fetchDeletedDevs, deleteDevFiche, restoreDevFiche, fetchChangesSummary,
  getInviteFromUrl, stripInviteFromUrl, fetchSession, createInvite } from "./api.js";
import { ReadOnlyContext } from "./readonly.js";
import Login from "./components/Login.jsx";
import Header from "./components/Header.jsx";
import Portfolio from "./components/Portfolio.jsx";
import Filters from "./components/Filters.jsx";
import IssueTable from "./components/IssueTable.jsx";
import Recette from "./components/Recette.jsx";
import Referentiel from "./components/Referentiel.jsx";
import Projets from "./components/Projets.jsx";
import Hygiene from "./components/Hygiene.jsx";
import ExportBar from "./components/ExportBar.jsx";
import DailyCRModal from "./components/DailyCRModal.jsx";

const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
  { id: "projets", label: "Suivi projets" },
  { id: "encours", label: "En cours" },
  { id: "recap", label: "Récap du jour" },
  { id: "morning", label: "Brief matin" },
  { id: "devs", label: "Développeurs" },
  { id: "meetings", label: "Réunions" }, { id: "cra", label: "CRA" }, { id: "history", label: "Historique" },
  { id: "recette", label: "Recette" },
  { id: "referentiel", label: "Référentiel" },
  { id: "hygiene", label: "Qualité" },
];

// Navigation mobile : 4 onglets en barre du bas, le reste dans le tiroir (burger).
const PRIMARY = ["cockpit", "encours", "recap", "morning"];
const SECONDARY = ["projets", "recette", "referentiel", "hygiene", "devs", "meetings", "cra", "history"];
const TAB_SHORT = { cockpit: "Cockpit", encours: "En cours", recap: "Récap", morning: "Brief" };

// Icônes simples (traits) pour la barre du bas et le tiroir — pas d'émojis.
function NavIcon({ id }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (id) {
    case "cockpit": return (<svg viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
    case "encours": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>);
    case "recap": return (<svg viewBox="0 0 24 24" {...p}><line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="0.7" /><circle cx="4" cy="12" r="0.7" /><circle cx="4" cy="18" r="0.7" /></svg>);
    case "morning": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>);
    case "devs": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>);
    case "meetings": return (<svg viewBox="0 0 24 24" {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="9.5" x2="21" y2="9.5" /><line x1="8" y1="3" x2="8" y2="6" /><line x1="16" y1="3" x2="16" y2="6" /></svg>);
    case "cra": return (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5M9.5 2.5h5M12 2.5v2" /></svg>);
    case "history": return (<svg viewBox="0 0 24 24" {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2" /><path d="M3 4.5V9h4.5" /><path d="M12 8v4l3 2" /></svg>);
    case "recette": return (<svg viewBox="0 0 24 24" {...p}><path d="M9 11.5l2.2 2.2L15 9.5" /><path d="M12 3l7 3v5c0 4.2-2.8 7.7-7 9-4.2-1.3-7-4.8-7-9V6l7-3z" /></svg>);
    case "hygiene": return (<svg viewBox="0 0 24 24" {...p}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>);
    case "referentiel": return (<svg viewBox="0 0 24 24" {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></svg>);
    case "projets": return (<svg viewBox="0 0 24 24" {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" /><line x1="3" y1="12" x2="21" y2="12" /></svg>);
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
  const [invite] = useState(getInviteFromUrl());           // jeton d'invitation présent dans l'URL (le cas échéant)
  const [readOnly, setReadOnly] = useState(getToken().startsWith("g.")); // estimation immédiate, confirmée par /api/session
  const [tab, setTab] = useState("cockpit");
  const [drawer, setDrawer] = useState(false);
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
    } catch (e) { showToast("Échec de création du lien : " + e.message); }
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

  // Confirme le rôle auprès du serveur (lecture seule pour un invité).
  useEffect(() => {
    if (!authed) return;
    fetchSession().then((s) => setReadOnly(s.role === "guest")).catch(() => {});
  }, [authed]);

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
    <div className={`wrap tab-${tab}`}>
      <Header kpis={data?.kpis} source={data?.source} generatedAt={data?.generatedAt}
        loading={loading} me={data?.me} onRefresh={() => load(true)}
        onLogout={() => { clearToken(); setAuthed(false); }}
        query={query} onQuery={setQuery}
        notifOn={notifOn} onToggleNotifOn={notifToggle}
        notifs={notifs} onOpenNotif={openNotif} onMarkAllRead={markAllNotifRead}
        issues={issues} onOpenTicket={setTicket} onBurger={() => setDrawer(true)}
        tab={tab} pageLabel={(TABS.find((t) => t.id === tab) || {}).label}
        onKpi={applyKpi} activeKpi={tab === "cockpit" ? (onlyLate ? "late" : (statut !== "Tous" ? statut : (dossier === "Tous" && !onlyMine && !onlyFlagged && person === "Tous" && priorite === "Tous" && !query.trim() ? "total" : null))) : null} />

      {readOnly ? (
        <div className="ro-banner">👁 Mode lecture seule — accès invité. Consultation, génération de comptes rendus et export uniquement ; aucune modification n'est possible.</div>
      ) : (
        <div className="owner-bar">
          {showDailyCr && (
            <button className="btn-line cr-day-btn" onClick={() => setDailyCrOpen(true)} title="Générer le compte rendu du jour (ZIP) à transférer à votre direction">📦 CR du jour</button>
          )}
          <button className="btn-line invite-btn" onClick={makeInvite} title="Créer un lien d'accès en lecture seule, à partager">🔗 Inviter (lien lecture seule)</button>
        </div>
      )}

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
        <div className="banner import-warning">
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
          <Portfolio parDossier={data?.parDossier} engagement={engagementByDossier} onOpen={(d) => setFiche({ nom: d })} />

          <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>{dossier === "Tous" ? "Tous les tickets" : `Tickets — ${dossier}`}</span>
            <button className={`reload-btn ${loading ? "spin" : ""}`} onClick={() => load(false, true)} disabled={loading}
              title="Tout recharger : réimporte l'intégralité des tickets depuis Jira" aria-label="Tout recharger">
              <span className="reload-ico">⟳</span>
              <span className="reload-txt">Tout recharger</span>
            </button>
          </div>
          <div className="panel cockpit-panel">
            <div className="recap-hd">
              <span className="recap-hd-name">{cockpitFilterLabel}</span>
              <span className="recap-hd-meta">{filtered.length} ticket{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}</span>
            </div>
            <div className="cockpit-bd">
            <Filters issues={issues} counts={counts} statuts={STATUTS} dossier={dossier} statut={statut}
              onlyLate={onlyLate} onlyMine={onlyMine} onlyFlagged={onlyFlagged} query={query} person={person} priorite={priorite}
              onDossier={setDossier} onStatut={setStatut}
              onToggleLate={() => setOnlyLate((v) => !v)} onToggleMine={() => setOnlyMine((v) => !v)}
              onToggleFlagged={() => setOnlyFlagged((v) => !v)}
              onQuery={setQuery} onPerson={setPerson} onPriorite={setPriorite} onReset={resetFilters} />
            <div className="sep" />
            <IssueTable rows={filtered} loading={loading} onTicket={setTicket} onDev={setDevFiche} changedKeys={changedKeys} />
            </div>
          </div>
        </>
      )}

      {tab === "recap" && <DailyRecap onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}
      {tab === "encours" && <EnCours issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} />}
      {tab === "morning" && <Morning issues={issues} onTicket={setTicket} />}
      {tab === "devs" && <Developers issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} inactiveDevs={inactiveDevs} inactiveMonths={data?.inactiveMonths || 2} onMarkLeft={removeDev} onRestoreDev={restoreDev} />}
      {tab === "meetings" && <Meetings issues={issues} />}
      {tab === "cra" && <CRA onTicket={setTicket} />}
      {tab === "history" && <History issues={issues} onTicket={setTicket} onDev={setDevFiche} deletedDevs={deletedDevs} inactiveDevs={inactiveDevs} />}
      {tab === "recette" && <Recette issues={issues} onTicket={setTicket} />}
      {tab === "referentiel" && <Referentiel issues={issues} onTicket={setTicket} />}
      {tab === "projets" && <Projets />}
      {tab === "hygiene" && <Hygiene issues={issues} onTicket={setTicket} />}

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
      {dailyCrOpen && <DailyCRModal issues={issues} onClose={() => setDailyCrOpen(false)} />}

      {showTop && <button className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Remonter en haut">↑</button>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <InstallPWA />

      {/* ---- Barre du bas (mobile) : 4 onglets principaux ---- */}
      <nav className="mobile-tabbar" aria-label="Navigation principale">
        {PRIMARY.map((id) => (
          <button key={id} className={`mtab ${tab === id ? "active" : ""}`}
            onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}>
            <span className="mtab-ic" aria-hidden="true"><NavIcon id={id} /></span>
            <span className="mtab-lb">{TAB_SHORT[id]}</span>
            {id === "cockpit" && data?.kpis?.mine ? <span className="mtab-badge">{data.kpis.mine}</span> : null}
          </button>
        ))}
      </nav>

      {/* ---- Tiroir (burger) : sections secondaires, glisse de la gauche ---- */}
      <div className={`drawer-backdrop ${drawer ? "show" : ""}`} onClick={() => setDrawer(false)} />
      <aside className={`drawer ${drawer ? "open" : ""}`} role="dialog" aria-label="Menu" aria-hidden={!drawer}>
        <div className="drawer-hd"><span>Menu</span><button className="drawer-x" aria-label="Fermer" onClick={() => setDrawer(false)}>✕</button></div>
        <nav className="drawer-nav">
          {SECONDARY.map((id) => {
            const t = TABS.find((x) => x.id === id);
            return (
              <button key={id} className={`drawer-item ${tab === id ? "active" : ""}`}
                onClick={() => { setTab(id); setDrawer(false); window.scrollTo({ top: 0 }); }}>
                <span className="di-ic" aria-hidden="true"><NavIcon id={id} /></span>{t.label}
              </button>
            );
          })}
        </nav>
        <div className="drawer-foot">cp|WIRE — Armonie Group</div>
      </aside>
    </div>
    </ReadOnlyContext.Provider>
  );
}
