// deadlines.js — RADAR DES ÉCHÉANCES : le PM porte 9+ dossiers en tête ; chacun a des
// jalons écrits en toutes lettres dans sa fiche (dossiers.js) ou sa mémoire
// (connaissance.js : attentes/notes/contexte) — mais RIEN ne les rassemble jamais.
// Ce module lit ce qui est DÉJÀ écrit et en extrait les dates au format jj/mm[/aaaa],
// sans jamais interpréter le sens : zéro invention, 100% déterministe, comme le reste
// de l'app. Une date sans année voit son année déduite UNIQUEMENT si une autre date de
// la même phrase porte une année explicite (jalons écrits en séquence chronologique) ;
// sinon on retombe sur l'année en cours (ou la suivante si la date est déjà loin dans le
// passé) — et l'origine de l'année est TOUJOURS exposée (yearInferred) pour que l'interface
// puisse le signaler plutôt que de faire croire à une certitude qui n'existe pas.

const MOIS_VALIDE = (m) => m >= 1 && m <= 12;
const JOUR_VALIDE = (j, m, a) => j >= 1 && j <= new Date(a, m, 0).getDate();

// Regex : jj/mm ou jj/mm/aa(aa), jour et mois sur 1-2 chiffres, jamais collé à un chiffre
// supplémentaire avant/après (évite "570 / 410", "AS/400", "RPG/38"…).
const DATE_RE = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/g;

// Découpe un texte en « clauses » (séparées par ; ou . ou —) pour rattacher chaque date
// à son propre segment plutôt qu'à toute la phrase, et pour permettre à deux dates de la
// même clause de partager une année déduite.
function clauses(text) {
  return String(text || "").split(/[;.]|—/).map((s) => s.trim()).filter(Boolean);
}

// Libellé court autour d'une date : le texte entre la date PRÉCÉDENTE de la même clause
// (ou le début de la clause) et celle-ci — jamais reformulé, jamais résumé. Le bornage sur
// la date précédente évite qu'un libellé « déborde » sur la date d'à côté quand une même
// phrase égrène plusieurs jalons (« Cible 15/05, MEP prévisionnelle 01/06/2026 » : le
// libellé de 01/06 ne doit PAS réciter « Cible 15/05 », sous peine de fausse divergence).
function labelAutour(clause, matchIndex, depuis) {
  let before = clause.slice(Math.max(depuis, 0), matchIndex).trim();
  before = before.replace(/^[,;:.\s]+/, "");
  before = before.replace(/^(jalons?|échéances?|dates? clés?)\s*:?\s*/i, "");
  const idx = Math.max(before.lastIndexOf(";"), before.lastIndexOf(":"));
  if (idx >= 0) before = before.slice(idx + 1).trim();
  if (before.length > 70) before = "…" + before.slice(-68);
  return before || clause.slice(0, 60).trim();
}

function anneeComplete(a2or4, ancre) {
  if (!a2or4) return null;
  const n = Number(a2or4);
  if (a2or4.length === 4) return n;
  // 2 chiffres : complète autour de l'année ancre si connue, sinon autour de l'année en cours.
  const base = ancre || new Date().getFullYear();
  const siecle = Math.floor(base / 100) * 100;
  return siecle + n;
}

// Extrait toutes les échéances d'un texte pour un dossier/source donnés.
// Vocabulaire clairement RÉTROSPECTIF : la date qui suit décrit un fait déjà survenu
// (mise à jour de document, PV, compte rendu, démarrage historique, fondation…) — ce
// n'est pas un engagement à venir. Exclusion volontairement simple et explicable plutôt
// qu'une classification « intelligente » qui pourrait se tromper silencieusement.
const RETROSPECTIF_RE = /\b(mis(?:e)? à jour le|PV d[eu]|CR du|compte[- ]rendu du|jalons? trac[ée]s?|acté(?:e)?|démarrage|fondée? en|depuis \d{4}|réalisé(?:e)? le)\b/i;

function extraireTexte(dossier, source, text) {
  const out = [];
  for (const cl of clauses(text)) {
    if (RETROSPECTIF_RE.test(cl)) continue; // décrit le passé, pas une échéance à venir
    // 1) repère une éventuelle année EXPLICITE dans la clause, pour servir d'ancre
    //    aux dates sans année de la même clause (jalons écrits en séquence).
    let ancre = null;
    for (const m of cl.matchAll(DATE_RE)) if (m[3] && m[3].length === 4) { ancre = Number(m[3]); break; }

    let depuis = 0; // fin de la date précédente dans CETTE clause (borne le libellé suivant)
    for (const m of cl.matchAll(DATE_RE)) {
      const jour = Number(m[1]), mois = Number(m[2]);
      if (!MOIS_VALIDE(mois)) { depuis = m.index + m[0].length; continue; }
      let yearInferred = !m[3];
      let annee = m[3] ? anneeComplete(m[3], ancre) : ancre;
      if (annee == null) { annee = new Date().getFullYear(); yearInferred = true; }
      if (!JOUR_VALIDE(jour, mois, annee)) { depuis = m.index + m[0].length; continue; } // faux positif (ex. 31/02)
      let d = new Date(annee, mois - 1, jour);
      // Sans année écrite ET date déjà passée depuis longtemps : probablement l'occurrence
      // suivante (jalon récurrent ou fiche relue en début de cycle) → on avance d'un an.
      if (yearInferred) {
        const joursEcoules = (Date.now() - d.getTime()) / 86400000;
        if (joursEcoules > 45) { annee += 1; d = new Date(annee, mois - 1, jour); }
      }
      out.push({
        dossier, source, date: d.toISOString().slice(0, 10),
        label: labelAutour(cl, m.index, depuis), yearInferred,
      });
      depuis = m.index + m[0].length;
    }
  }
  return out;
}

// Normalise un libellé pour comparaison (minuscules, ponctuation retirée, espaces
// compactés) — jamais utilisé pour l'affichage, seulement pour détecter doublons/divergences.
function normLabel(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
// Similarité simple par mots communs (Jaccard) — suffisant pour repérer « le même jalon
// redit autrement » sans sur-interpréter deux jalons différents qui partagent un mot.
function similaires(a, b) {
  const A = new Set(normLabel(a).split(" ").filter((w) => w.length >= 4));
  const B = new Set(normLabel(b).split(" ").filter((w) => w.length >= 4));
  if (!A.size || !B.size) return false;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / new Set([...A, ...B]).size >= 0.6;
}

// Construit le radar complet : tous dossiers, toutes sources textuelles connues.
// `dossiers` = objet {nom: {description, tech, team}} (dossiers.js readAll())
// `connaissance` = objet {clients: {nom: {contexte, attentes[], notes[]}}} (connaissance.js readConnaissance())
//
// MUTUALISATION : la même échéance est souvent saisie à la fois dans la fiche dossier ET
// dans la mémoire d'équipe (données répétées à la main). Elle n'apparaît ICI qu'une seule
// fois par (dossier, date) — avec le libellé le plus complet des sources qui la mentionnent,
// et la liste de CES sources (pour vérifier qu'elles sont bien d'accord, pas pour les cacher).
//
// DIVERGENCE : si un même libellé (quasi identique) est rattaché à DEUX dates différentes
// entre les sources, ce n'est plus une simple redite — les sources se contredisent. On ne
// choisit JAMAIS laquelle croire (ce serait inventer un arbitrage) : on affiche les deux,
// avec un signalement explicite, pour que ce soit vérifié par un humain.
export function buildDeadlineRadar(dossiers = {}, connaissance = {}) {
  const items = [];
  const noms = new Set([...Object.keys(dossiers || {}), ...Object.keys(connaissance?.clients || {})]);
  for (const nom of noms) {
    const d = dossiers?.[nom];
    if (d?.description) items.push(...extraireTexte(nom, "fiche", d.description));
    const c = connaissance?.clients?.[nom];
    if (c?.contexte) items.push(...extraireTexte(nom, "contexte", c.contexte));
    for (const a of c?.attentes || []) items.push(...extraireTexte(nom, "attentes", a));
    for (const n of c?.notes || []) items.push(...extraireTexte(nom, "notes", n));
  }

  // 1) Mutualise : regroupe par (dossier, date) exact — une seule ligne par échéance réelle,
  //    peu importe combien de fois/où elle est écrite. Le libellé retenu est le plus complet
  //    (le plus long) parmi ceux trouvés ; les autres restent visibles dans `autresLibelles`.
  const parCle = new Map(); // "dossier|date" -> entrée fusionnée
  for (const it of items) {
    const cle = `${it.dossier}|${it.date}`;
    const existant = parCle.get(cle);
    if (!existant) {
      parCle.set(cle, { dossier: it.dossier, date: it.date, yearInferred: it.yearInferred, label: it.label, sources: [it.source], autresLibelles: [] });
    } else {
      if (!existant.sources.includes(it.source)) existant.sources.push(it.source);
      // Année certaine (yearInferred=false) prime toujours sur une année déduite.
      if (existant.yearInferred && !it.yearInferred) existant.yearInferred = false;
      const dejaVu = existant.label === it.label || existant.autresLibelles.includes(it.label);
      if (!dejaVu) {
        if (it.label.length > existant.label.length) { existant.autresLibelles.unshift(existant.label); existant.label = it.label; }
        else existant.autresLibelles.push(it.label);
      }
    }
  }
  const fusionnees = [...parCle.values()];

  // 2) Divergence : deux entrées fusionnées du MÊME dossier, à des dates DIFFÉRENTES, dont
  //    le libellé retenu est quasi identique → les sources ne racontent pas la même chose.
  for (const a of fusionnees) {
    for (const b of fusionnees) {
      if (a === b || a.dossier !== b.dossier || a.date === b.date) continue;
      if (similaires(a.label, b.label)) {
        if (!a.divergence) a.divergence = [];
        if (!a.divergence.some((x) => x.date === b.date)) a.divergence.push({ date: b.date, label: b.label });
      }
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const in31 = new Date(today); in31.setDate(in31.getDate() + 31);
  const retardMax = new Date(today); retardMax.setDate(retardMax.getDate() - 60);

  const withStatut = [];
  for (const it of fusionnees) {
    const d = new Date(it.date + "T00:00:00");
    // Un « retard » de plus de 60 jours est presque certainement un repère historique qui
    // a échappé au filtre rétrospectif (personne ne laisse une vraie échéance dériver ainsi
    // sans la retirer) — on le tait plutôt que de crier au loup sur du bruit. Exception :
    // une échéance en divergence reste affichée même ancienne, car elle signale un vrai
    // désaccord entre sources à corriger, pas juste un jalon dépassé.
    if (d < retardMax && !it.divergence) continue;
    it.joursRestants = Math.round((d - today) / 86400000);
    it.statut = d < today ? "retard" : d <= in7 ? "semaine" : d <= in31 ? "mois" : "plus_tard";
    withStatut.push(it);
  }
  withStatut.sort((a, b) => a.date.localeCompare(b.date));
  return withStatut;
}
