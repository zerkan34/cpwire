// jira-write.js — actions retour vers Jira : ajouter un commentaire, changer le statut.
import { isConfigured } from "./jira.js";

const BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
function auth() { return "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64"); }
function headers() { return { Authorization: auth(), Accept: "application/json", "Content-Type": "application/json" }; }

// L'API v3 attend un commentaire au format ADF (Atlassian Document Format).
function textToADF(text) {
  const paras = String(text).split(/\n{2,}/).map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p.replace(/\n/g, " ") }],
  }));
  return { type: "doc", version: 1, content: paras.length ? paras : [{ type: "paragraph", content: [] }] };
}

export async function addComment(key, body) {
  if (!isConfigured()) return { simulated: true, message: "Mode démo : commentaire non envoyé." };
  const res = await fetch(`${BASE_URL}/rest/api/3/issue/${key}/comment`, {
    method: "POST", headers: headers(), body: JSON.stringify({ body: textToADF(body) }),
  });
  if (!res.ok) throw new Error(`Commentaire refusé (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

export async function listTransitions(key) {
  if (!isConfigured()) return [{ id: "demo", name: "Terminé" }];
  const res = await fetch(`${BASE_URL}/rest/api/3/issue/${key}/transitions`, { headers: headers() });
  if (!res.ok) throw new Error(`Transitions indisponibles (${res.status})`);
  const data = await res.json();
  return (data.transitions || []).map((t) => ({ id: t.id, name: t.name, to: t.to?.name }));
}

export async function transition(key, targetStatus) {
  if (!isConfigured()) return { simulated: true, message: `Mode démo : passage à "${targetStatus}" non envoyé.` };
  const trans = await listTransitions(key);
  const norm = (s) => String(s).toLowerCase();
  const match = trans.find((t) => norm(t.to) === norm(targetStatus) || norm(t.name) === norm(targetStatus)) ||
    trans.find((t) => /(termin|done|fait|clos)/.test(norm(t.to) + norm(t.name)));
  if (!match) throw new Error(`Aucune transition vers "${targetStatus}" disponible pour ${key}.`);
  const res = await fetch(`${BASE_URL}/rest/api/3/issue/${key}/transitions`, {
    method: "POST", headers: headers(), body: JSON.stringify({ transition: { id: match.id } }),
  });
  if (!res.ok) throw new Error(`Transition refusée (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return { ok: true, applied: match.name };
}
