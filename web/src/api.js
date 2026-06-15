// api.js — accès backend CPwire, avec jeton de session.
const BASE = import.meta.env.VITE_API_BASE || "";
const TOKEN_KEY = "cpwire_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function authHeaders() { const t = getToken(); return t ? { "x-access-token": t } : {}; }

async function req(path, opts = {}) {
  const { timeoutMs, ...rest } = opts;
  let ctrl, timer;
  if (timeoutMs) { ctrl = new AbortController(); timer = setTimeout(() => ctrl.abort(), timeoutMs); }
  try {
    const res = await fetch(`${BASE}${path}`, { ...rest, signal: ctrl ? ctrl.signal : undefined, headers: { ...authHeaders(), ...(rest.headers || {}) } });
    if (res.status === 401) { clearToken(); window.dispatchEvent(new Event("cpwire-logout")); throw new Error("Session expirée — reconnecte-toi."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `Erreur ${res.status}`); e.needsConfig = data.needsConfig; throw e; }
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("Le serveur n'a pas répondu à temps (import trop long ou bloqué). Réessaie « Tout recharger ».");
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const post = (path, body) => req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const put = (path, body) => req(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Connexion impossible");
  setToken(data.token);
  return data;
}

// ---- Invitation lecture seule ----
// Lit un éventuel jeton d'invitation passé dans l'URL : ...?invite=<token>
export const getInviteFromUrl = () => {
  try { return new URLSearchParams(window.location.search).get("invite") || ""; }
  catch { return ""; }
};
// Retire le paramètre ?invite de l'URL (après connexion) pour ne pas le re-déclencher au rechargement.
export const stripInviteFromUrl = () => {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("invite");
    window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  } catch { /* ignore */ }
};
// "Connexion" d'un invité : on enregistre le jeton du lien comme jeton d'accès.
export const loginGuest = (token) => { setToken(token); };
// Rôle de la session courante : "owner" ou "guest".
export const fetchSession = () => req(`/api/session`);
// (Owner) crée un lien d'invitation valable `hours` heures → renvoie { token, expiresAt, hours }.
export const createInvite = (hours) => post(`/api/invite`, { hours });

export const fetchPortfolio = ({ refresh = false, full = false } = {}) =>
  req(`/api/portfolio${full ? "?full=1" : refresh ? "?refresh=1" : ""}`, { timeoutMs: 180000 });
export const fetchRecap = () => req(`/api/recap`);
export const crForDate = ({ dossier, startISO, endISO, label }) => post(`/api/cr/date`, { dossier, startISO, endISO, label });
export const crDailyForPeriod = ({ dossier, startISO, endISO, label }) => post(`/api/cr/daily-period`, { dossier, startISO, endISO, label });
export const fetchHistory = () => req(`/api/history`);
export const fetchDossiers = () => req(`/api/dossiers`);
export const saveDossier = (nom, fiche) => put(`/api/dossiers/${encodeURIComponent(nom)}`, fiche);
export const genDailyCR = (dossier) => post(`/api/cr/daily`, { dossier });
export const genWrittenCR = (dossier) => post(`/api/cr/written`, { dossier });
export const genTicketReport = (cle, note, resume) => post(`/api/ticket/report`, { cle, note, resume });
export const pushTicket = (cle, comment, markDone) => post(`/api/ticket/push`, { cle, comment, markDone });
export const explainTicket = (cle) => post(`/api/ticket/explain`, { cle });
export const fetchTicketActivity = (cle) => post(`/api/ticket/activity`, { cle });
export const fetchDevWork = (dev, keys) => post(`/api/dev/work`, { dev, keys });
export const fetchChangesSummary = (keys) => post(`/api/changes/summary`, { keys });
export const fetchCRA = (start, end) => post(`/api/cra`, { start, end });
export const fetchSla = () => req(`/api/sla`);
export function importCRA(file, basis = 7) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("basis", String(basis));
  return req(`/api/cra/import`, { method: "POST", body: fd, timeoutMs: 60000 });
}
export const genGlobalCR = () => post(`/api/cr/global`, {});
export const genMorningCR = (dossier) => post(`/api/cr/morning`, { dossier });
export const genMeetingPrep = (payload) => post(`/api/meeting/prep`, payload);
export const fetchDeletedDevs = () => req(`/api/devs/deleted`);
export const deleteDevFiche = (name) => post(`/api/devs/delete`, { name });
export const restoreDevFiche = (name) => post(`/api/devs/restore`, { name });
export const shareMail = (to, subject, html) => post(`/api/share/mail`, { to, subject, html });
export const shareSharePoint = (folderPath, filename, html) => post(`/api/share/sharepoint`, { folderPath, filename, html });


export async function genMeetingReport(form) {
  const res = await fetch(`${BASE}/api/meeting/report`, { method: "POST", headers: authHeaders(), body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}
