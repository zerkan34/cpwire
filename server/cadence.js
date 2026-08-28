import { estValide as DONE } from "../shared/groupes.js";
// cadence.js — Rythme réel de l'équipe, calculé depuis les données Jira (aucune IA).
// Tout est déterministe et explicable : débit (tickets résolus), délai de traitement,
// charge en cours, tickets qui traînent. S'affine tout seul à mesure que les données s'accumulent.

const DAY = 86400000;

const parseT = (d) => { const t = d ? Date.parse(d) : NaN; return Number.isFinite(t) ? t : null; };
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Lundi 00:00 de la semaine contenant t.
function weekStart(t) {
  const d = new Date(t);
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
const ddMM = (t) => {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const OPEN = (i) => !DONE(i) && i.categorie !== "annule";
const whoOf = (i) => i.dev || i.assigne || "Non assigné";

/**
 * Calcule le rythme de l'équipe.
 * @param {Array} issues  tickets normalisés (cle, categorie, dev/assigne, cree, resolu, ...)
 * @param {Object} opts   { now, weeks, agingDays }
 */
export function buildCadence(issues = [], opts = {}) {
  const now = opts.now || Date.now();
  const weeks = opts.weeks || 8;
  const windowStart = now - weeks * 7 * DAY;
  const days30 = now - 30 * DAY;
  const leadWindow = now - 90 * DAY; // délais calculés sur 90 jours glissants

  // Délais de résolution (création → résolution) sur la fenêtre, pour la médiane équipe.
  const teamLeads = [];
  for (const i of issues) {
    const r = parseT(i.resolu), c = parseT(i.cree);
    if (r && c && r >= leadWindow && r <= now) teamLeads.push((r - c) / DAY);
  }
  const teamLeadMedian = median(teamLeads);
  // Seuil « en souffrance » : 1,5× le délai médian, plancher 14 j (ou 21 j si pas de données).
  const seuil = opts.agingDays || Math.max(14, Math.round((teamLeadMedian || 14) * 1.5));

  // Débit hebdomadaire (8 dernières semaines) — par date de résolution.
  const firstWeek = weekStart(windowStart);
  const buckets = [];
  for (let w = firstWeek; w <= now; w += 7 * DAY) buckets.push({ start: w, label: ddMM(w), count: 0, keys: [] });
  const bucketAt = (t) => {
    const ws = weekStart(t);
    return buckets.find((b) => b.start === ws);
  };

  const devs = new Map();
  const dev = (k) => {
    if (!devs.has(k)) devs.set(k, { nom: k, resolus30: 0, resolusWindow: 0, leads: [], enCours: 0, plusAncienJours: 0, plusAncienCle: null });
    return devs.get(k);
  };

  let resolus30 = 0, enCours = 0, enSouffrance = 0;

  for (const i of issues) {
    const who = whoOf(i);
    const r = parseT(i.resolu), c = parseT(i.cree);

    if (DONE(i) && r && r <= now) {
      if (r >= windowStart) { const b = bucketAt(r); if (b) { b.count++; b.keys.push(i.cle); } }
      if (r >= days30) {
        resolus30++;
        if (who !== "Non assigné") dev(who).resolus30++;
      }
      if (r >= windowStart && who !== "Non assigné") dev(who).resolusWindow++;
      if (r >= leadWindow && c && who !== "Non assigné") dev(who).leads.push((r - c) / DAY);
    }

    if (OPEN(i)) {
      enCours++;
      const age = c ? (now - c) / DAY : 0;
      if (age > seuil) enSouffrance++;
      if (who !== "Non assigné") {
        const d = dev(who);
        d.enCours++;
        if (age > d.plusAncienJours) { d.plusAncienJours = age; d.plusAncienCle = i.cle; }
      }
    }
  }

  const devsArr = [...devs.values()].map((d) => ({
    nom: d.nom,
    resolus30: d.resolus30,
    debitHebdo: round1(d.resolusWindow / weeks),
    delaiMedianJours: round1(median(d.leads)),
    enCours: d.enCours,
    plusAncienJours: Math.round(d.plusAncienJours),
    plusAncienCle: d.plusAncienCle,
  })).sort((a, b) => b.resolus30 - a.resolus30 || b.enCours - a.enCours || a.nom.localeCompare(b.nom));

  return {
    genere: new Date(now).toISOString(),
    fenetreSemaines: weeks,
    seuilSouffranceJours: seuil,
    equipe: {
      resolus30,
      debitHebdoMoyen: round1(buckets.reduce((s, b) => s + b.count, 0) / weeks),
      delaiMedianJours: round1(teamLeadMedian),
      enCours,
      enSouffrance,
      devsActifs: devsArr.filter((d) => d.resolus30 > 0 || d.enCours > 0).length,
    },
    hebdo: buckets.map((b) => ({ label: b.label, count: b.count, keys: b.keys })),
    devs: devsArr,
  };
}
