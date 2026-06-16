// mails.js — pilier « Derniers échanges » de la Fiche client 360 (Outlook / Microsoft 365).
// LECTURE SEULE. Aucune donnée secrète ici : les identifiants Microsoft viennent
// EXCLUSIVEMENT des variables d'environnement (Render), jamais du code ni du dépôt.
//
// Variables d'environnement attendues (à définir par l'utilisateur sur Render) :
//   MS_TENANT_ID       — ID du locataire Azure AD (Armonie)
//   MS_CLIENT_ID       — ID d'application (inscription d'app Azure)
//   MS_CLIENT_SECRET   — secret client de l'application
//   MS_REFRESH_TOKEN   — refresh token délégué (scope Mail.Read + offline_access)
//                        pour la boîte ndurand@armonie.group
//
// Si l'une manque → l'app fonctionne normalement, la section affiche « à configurer ».

const GRAPH = "https://graph.microsoft.com/v1.0";

export function mailsConfigured() {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_REFRESH_TOKEN);
}

// Échange refresh_token -> access_token (courte durée). Mémorisé en RAM jusqu'à expiration.
let _tok = { value: "", exp: 0 };
async function accessToken() {
  if (_tok.value && Date.now() < _tok.exp - 30000) return _tok.value;
  const url = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: process.env.MS_REFRESH_TOKEN,
    grant_type: "refresh_token",
    scope: "https://graph.microsoft.com/Mail.Read offline_access",
  });
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error("token Microsoft refusé (" + r.status + ")");
  const j = await r.json();
  _tok = { value: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
  return _tok.value;
}

const domainOf = (addr) => (addr && addr.indexOf("@") >= 0 ? addr.split("@")[1].toLowerCase() : "");

// Renvoie { configured, mails:[{id,subject,from,date,link}], note? }
export async function recentMailsFor(domaines = [], max = 8) {
  if (!mailsConfigured()) return { configured: false, mails: [] };
  const doms = (domaines || []).map((d) => String(d).toLowerCase()).filter(Boolean);
  if (!doms.length) return { configured: true, mails: [], note: "Aucun domaine renseigné pour ce client (champ « domaines » dans acces.json)." };
  try {
    const token = await accessToken();
    const sel = "$select=subject,from,toRecipients,receivedDateTime,webLink";
    const url = `${GRAPH}/me/messages?$top=40&${sel}&$orderby=receivedDateTime%20desc`;
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Graph messages " + r.status);
    const j = await r.json();
    const match = (m) => {
      const fromDom = domainOf(m.from && m.from.emailAddress && m.from.emailAddress.address);
      if (doms.includes(fromDom)) return true;
      const tos = (m.toRecipients || []).map((t) => domainOf(t.emailAddress && t.emailAddress.address));
      return tos.some((d) => doms.includes(d));
    };
    const mails = (j.value || []).filter(match).slice(0, max).map((m) => ({
      id: m.id,
      subject: m.subject || "(sans objet)",
      from: (m.from && m.from.emailAddress && (m.from.emailAddress.name || m.from.emailAddress.address)) || "",
      date: m.receivedDateTime || "",
      link: m.webLink || "",
    }));
    return { configured: true, mails };
  } catch (e) {
    return { configured: true, mails: [], note: "Connexion Outlook indisponible : " + (e.message || e) };
  }
}
