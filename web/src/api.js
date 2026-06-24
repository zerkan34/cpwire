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

// Assistant ancré : renvoie { answer, sources:{tickets,dossiers,methodologie} }.
export const askAssistant = (question, history = []) => post("/api/assistant", { question, history });

// Points bloquants : date exacte d'entrée dans l'état (transition statut / drapeau). tickets = [{cle, maj}].
// Renvoie { since: { [cle]: { enteredStatusAt, flaggedAt, statut } } }.
export const blockerSince = (tickets = []) => post("/api/blockers/since", { tickets });

// Copilote — analyse d'un fichier déposé (multipart). Renvoie { ok, answer, note, guess, dossiers, filename } ou { error }.
export async function analyzeForAssistant(file, question = "") {
  const form = new FormData();
  form.append("file", file);
  if (question) form.append("question", question);
  const res = await fetch(`${BASE}/api/assistant/analyze`, { method: "POST", headers: { ...authHeaders() }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Copilote — mémorise une fiche au corpus d'un dossier.
export const importToCorpus = (dossier, note) => post("/api/assistant/import", { dossier, note });

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Connexion impossible");
  setToken(data.token);
  return data;
}

// Déconnexion : prévient le serveur (révoque la session invitée) puis efface le jeton local.
export async function logout() {
  try { await fetch(`${BASE}/api/logout`, { method: "POST", headers: { ...authHeaders() } }); } catch { /* hors-ligne : on efface quand même */ }
  clearToken();
  try { window.dispatchEvent(new Event("cpwire-logout")); } catch { /* ignore */ }
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

// ---- Comptes invités (rôle consultation) + Admin ----
// Activation d'un compte depuis un lien d'invitation : la personne choisit email + mot de passe.
export async function claimAccount(token, email, password) {
  const res = await fetch(`${BASE}/api/account/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, email, password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Activation impossible");
  if (data.token) setToken(data.token); // compatibilité : aujourd'hui le compte est « en attente » -> pas de token
  return data; // { pending, email, message } en mode confirmation par e-mail
}
export const adminConfirmUser = (email) => post(`/api/admin/users/confirm`, { email });
export const adminInvite = (opts = {}) => post(`/api/admin/invite`, opts);

// Explorateur SharePoint (lecture en direct + aperçu Office en ligne)
export const spStatus = () => req(`/api/sharepoint/status`);
export const spList = (path = "") => req(`/api/sharepoint/list?path=${encodeURIComponent(path)}`);
export const spPreview = (id) => post(`/api/sharepoint/preview`, { id });
export const spListItems = (id, max = 5) => req(`/api/sharepoint/items/${encodeURIComponent(id)}?max=${max}`);
export const spListInfo = (id) => req(`/api/sharepoint/listinfo/${encodeURIComponent(id)}`);
export const fetchAdminUsers = () => req(`/api/admin/users`);
export const removeAdminUser = (email) => post(`/api/admin/users/remove`, { email });
export const ping = () => post(`/api/ping`, {});

export const fetchPortfolio = ({ refresh = false, full = false } = {}) =>
  req(`/api/portfolio${full ? "?full=1" : refresh ? "?refresh=1" : ""}`, { timeoutMs: 180000 });
export const fetchRecap = () => req(`/api/recap`);
export const fetchRecapChiffres = () => req(`/api/recap/chiffres`);
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
export const fetchHygiene = () => req(`/api/hygiene`);
export const fetchCadence = (weeks = 8) => req(`/api/cadence?weeks=${weeks}`);
export const fetchConnaissance = () => req(`/api/connaissance`);
export const saveConnaissance = (data) => put(`/api/connaissance`, data);
export const learnConnaissance = () => post(`/api/connaissance/learn`, {});
export const fetchReferentielClients = () => req(`/api/referentiel/clients`);
export const fetchClientMails = (dossier) => req(`/api/client/mails?dossier=${encodeURIComponent(dossier)}`);
export const fetchProjets = () => req(`/api/projets`);
// Rendu PDF côté serveur (WeasyPrint, charte exacte). data = { meta, clients }.
export async function exportServerPdf(data, filename = "Points-bloquants.pdf", kind = "blockers") {
  const res = await fetch(`${BASE}/api/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ kind, data, filename }),
  });
  if (!res.ok) { let m = ""; try { m = (await res.json()).error; } catch {} throw new Error(m || `HTTP ${res.status}`); }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function downloadProjetsXlsx() {
  const res = await fetch(`${BASE}/api/projets/export`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Export indisponible");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Suivi_de_projets.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function openProjetsDoc() {
  const res = await fetch(`${BASE}/api/projets/doc`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Document indisponible");
  const html = await res.text();
  const w = window.open("", "_blank");
  if (!w) throw new Error("Autorise les fenêtres pop-up pour générer le PDF.");
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
}
export const fetchReferentiel = (client) => req(`/api/referentiel${client ? `?client=${encodeURIComponent(client)}` : ""}`);
export function importCRA(file, basis = 7) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("basis", String(basis));
  return req(`/api/cra/import`, { method: "POST", body: fd, timeoutMs: 60000 });
}
// Import de documents : analyse IA (proposition), validation, historique.
export function importAnalyze(file) {
  const fd = new FormData();
  fd.append("file", file);
  return req(`/api/import/analyze`, { method: "POST", body: fd, timeoutMs: 60000 });
}
export const importApply = (payload) => post(`/api/import/apply`, payload);
export const importHistory = () => req(`/api/import/history`);
export const importDataset = (name) => req(`/api/import/dataset/${encodeURIComponent(name)}`);
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

// ---- Dolibarr (lecture seule) : statut + sonde de découverte ----
export const dolibarrStatus = () => req(`/api/dolibarr/status`);
export const dolibarrProbe = () => req(`/api/dolibarr/probe`, { timeoutMs: 90000 });
