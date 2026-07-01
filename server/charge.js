// charge.js — CHARGE & CAPACITÉ par développeur.
// -----------------------------------------------------------------------------
// La lecture qui manque à un chef de projet TMA pour arbitrer : qui porte quoi,
// qui est en surcharge, qui a de la marge — entièrement tiré des assignations Jira
// réelles. Aucune estimation : on compte des tickets réellement assignés.
//
//   WIP (travail en cours) = tickets actifs côté équipe : en cours + retour de test
//   + recette Armonie. Les statuts « en attente client » / « recette client » ne
//   comptent pas comme charge active (la balle n'est pas dans notre camp).

const WIP_CATS = new Set(["encours", "retourTest", "recetteArmonie"]);
const WAIT_CATS = new Set(["attenteClient", "recetteClient"]);
const CLOSED = new Set(["termine", "miseEnProd", "annule"]);
const CAT_LABEL = { encours: "En cours", retourTest: "Retour de test", recetteArmonie: "Recette Armonie", afaire: "À faire", attenteClient: "Attente client", recetteClient: "Recette client" };

const ageDays = (d) => { if (!d) return null; const t = Date.parse(d); return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000); };

// Seuils (indicatifs) : configurables via variables d'env si besoin d'affiner.
const SURCHARGE = Number(process.env.WIP_SURCHARGE) > 0 ? Number(process.env.WIP_SURCHARGE) : 8;
const MARGE = Number(process.env.WIP_MARGE) >= 0 ? Number(process.env.WIP_MARGE) : 2;

export function buildCharge(issues = []) {
  const devs = {};
  const who = (i) => (i.assigne && String(i.assigne).trim()) ? String(i.assigne).trim() : "— Non assigné";
  const get = (name) => (devs[name] ||= { dev: name, wip: 0, afaire: 0, attente: 0, clos: 0, total: 0, parCat: {}, dossiers: {}, oldestActiveJours: null });

  for (const i of issues) {
    const name = who(i);
    const d = get(name);
    d.total += 1;
    d.dossiers[i.dossier || "—"] = (d.dossiers[i.dossier || "—"] || 0) + 1;
    if (CLOSED.has(i.categorie)) { d.clos += 1; continue; }
    if (i.categorie === "afaire") { d.afaire += 1; }
    else if (WAIT_CATS.has(i.categorie)) { d.attente += 1; }
    else if (WIP_CATS.has(i.categorie)) {
      d.wip += 1;
      d.parCat[i.categorie] = (d.parCat[i.categorie] || 0) + 1;
      const a = ageDays(i.statutDepuis || i.maj);
      if (a != null && (d.oldestActiveJours == null || a > d.oldestActiveJours)) d.oldestActiveJours = a;
    }
  }

  const list = Object.values(devs).map((d) => {
    const dossiers = Object.entries(d.dossiers).sort((a, b) => b[1] - a[1]).map(([nom, n]) => ({ nom, n }));
    const parCat = Object.entries(d.parCat).map(([c, n]) => ({ cat: c, label: CAT_LABEL[c] || c, n })).sort((a, b) => b.n - a.n);
    const nonAssigne = d.dev.startsWith("—");
    const etat = nonAssigne ? "non_assigne" : d.wip >= SURCHARGE ? "surcharge" : d.wip <= MARGE ? "marge" : "ok";
    return { dev: d.dev, wip: d.wip, afaire: d.afaire, attente: d.attente, clos: d.clos, total: d.total, parCat, dossiers, oldestActiveJours: d.oldestActiveJours, etat, nonAssigne };
  });

  // Tri : personnes réelles par WIP décroissant, « Non assigné » relégué en fin.
  list.sort((a, b) => (a.nonAssigne - b.nonAssigne) || (b.wip - a.wip) || (b.total - a.total));

  const equipe = list.filter((d) => !d.nonAssigne);
  const wipTotal = equipe.reduce((s, d) => s + d.wip, 0);
  return {
    generatedAt: new Date().toISOString(),
    devs: list,
    seuils: { surcharge: SURCHARGE, marge: MARGE },
    stats: {
      personnes: equipe.length,
      wipTotal,
      wipMoyen: equipe.length ? Math.round((wipTotal / equipe.length) * 10) / 10 : 0,
      surcharges: equipe.filter((d) => d.etat === "surcharge").length,
      marges: equipe.filter((d) => d.etat === "marge").length,
      nonAssignes: (list.find((d) => d.nonAssigne)?.wip) || 0,
    },
  };
}
