// signals.js — JOURNAL DE SIGNAUX (boucle d'apprentissage).
// -----------------------------------------------------------------------------
// Idée : les vues de la Tour de contrôle MONTRENT l'instantané ; ce journal en
// GARDE la trace, jour après jour, pour que le copilote raisonne sur l'HISTOIRE
// du portefeuille (« DIAPAR a reculé 3 fois ce mois-ci »), pas seulement la photo.
//
// RÈGLE SACRÉE : zéro invention. Chaque signal est dérivé d'un fait déjà calculé
// ailleurs (régression = mouvement pointHistory ; SLA = buildSlaReport ; stagnation
// = statutDepuis réel ; divergence = buildDeadlineRadar). Si la source est vide,
// aucun signal n'est fabriqué.
//
// Persistance : fichier dans le dossier de données (paths.js), miroir best-effort
// en base (persist.js) pour survivre aux redéploiements Render. Fenêtre glissante.

import fs from "fs";
import path from "path";
import { dataDir } from "./paths.js";
import { saveBlob, restoreBlob } from "./persist.js";

const FILE = path.join(dataDir(), "signals.json");
const KEEP_DAYS = 60;                 // profondeur d'historique conservée
const STAGNATION_DAYS = 30;           // seuil « figé » retenu comme signal
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function load() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
  } catch { /* ignore */ }
  // repli base
  try { const b = restoreBlob && restoreBlob("signals"); if (b) return JSON.parse(b) || {}; } catch { /* ignore */ }
  return {};
}
function save(db) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); }
  catch (e) { console.error("signals.save:", e.message); }
  try { saveBlob && saveBlob("signals", JSON.stringify(db)); } catch { /* best-effort */ }
  return true;
}
function trim(db) {
  const cutoff = daysAgoStr(KEEP_DAYS);
  for (const d of Object.keys(db)) if (d < cutoff) delete db[d];
}

// Âge en jours depuis l'entrée dans le statut courant (statutDepuis) ; repli sur maj.
function ageInStatus(i) {
  const d = i.statutDepuis || i.maj; if (!d) return null;
  const t = Date.parse(d); if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// -----------------------------------------------------------------------------
// computeSignals : dérive les signaux DU JOUR à partir de faits déjà calculés.
//  - pointDerived : sortie de deriveFromPointHistory() (mouvements datés, regression)
//  - slaReport    : sortie de buildSlaReport() (alerts[].state === "over")
//  - radar        : sortie de buildDeadlineRadar().radar (items[].divergence)
//  - issues       : tickets courants (pour la stagnation, via statutDepuis)
// Renvoie un tableau plat [{type, cle?, dossier, detail}].
// -----------------------------------------------------------------------------
export function computeSignals({ issues = [], slaReport = null, radar = [], pointDerived = null } = {}) {
  const out = [];

  // 1) Régressions — dernier jour dérivé des instantanés (retour en arrière réel).
  const days = pointDerived && Array.isArray(pointDerived.days) ? pointDerived.days : [];
  const last = days.length ? days[days.length - 1] : null;
  if (last && Array.isArray(last.movements)) {
    for (const m of last.movements) {
      if (m.regression) out.push({ type: "regression", cle: m.cle, dossier: m.dossier || "—", detail: `${m.fromLabel || m.fromCat || "?"} → ${m.toLabel || m.toCat || "?"}` });
    }
  }

  // 2) Dépassements SLA — engagements de délai franchis (fait serveur).
  const alerts = slaReport && Array.isArray(slaReport.alerts) ? slaReport.alerts : [];
  for (const a of alerts) {
    if (a.state === "over") {
      const dep = a.depassementH != null ? `+${Math.round(a.depassementH)} h au-delà de la cible` : "cible dépassée";
      out.push({ type: "sla", cle: a.cle, dossier: a.dossier || "—", detail: `${a.bucket || ""} ${dep}`.trim() });
    }
  }

  // 3) Stagnation — tickets actifs figés au-delà du seuil (statutDepuis réel).
  for (const i of issues) {
    if (["termine", "miseEnProd", "annule"].includes(i.categorie)) continue;
    const age = ageInStatus(i);
    if (age != null && age >= STAGNATION_DAYS) out.push({ type: "stagnation", cle: i.cle, dossier: i.dossier || "—", detail: `${age} j sans changement d'état` });
  }

  // 4) Divergences de date — deux sources se contredisent (fait deadlines.js).
  for (const r of (radar || [])) {
    if (r.divergence) out.push({ type: "divergence", cle: null, dossier: r.dossier || "—", detail: `${r.label || "échéance"} : sources contradictoires` });
  }

  return out;
}

// Enregistre les signaux du jour (idempotent : une occurrence par (type|clé|dossier) et par jour).
export function recordSignals(signals) {
  if (!Array.isArray(signals)) return false;
  const db = load();
  const day = todayStr();
  const seen = new Set();
  const kept = [];
  for (const s of signals) {
    const k = `${s.type}|${s.cle || ""}|${s.dossier || ""}`;
    if (seen.has(k)) continue; seen.add(k);
    kept.push({ type: s.type, cle: s.cle || null, dossier: s.dossier || "—", detail: s.detail || "" });
  }
  db[day] = kept;   // remplace l'entrée du jour par l'état de fin de journée (dernier calcul)
  trim(db);
  return save(db);
}

// Lecture aplatie des N derniers jours, plus récent d'abord.
export function readSignals(daysBack = 30) {
  const db = load();
  const cutoff = daysAgoStr(daysBack);
  const rows = [];
  for (const [day, list] of Object.entries(db)) {
    if (day < cutoff) continue;
    for (const s of (list || [])) rows.push({ ...s, day });
  }
  rows.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return rows;
}

// Agrégats utiles à l'UI et au copilote (comptages par type + récurrences par dossier).
export function signalsStats(daysBack = 30) {
  const rows = readSignals(daysBack);
  const byType = {}; const byDossier = {};
  for (const r of rows) {
    byType[r.type] = (byType[r.type] || 0) + 1;
    const key = `${r.dossier}|${r.type}`;
    byDossier[key] = (byDossier[key] || 0) + 1;
  }
  // Récurrences notables : (dossier, type) répété ≥ 2 fois sur la fenêtre.
  const recurrences = Object.entries(byDossier)
    .filter(([, n]) => n >= 2)
    .map(([k, n]) => { const [dossier, type] = k.split("|"); return { dossier, type, n }; })
    .sort((a, b) => b.n - a.n);
  return { days: daysBack, total: rows.length, byType, recurrences };
}

// Résumé COURT injecté dans le contexte du copilote (fermeture de la boucle d'apprentissage).
// Purement factuel ; « — » implicite si rien.
export function signalsSummary(daysBack = 30) {
  const st = signalsStats(daysBack);
  if (!st.total) return "";
  const LBL = { regression: "régressions", sla: "dépassements SLA", stagnation: "tickets figés", divergence: "divergences de date" };
  const parts = Object.entries(st.byType).map(([t, n]) => `${n} ${LBL[t] || t}`);
  let s = `HISTORIQUE DES SIGNAUX (${daysBack} derniers jours) : ${parts.join(", ")}.`;
  if (st.recurrences.length) {
    const top = st.recurrences.slice(0, 5).map((r) => `${r.dossier} (${LBL[r.type] || r.type} ×${r.n})`);
    s += ` Récurrences à surveiller : ${top.join(", ")}.`;
  }
  return s;
}
