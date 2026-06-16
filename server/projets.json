// Suivi de projets : la couche commerciale (projets.json) enrichie EN TEMPS RÉEL
// par les données Jira (activité, recette, retards) et, pour Tafanel, par le
// référentiel de recette. L'outil "pense comme le CP" mais reste honnête : les
// chiffres d'avancement/santé sont confrontés à la réalité des tickets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crossReferentiel } from "./referentiel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const P_PATH = path.join(__dirname, "projets.json");

export function loadProjets() {
  try { return JSON.parse(fs.readFileSync(P_PATH, "utf8")); }
  catch { return { projets: [] }; }
}

const ACTIVE = ["encours", "retourTest", "retourProd"];
const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];
const DONE = ["termine", "miseEnProd"];
const RETOUR = ["retourTest", "retourProd"];
const ETATS = ["AVV Pipe", "Propal envoyée", "Signé", "En cours", "Terminé"];
const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);

// Pouls Jira d'un client (à partir des tickets de son dossier).
function jiraPulse(issues, client) {
  const cu = String(client).toUpperCase();
  const sub = (issues || []).filter((i) => String(i.dossier || "").toUpperCase() === cu);
  if (!sub.length) return { present: false, total: 0 };
  const cnt = (cats) => sub.filter((i) => cats.includes(i.categorie)).length;
  let last = null;
  for (const i of sub) { const d = i.maj ? new Date(i.maj) : null; if (d && (!last || d > last)) last = d; }
  return {
    present: true, total: sub.length,
    actifs: cnt(ACTIVE), recette: cnt(RECETTE), done: cnt(DONE),
    retours: cnt(RETOUR), retard: sub.filter((i) => i.enRetard).length,
    lastActivity: last ? last.toISOString() : null,
  };
}

export function buildProjets(issues) {
  const ref = loadProjets();
  const projets = ref.projets || [];

  // --- groupement par client (ordre d'apparition) ---
  const order = [];
  const byClient = {};
  for (const p of projets) {
    if (!byClient[p.client]) { byClient[p.client] = []; order.push(p.client); }
    byClient[p.client].push(p);
  }

  const clients = order.map((client) => {
    const items = byClient[client];
    const fin = items.reduce((a, p) => ({
      budgete: a.budgete + num(p.budgete), facture: a.facture + num(p.facture), jh: a.jh + num(p.jh),
    }), { budgete: 0, facture: 0, jh: 0 });
    const pulse = jiraPulse(issues, client);

    // Enrichissement recette réel (clients dotés d'un référentiel, ex. Tafanel)
    let recette = null;
    try {
      const cross = crossReferentiel(issues || [], client.charAt(0) + client.slice(1).toLowerCase()); // "TAFANEL" -> "Tafanel"
      if (cross && cross.domaines && cross.domaines.length) {
        let total = 0, done = 0, enRec = 0, retours = 0;
        for (const d of cross.domaines) for (const o of d.options) {
          total += o.total; done += o.done; enRec += o.enRecette; retours += o.retours;
        }
        recette = { nbOptions: cross.nbOptions, nbProgrammes: total, done, enRecette: enRec, retours,
          pct: total ? Math.round((done / total) * 100) : 0, majSource: cross.majSource || "" };
      }
    } catch { /* pas de référentiel pour ce client */ }

    const projetsOut = items.map((p) => {
      const reste = (p.budgete == null && p.facture == null) ? null : num(p.budgete) - num(p.facture);
      return { ...p, reste };
    });

    // santé "data" suggérée : rouge si retards/retours marqués, orange si quelques retours
    let sante = "neutre";
    if (pulse.present) {
      if (pulse.retard >= 3 || pulse.retours >= 5) sante = "rouge";
      else if (pulse.retard >= 1 || pulse.retours >= 1) sante = "orange";
      else sante = "vert";
    }

    return { client, type: items[0].type, finances: fin, jira: pulse, recette, santeData: sante, projets: projetsOut };
  });

  // --- KPIs globaux ---
  const all = projets;
  const kpis = {
    budgete: all.reduce((s, p) => s + num(p.budgete), 0),
    facture: all.reduce((s, p) => s + num(p.facture), 0),
    jh: all.reduce((s, p) => s + num(p.jh), 0),
    nbProjets: all.length,
    actifs: all.filter((p) => p.etat === "En cours").length,
    nbClients: order.length,
  };
  kpis.reste = kpis.budgete - kpis.facture;

  // --- pipeline (funnel commercial) ---
  const pipeline = ETATS.map((etat) => {
    const sub = all.filter((p) => p.etat === etat);
    return { etat, n: sub.length, montant: sub.reduce((s, p) => s + num(p.budgete), 0) };
  });

  return { majSource: ref.majSource || "", generatedAt: new Date().toISOString(), kpis, pipeline, clients };
}
