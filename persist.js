// dolibarr.js — connecteur LECTURE SEULE vers Dolibarr (ERP/CRM Armonie).
// Config par variables d'environnement (posées côté Render, jamais dans le code) :
//   DOLIBARR_URL      ex. https://doli.armonie.group
//   DOLIBARR_API_KEY  clé API d'un utilisateur Dolibarr (module API/REST activé)
//
// v0 : SONDE de découverte. Interroge les modules standard et renvoie, pour chacun :
//   - s'il répond (module activé + droits OK),
//   - s'il contient des données,
//   - la LISTE DES NOMS DE CHAMPS d'un enregistrement (jamais les valeurs).
// Aucune écriture, aucune donnée client ne transite hors de ton instance.

const BASE = (process.env.DOLIBARR_URL || "").replace(/\/+$/, "");
const KEY = process.env.DOLIBARR_API_KEY || "";
const API = `${BASE}/api/index.php`;

// Rapprochement de NOS clients (tels qu'affichés dans cp|WIRE) avec leur fiche Tiers Dolibarr.
// Source : export Dolibarr « Tiers / multicompany ». C'est la CLÉ qui permettra à l'agrégation
// facturé/impayé d'interroger les factures par tiers (code_client). Données de référence
// uniquement (aucun secret). Entité de facturation : « iD INFO » (groupe Armonie).
// `code` = null → tiers présent mais sans code client Dolibarr (à créer/compléter côté ERP).
export const DOLIBARR_CLIENTS = {
  EDL:        { tiers: "L'ECOLE DES LOISIRS", code: "9ECOL0", cp: "75006", tel: "", commercial: "Guy Routier", entite: "iD INFO" },
  "DS Smith": { tiers: "DS SMITH PACKAGING France", code: "9DSSMI", cp: "92800", tel: "", commercial: "", entite: "iD INFO" },
  Tafanel:    { tiers: "TAFANEL gestion", code: "9TAFAN", cp: "75018", tel: "", commercial: "Fabrice Blain", entite: "iD INFO" },
  Bellion:    { tiers: "BELMET", code: "Belmet", cp: "29480", tel: "0298286213", commercial: "Guy Routier", entite: "iD INFO", groupe: { tiers: "BELLION Groupe", code: "Bellion", cp: "29000" } },
  Balas:      { tiers: "BALAS", code: null, cp: "92230", tel: "0149454545", commercial: "Guy Routier", entite: "iD INFO" },
  IMA:        { tiers: "INTER MUTUELLES ASSISTANCE G.I.E", code: "9GIEMU", cp: "79000", tel: "0549757575", commercial: "", entite: "iD INFO" },
  DIAPAR:     { tiers: "DIAPAR", code: "DIAPAR", cp: "91380", tel: "0164542300", commercial: "", entite: "iD INFO" },
  Segurel:    { tiers: "ETS SEGUREL & FILS", code: "9SEGUR", cp: "28500", tel: "0234650100", commercial: "", entite: "iD INFO" },
};

// Code Tiers Dolibarr d'un client cp|WIRE (null si non rapproché).
export function dolibarrCodeFor(client) {
  const c = DOLIBARR_CLIENTS[client];
  return c ? c.code : null;
}

export function dolibarrConfigured() { return !!(BASE && KEY); }
export function dolibarrStatus() { return { configured: dolibarrConfigured(), base: BASE || null }; }

async function get(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${API}${path}`, {
      headers: { DOLAPIKEY: KEY, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 140)}`);
    try { return JSON.parse(text); } catch { throw new Error("réponse non-JSON (URL ou module API ?)"); }
  } finally { clearTimeout(timer); }
}

// Modules standard Dolibarr les plus utiles pour le croisement avec Jira.
const MODULES = [
  { id: "thirdparties", label: "Clients / tiers", path: "/thirdparties?limit=1" },
  { id: "contracts", label: "Contrats", path: "/contracts?limit=1" },
  { id: "invoices", label: "Factures", path: "/invoices?limit=1" },
  { id: "orders", label: "Commandes", path: "/orders?limit=1" },
  { id: "contacts", label: "Contacts", path: "/contacts?limit=1" },
  { id: "projects", label: "Projets", path: "/projects?limit=1" },
];

export async function probe() {
  if (!dolibarrConfigured()) return { configured: false };
  const modules = [];
  for (const m of MODULES) {
    try {
      const data = await get(m.path);
      const arr = Array.isArray(data) ? data : (data ? [data] : []);
      const sample = arr[0] || null;
      modules.push({
        module: m.id,
        label: m.label,
        ok: true,
        hasData: arr.length > 0,
        sampleFields: sample ? Object.keys(sample) : [],
      });
    } catch (e) {
      console.warn(`[dolibarr] module ${m.id} indisponible:`, e.message || e);
      modules.push({ module: m.id, label: m.label, ok: false, error: String(e.message || e) });
    }
  }
  return { configured: true, base: BASE, modules };
}
