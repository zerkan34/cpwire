// api.js — accès backend CPwire, avec jeton de session.
const BASE = import.meta.env.VITE_API_BASE || "";
const TOKEN_KEY = "cpwire_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function authHeaders() { const t = getToken(); return t ? { "x-access-token": t } : {}; }

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401) { clearToken(); window.dispatchEvent(new Event("cpwire-logout")); throw new Error("Session expirée — reconnecte-toi."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Erreur ${res.status}`); e.needsConfig = data.needsConfig; throw e; }
  return data;
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

export const fetchPortfolio = ({ refresh = false } = {}) => req(`/api/portfolio${refresh ? "?refresh=1" : ""}`);
export const fetchRecap = () => req(`/api/recap`);
export const fetchHistory = () => req(`/api/history`);
export const fetchDossiers = () => req(`/api/dossiers`);
export const saveDossier = (nom, fiche) => put(`/api/dossiers/${encodeURIComponent(nom)}`, fiche);
export const genDailyCR = (dossier) => post(`/api/cr/daily`, { dossier });
export const genTicketReport = (cle, note, resume) => post(`/api/ticket/report`, { cle, note, resume });
export const pushTicket = (cle, comment, markDone) => post(`/api/ticket/push`, { cle, comment, markDone });
export const explainTicket = (cle) => post(`/api/ticket/explain`, { cle });
export const genGlobalCR = () => post(`/api/cr/global`, {});
export const shareMail = (to, subject, html) => post(`/api/share/mail`, { to, subject, html });
export const shareSharePoint = (folderPath, filename, html) => post(`/api/share/sharepoint`, { folderPath, filename, html });


export async function genMeetingReport(form) {
  const res = await fetch(`${BASE}/api/meeting/report`, { method: "POST", headers: authHeaders(), body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}
