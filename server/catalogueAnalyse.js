// catalogueAnalyse.js — Lot 2 : cp|WIRE lit le catalogue ShareFly (base + dérivés)
// et en tire des analyses documentaires RÉELLES : couverture par client, documents
// orphelins / à classer / hors périmètre, et fraîcheur (année des documents).
// Fonctions pures (aucune I/O) → testables et réutilisables par n'importe quelle vue.

// Liste des clients ShareFly (index = ci), vérifiée sur window.CLIENTS du catalogue.
export const SF_CLIENTS = [
  "Belmet — Groupe Bellion", "Tafanel", "École des Loisirs", "Balas", "DS Smith",
  "Inter Mutuelle Assistance", "Vinci Immobilier", "Vandoren", "Segurel", "Diapar",
  "Eminence", "Maîtres Laitiers du Cotentin", "Aluminium France Extrusion", "Mécarungis", "Loxam",
];

// Périmètre piloté par cp|WIRE : les 8 dossiers ayant une fiche/mémoire côté cockpit.
// (Bellion=0, Tafanel=1, EDL=2, Balas=3, DS Smith=4, IMA=5, Segurel=8, DIAPAR=9)
export const PORTFOLIO_CI = new Set([0, 1, 2, 3, 4, 5, 8, 9]);

const clientName = (ci) => SF_CLIENTS[ci] || ("Client " + ci);

// docs : tableau d'objets { n, ci, k, e, x, y, sp, p, src? }
export function analyseCatalogue(docs, opts = {}) {
  docs = Array.isArray(docs) ? docs : [];
  const now = opts.year || new Date().getFullYear();
  const RECENT = opts.recent != null ? opts.recent : 2;         // années considérées « récentes »
  const seuilFaible = opts.seuilFaible != null ? opts.seuilFaible : 20;

  const perClient = {};
  const ensure = (ci) => (perClient[ci] || (perClient[ci] = {
    ci, nom: clientName(ci), total: 0, clients: 0, derives: 0,
    parType: {}, parAnnee: {}, dernAnnee: null, recents: 0, sansAnnee: 0, aClasser: 0,
    perimetre: PORTFOLIO_CI.has(ci),
  }));

  let orphelins = 0, aClasserTotal = 0, sansAnneeTotal = 0, horsPerimetre = 0;
  const parEspace = {}, parType = {};
  const total = docs.length;

  for (const d of docs) {
    const sp = d.sp || "—";
    const x = d.x || "Autre";
    parEspace[sp] = (parEspace[sp] || 0) + 1;
    parType[x] = (parType[x] || 0) + 1;

    const y = parseInt(d.y, 10);
    const aClasser = (!d.k || d.k === "(à classer)") && d.src !== "cpwire";
    if (aClasser) aClasserTotal++;
    if (!y) sansAnneeTotal++;

    const ci = d.ci;
    if (ci == null || ci < 0) { orphelins++; continue; }   // aucun client rattaché

    const s = ensure(ci);
    s.total++;
    if (sp === "clients") s.clients++;
    s.parType[x] = (s.parType[x] || 0) + 1;
    if (d.src === "cpwire") s.derives++;
    if (aClasser) s.aClasser++;
    if (y) {
      s.parAnnee[y] = (s.parAnnee[y] || 0) + 1;
      s.dernAnnee = Math.max(s.dernAnnee || 0, y);
      if (now - y <= RECENT) s.recents++;
    } else { s.sansAnnee++; }
    if (!PORTFOLIO_CI.has(ci)) horsPerimetre++;
  }

  const clients = Object.values(perClient).map((s) => {
    s.frais = s.dernAnnee != null && (now - s.dernAnnee) <= RECENT;
    s.ancienne = s.dernAnnee != null && (now - s.dernAnnee) > RECENT;
    s.tauxRecent = s.total ? Math.round((s.recents / s.total) * 100) : null;
    return s;
  }).sort((a, b) => b.total - a.total);

  // Couverture du périmètre cp|WIRE : chaque dossier piloté, même absent du catalogue.
  const portfolio = [...PORTFOLIO_CI].map((ci) => {
    const s = perClient[ci];
    return {
      ci, nom: clientName(ci),
      total: s ? s.total : 0,
      derives: s ? s.derives : 0,
      dernAnnee: s ? s.dernAnnee : null,
      recents: s ? s.recents : 0,
      frais: s ? !!s.frais : false,
      faible: (s ? s.total : 0) < seuilFaible,
      absent: !s || s.total === 0,
    };
  }).sort((a, b) => a.total - b.total);

  return {
    total, annee: now, recent: RECENT,
    parEspace, parType,
    orphelins, aClasser: aClasserTotal, sansAnnee: sansAnneeTotal, horsPerimetre,
    clients, portfolio,
    genereLe: new Date().toISOString(),
  };
}
