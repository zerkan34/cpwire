// sharepoint.js — connecteur Microsoft Graph pour rapatrier les fichiers SharePoint
// DANS ShareFly (affichage dans le lecteur intégré, sans renvoi externe).
//
// Prérequis (variables d'environnement, posées dans Render) :
//   SP_TENANT        = identifiant de l'annuaire (Directory/tenant ID) Azure AD
//   SP_CLIENT_ID     = ID d'application (client) de l'app Azure AD enregistrée
//   SP_CLIENT_SECRET = secret client de cette app
//   SP_SITE          = "notos.sharepoint.com:/sites/TMA"  (hôte:/chemin du site)
//
// L'app Azure AD doit avoir la permission APPLICATION "Sites.Read.All"
// (ou Sites.Selected restreinte au site TMA) avec consentement administrateur.

const TENANT = process.env.SP_TENANT || "";
const CID = process.env.SP_CLIENT_ID || "";
const SECRET = process.env.SP_CLIENT_SECRET || "";
const SITE = process.env.SP_SITE || "";
const GRAPH = "https://graph.microsoft.com/v1.0";

export function isConfigured() { return !!(TENANT && CID && SECRET && SITE); }

let _tok = null, _exp = 0;
async function token() {
  if (_tok && Date.now() < _exp) return _tok;
  const body = new URLSearchParams({
    client_id: CID, client_secret: SECRET,
    scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: "POST", body });
  const j = await r.json();
  if (!j.access_token) throw new Error("Auth Graph : " + (j.error_description || JSON.stringify(j)));
  _tok = j.access_token; _exp = Date.now() + (j.expires_in - 60) * 1000;
  return _tok;
}

let _siteId = null;
async function siteId() {
  if (_siteId) return _siteId;
  const t = await token();
  const r = await fetch(`${GRAPH}/sites/${SITE}`, { headers: { Authorization: "Bearer " + t } });
  const j = await r.json();
  if (!j.id) throw new Error("Site introuvable : " + JSON.stringify(j));
  _siteId = j.id;
  return _siteId;
}

// Recherche un fichier par nom dans le drive du site ; renvoie le meilleur driveItem.
export async function findFile(name) {
  const t = await token();
  const sid = await siteId();
  const base = String(name).replace(/\.[^.]+$/, "").toLowerCase();
  const q = encodeURIComponent(base);
  const url = `${GRAPH}/sites/${sid}/drive/root/search(q='${q}')?$top=10&$select=id,name,webUrl,file,size`;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + t } });
  const j = await r.json();
  const items = (j.value || []).filter((it) => it.file); // fichiers seulement
  if (!items.length) return null;
  const exact = items.find((it) => it.name && it.name.toLowerCase().startsWith(base));
  return exact || items[0];
}

// Renvoie de quoi AFFICHER le fichier dans le lecteur intégré :
//  - { kind:"direct", url } : PDF / image / texte (rendu direct dans l'iframe)
//  - { kind:"embed",  url } : Office / autres (aperçu embarqué Microsoft, dans l'iframe)
export async function viewable(name) {
  const it = await findFile(name);
  if (!it) return null;
  const t = await token();
  const sid = await siteId();
  const ext = (it.name.split(".").pop() || "").toLowerCase();

  if (["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt"].includes(ext)) {
    // downloadUrl est une URL pré-authentifiée, embarquable dans une iframe
    const r = await fetch(`${GRAPH}/sites/${sid}/drive/items/${it.id}?$select=@microsoft.graph.downloadUrl,name`, { headers: { Authorization: "Bearer " + t } });
    const j = await r.json();
    const dl = j["@microsoft.graph.downloadUrl"];
    if (dl) return { kind: "direct", url: dl, name: it.name };
  }
  // Office / mail / autres : aperçu embarqué (URL courte, conçue pour iframe)
  const rp = await fetch(`${GRAPH}/sites/${sid}/drive/items/${it.id}/preview`, {
    method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: "{}",
  });
  const jp = await rp.json();
  if (jp.getUrl) return { kind: "embed", url: jp.getUrl, name: it.name };
  return null;
}
