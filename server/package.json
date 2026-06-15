// microsoft.js — intégration Microsoft 365 (Outlook + SharePoint) via Microsoft Graph.
// NÉCESSITE une app déclarée dans Azure AD (Entra) avec les permissions Graph
// Mail.Send et Sites.ReadWrite.All (consentement admin). Sans ces variables, les
// fonctions renvoient une erreur claire — rien n'est simulé.
//
// Variables attendues (server/.env) :
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
//   MS_SENDER         (adresse e-mail expéditrice, ex. nicolas@armonie.group)
//   SP_SITE_ID        (ID du site SharePoint, via Graph /sites)
//   SP_DRIVE_ID       (optionnel : ID de la bibliothèque ; sinon drive par défaut)

const TENANT = process.env.MS_TENANT_ID || "";
const CLIENT = process.env.MS_CLIENT_ID || "";
const SECRET = process.env.MS_CLIENT_SECRET || "";
const SENDER = process.env.MS_SENDER || "";
const SITE_ID = process.env.SP_SITE_ID || "";
const DRIVE_ID = process.env.SP_DRIVE_ID || "";

export function msConfigured() {
  return Boolean(TENANT && CLIENT && SECRET);
}

// Jeton d'application (client credentials).
async function token() {
  const body = new URLSearchParams({
    client_id: CLIENT,
    client_secret: SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Auth Microsoft échouée (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

// Envoi d'un e-mail via Outlook (le corps HTML du rapport).
export async function sendMail({ to, subject, html }) {
  if (!msConfigured() || !SENDER) throw new Error("Outlook (Graph) non configuré : renseigne MS_* et MS_SENDER.");
  const t = await token();
  const message = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: (Array.isArray(to) ? to : [to]).filter(Boolean).map((a) => ({ emailAddress: { address: a } })),
    },
    saveToSentItems: true,
  };
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Envoi Outlook refusé (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

// Dépôt d'un fichier dans un dossier SharePoint (crée l'arborescence au besoin).
export async function uploadToSharePoint({ folderPath, filename, html }) {
  if (!msConfigured() || !SITE_ID) throw new Error("SharePoint (Graph) non configuré : renseigne MS_* et SP_SITE_ID.");
  const t = await token();
  const drive = DRIVE_ID
    ? `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}`
    : `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive`;
  const clean = `${folderPath}/${filename}`.replace(/^\/+/, "").replace(/\/+/g, "/");
  const url = `${drive}/root:/${encodeURI(clean)}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "text/html" },
    body: html,
  });
  if (!res.ok) throw new Error(`Dépôt SharePoint refusé (${res.status}) : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { ok: true, webUrl: data.webUrl };
}
