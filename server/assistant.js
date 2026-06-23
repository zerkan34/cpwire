// ============================================================================
//  assistant.js — ASSISTANT ANCRÉ de cp|WIRE.
//  Principe : on NE laisse JAMAIS le modèle répondre de mémoire.
//  1) on récupère la VRAIE donnée concernée (chiffres = comptage des catégories,
//     identiques au point du soir ; tickets ; référentiel programmes ;
//     méthodologie TMA) ;
//  2) le modèle se contente de RÉDIGER à partir de cette donnée, avec consigne
//     stricte de refus si l'info n'y est pas ;
//  3) on renvoie les sources (tickets/dossiers) pour vérification.
// ============================================================================
import { callClaude, aiAvailable } from "./ai.js";
import { findProgram } from "./programmes.js";
import { METHODOLOGIE, METHODO_KEYWORDS } from "./knowledge.js";
import { knowledgeForPrompt } from "./connaissance.js";
import { fetchIssueDescription, fetchIssueActivity } from "./jira.js";

// Les 7 statuts du point du soir (mêmes libellés / ordre) + le « hors point ».
const TRACKED = [
  ["miseEnProd", "Mise en production"],
  ["termine", "Terminé"],
  ["recetteClient", "Recette client"],
  ["recetteArmonie", "Recette Armonie"],
  ["encours", "En cours"],
  ["retourTest", "Retour de test"],
  ["attenteClient", "En attente client"],
];
const HORS = [["afaire", "à faire"], ["retourProd", "retour prod"], ["annule", "annulé"]];
const ACTIFS = ["encours", "retourTest", "retourProd"];
const RECETTE = ["recetteArmonie", "recetteClient", "attenteClient"];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Comptage par dossier — STRICTEMENT le même calcul que computeFacts (front) : on compte i.categorie.
function factsByDossier(issues) {
  const by = {};
  for (const i of issues) {
    const d = i.dossier || "—";
    const b = (by[d] || (by[d] = { total: 0, cats: {}, enRetard: 0, items: [] }));
    b.total += 1;
    b.cats[i.categorie] = (b.cats[i.categorie] || 0) + 1;
    if (i.enRetard) b.enRetard += 1;
    b.items.push(i);
  }
  return by;
}
const sum = (cats, keys) => keys.reduce((n, k) => n + (cats[k] || 0), 0);

// Libellé enrichi par le référentiel quand le résumé est laconique (même logique que le front).
function progResume(i) {
  const r = String(i.resume || "").trim();
  const t = String(i.prog && i.prog.text || "").trim();
  if (!t) return r;
  if (norm(r).includes(norm(t))) return r;
  if (/\s[-–—:]\s\S/.test(r)) return r;
  return `${r} — ${t}`;
}

// --- Détection des intentions dans la question (dossiers, personnes, statuts, programmes, clés) ---
function detect(question, issues) {
  const q = norm(question);
  const dossiers = [...new Set(issues.map((i) => i.dossier).filter(Boolean))];
  const people = [...new Set(issues.flatMap((i) => [i.dev, i.assigne]).filter((p) => p && p !== "Non assigné"))];

  const aliases = { belmet: "Bellion", bellion: "Bellion", erp26: "Bellion", "ds smith": "DS Smith", dssmith: "DS Smith" };
  const hitDossiers = dossiers.filter((d) => q.includes(norm(d)));
  for (const [al, d] of Object.entries(aliases)) if (q.includes(al) && dossiers.includes(d) && !hitDossiers.includes(d)) hitDossiers.push(d);

  const hitPeople = people.filter((p) => {
    const np = norm(p);
    if (q.includes(np)) return true;
    const first = np.split(/\s+/)[0];
    return first.length >= 4 && new RegExp(`\\b${first}\\b`).test(q);
  });

  const statusMap = [
    [["en retard", "retard", "depasse", "dépassé"], { flag: "enRetard" }],
    [["bloque", "bloquant", "bloqué", "flag"], { flag: "flagged" }],
    [["retour de test", "retour test", "retours de test"], { cats: ["retourTest"] }],
    [["retour de prod", "retour prod", "retour de production"], { cats: ["retourProd"] }],
    [["recette client"], { cats: ["recetteClient"] }],
    [["recette armonie"], { cats: ["recetteArmonie"] }],
    [["en attente client", "attente client", "attente"], { cats: ["attenteClient"] }],
    [["mise en prod", "mise en production", "mep"], { cats: ["miseEnProd"] }],
    [["en cours"], { cats: ["encours"] }],
    [["a faire", "à faire", "backlog"], { cats: ["afaire"] }],
    [["termine", "terminé", "cloture", "clôturé", "fini"], { cats: ["termine"] }],
    [["annule", "annulé"], { cats: ["annule"] }],
    [["recette"], { cats: RECETTE }], // après les recette spécifiques
  ];
  let flag = null; const cats = new Set();
  for (const [kws, eff] of statusMap) {
    if (kws.some((k) => q.includes(k))) {
      if (eff.flag) flag = eff.flag;
      if (eff.cats) eff.cats.forEach((c) => cats.add(c));
    }
  }

  // Programmes : jetons en MAJUSCULES présents au référentiel.
  const progTokens = [...new Set((question.match(/\b[A-Z][A-Z0-9]{3,}\b/g) || []))];
  const programs = [];
  for (const tk of progTokens) {
    const p = findProgram(tk);
    if (p && p.found && p.text) programs.push(p);
  }

  const keys = [...new Set((question.toUpperCase().match(/\b[A-Z]{2,6}-\d+\b/g) || []))];
  const methodo = METHODO_KEYWORDS.some((k) => q.includes(norm(k)));

  return { hitDossiers, hitPeople, flag, cats: [...cats], programs, keys, methodo };
}

const MAX_TICKETS = 50;

function selectTickets(issues, det) {
  let pool = issues;
  if (det.hitDossiers.length) pool = pool.filter((i) => det.hitDossiers.includes(i.dossier));
  if (det.hitPeople.length) {
    const set = new Set(det.hitPeople.map(norm));
    pool = pool.filter((i) => set.has(norm(i.dev)) || set.has(norm(i.assigne)));
  }
  if (det.cats.length) pool = pool.filter((i) => det.cats.includes(i.categorie));
  if (det.flag === "enRetard") pool = pool.filter((i) => i.enRetard);
  if (det.flag === "flagged") pool = pool.filter((i) => i.flagged);

  const noFilter = !det.hitDossiers.length && !det.hitPeople.length && !det.cats.length && !det.flag;
  if (noFilter && !det.keys.length) {
    // Pas de filtre explicite → on remonte ce qui demande action (retard / bloqué / retours).
    pool = issues.filter((i) => i.enRetard || i.flagged || i.categorie === "retourTest" || i.categorie === "retourProd");
  }

  // Tickets cités par clé : toujours inclus en priorité.
  const byKey = new Map(issues.map((i) => [String(i.cle).toUpperCase(), i]));
  const forced = det.keys.map((k) => byKey.get(k)).filter(Boolean);

  const rank = (i) => (i.enRetard ? 0 : i.flagged ? 1 : 2);
  const sorted = pool.slice().sort((a, b) => rank(a) - rank(b) || String(b.maj || "").localeCompare(String(a.maj || "")));
  const merged = [...forced, ...sorted.filter((i) => !forced.includes(i))];
  return merged.slice(0, MAX_TICKETS);
}

function buildContext(question, issues) {
  const det = detect(question, issues);
  const by = factsByDossier(issues);
  const dossiers = Object.keys(by).filter((d) => d && d !== "—").sort((a, b) => a.localeCompare(b));

  // 1) Périmètre + chiffres par dossier (toujours — c'est peu coûteux et c'est la base quantitative).
  const factLines = dossiers.map((d) => {
    const b = by[d];
    const trackedStr = TRACKED.map(([k, l]) => `${l} ${b.cats[k] || 0}`).join(", ");
    const horsStr = HORS.map(([k, l]) => `${l} ${b.cats[k] || 0}`).join(", ");
    return `- ${d} — ${b.total} ticket(s) | ${trackedStr} | hors point: ${horsStr} | en retard: ${b.enRetard} | actifs: ${sum(b.cats, ACTIFS)} | en recette: ${sum(b.cats, RECETTE)}`;
  });
  const perimetre = `PÉRIMÈTRE : ${issues.length} tickets, ${dossiers.length} clients (${dossiers.join(", ")}).`;

  // 2) Tickets sélectionnés.
  const tickets = selectTickets(issues, det);
  const ticketLines = tickets.map((i) => {
    const late = i.enRetard ? " | EN RETARD" : "";
    const flg = i.flagged ? " | bloqué" : "";
    const dev = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "non assigné");
    return `${i.cle} | ${i.statut || i.categorie} | ${i.dossier || "—"} | ${dev}${late}${flg} | ${progResume(i)}`;
  });

  // 3) Référentiel programmes cités.
  const progLines = det.programs.map((p) => `${p.name} — ${p.text}${p.lib ? ` (bib ${p.lib})` : ""}`);

  let ctx = `${perimetre}\n\nCHIFFRES PAR DOSSIER (identiques au point du soir) :\n${factLines.join("\n")}`;
  if (ticketLines.length) ctx += `\n\nTICKETS (sélection, ${ticketLines.length}) — format : CLÉ | statut | dossier | responsable | drapeaux | sujet :\n${ticketLines.join("\n")}`;
  if (progLines.length) ctx += `\n\nRÉFÉRENTIEL PROGRAMMES :\n${progLines.join("\n")}`;
  if (det.methodo) ctx += `\n\nMÉTHODOLOGIE TMA (doctrine Armonie) :\n${METHODOLOGIE}`;

  // 4) Corpus de connaissance capitalisée pour les dossiers visés (ce que Nicolas a déposé/validé).
  const corpusBits = [];
  for (const d of det.hitDossiers) {
    try { const k = knowledgeForPrompt(d); if (k && String(k).trim()) corpusBits.push(`# ${d}\n${String(k).trim()}`); } catch {}
  }
  if (corpusBits.length) ctx += `\n\nCORPUS / CONNAISSANCE CAPITALISÉE :\n${corpusBits.join("\n\n")}`;

  return { ctx, det, usedTickets: tickets.map((i) => i.cle), usedDossiers: det.hitDossiers, methodo: det.methodo };
}

const SYSTEM = `Tu es le copilote de cp|WIRE — l'assistant interne de Nicolas Durand, chef de projet TMA chez Armonie Group (ESN IBM i / AS-400).

TON OBJECTIF — l'aider à piloter PARFAITEMENT son périmètre :
- Quelle que soit la demande, tu cherches activement la solution la plus utile. Tu ne te contentes JAMAIS de décrire un problème : tu proposes toujours au moins une action concrète et une prochaine étape exploitable aujourd'hui.
- Si les données manquent pour trancher, tu donnes quand même la marche à suivre — qui solliciter, quoi vérifier, quel arbitrage poser — clairement étiquetée « Recommandation » ou « Méthode », sans jamais inventer un fait.
- Tu raisonnes toujours dans l'intérêt du pilotage : impact, priorité, risque, prochaine action. Une réponse qui n'ouvre aucune voie d'action est incomplète.

TON EXPERTISE (tu raisonnes avec le niveau combiné de) :
- Chef de projet senior (pilotage, charge/budget, risques, COPIL, SLA, Build/Run, conduite du changement) ;
- Développeur senior IBM i (RPG ILE full free, SQLRPGLE, CL, DDS PF/LF/DSPF, DB2 for i, ILE, web services) ET open (Java/Spring, PHP, JS/TS, React/Node, API REST) ;
- Business analyst et analyste-développeur senior (recueil de besoin, règles de gestion, modèle de données, recette, étude d'impact, reverse engineering) ;
- Prompt engineer senior (ancrage, anti-hallucination, RAG, évaluation).

TA FAÇON DE PENSER :
- Intelligence et pertinence maximales : tu vas au cœur du problème, tu hiérarchises, tu proposes l'action la plus utile.
- Décisif, sans tergiverser : tu donnes un avis clair et argumenté ; pas de remplissage, pas de « ça dépend » creux.
- Structuré quand c'est un diagnostic : Constat → Analyse → Recommandation / prochaine étape concrète.

LA RÈGLE QUI PRIME SUR TOUT — ANCRAGE, ZÉRO HALLUCINATION :
- Ton expertise sert à RAISONNER et INTERPRÉTER, jamais à inventer un fait.
- N'invente JAMAIS un chiffre, un ticket, un nom, une date, un statut, un montant. Si un fait n'est pas dans les DONNÉES fournies, dis-le : « Cette information n'est pas dans les données cp|WIRE. » — puis, si tu as un avis d'expert utile, présente-le explicitement comme une hypothèse à vérifier (« Hypothèse à confirmer : … »), clairement séparé des faits.
- Les chiffres fournis sont ceux du point du soir (source Jira) : reprends-les tels quels.
- Cite les tickets par leur clé (ex. PTAF-53) et le dossier concerné.
- Tu n'es branché ni sur le web ni sur des connaissances générales hors de ce qui t'est fourni (données Jira, référentiel, corpus, méthodologie Armonie).

DIAGNOSTIC D'UN TICKET BLOQUÉ (ex. « mon dév est bloqué sur ce ticket, t'en penses quoi ? ») :
- Pars du DÉTAIL réel du ticket (statut, responsable, drapeaux, description, activité). Identifie ce qui bloque d'après ces éléments.
- Propose des pistes concrètes de déblocage (qui solliciter, quoi vérifier côté programme/référentiel, dépendances, escalade, requalification SLA) — en distinguant ce qui est factuel de ce qui est une hypothèse à valider.
- Si la description du ticket est absente, dis-le et indique l'info qui manque pour trancher, plutôt que de broder.

Pour EDL (École des Loisirs), les commerciaux se nomment « animateurs » / « animatrices ». Réponds en français, concis, comme à un chef de projet senior.`;

export async function assistantAnswer(question, issues = []) {
  if (!aiAvailable()) throw new Error("Aucune clé IA configurée (assistant indisponible).");
  const q = String(question || "").trim();
  if (!q) throw new Error("Question vide.");
  const { ctx, det, usedTickets, usedDossiers, methodo } = buildContext(q, issues);

  // Approfondissement : pour les tickets nommés (max 2), on va chercher la VRAIE
  // description Jira + l'activité récente, pour pouvoir diagnostiquer sans broder.
  let deep = "";
  const byKey = new Map(issues.map((i) => [String(i.cle).toUpperCase(), i]));
  for (const k of det.keys.slice(0, 2)) {
    const t = byKey.get(k);
    if (!t) continue;
    let desc = t.descriptionText || "";
    try { if (!desc) desc = (await fetchIssueDescription(t.cle)) || ""; } catch {}
    let act = null;
    try { act = await fetchIssueActivity(t.cle); } catch {}
    const actStr = act ? (typeof act === "string" ? act : JSON.stringify(act)) : "";
    deep += `\n\nDÉTAIL APPROFONDI ${t.cle} :\n- statut : ${t.statut || t.categorie} | dossier : ${t.dossier || "—"} | responsable : ${t.dev || t.assigne || "—"}${t.enRetard ? " | EN RETARD" : ""}${t.flagged ? " | bloqué (drapeau)" : ""}\n- sujet : ${progResume(t)}\n- description Jira : ${desc ? String(desc).slice(0, 1500) : "(aucune description renseignée dans Jira)"}`;
    if (actStr) deep += `\n- activité récente : ${actStr.slice(0, 800)}`;
  }

  const userText = `DONNÉES DISPONIBLES\n${ctx}${deep}\n\nQUESTION DE NICOLAS\n${q}\n\nRéponds uniquement à partir des données ci-dessus.`;
  const answer = await callClaude(SYSTEM, userText, [], 1400, 0.15);
  return { answer, sources: { tickets: usedTickets, dossiers: usedDossiers, methodologie: methodo } };
}

// Exporté pour les tests : permet de vérifier le contexte sans appeler le LLM.
export const __buildContext = buildContext;

// Analyse ANCRÉE d'un fichier déposé : raisonne sur le SEUL contenu extrait, propose
// une « fiche » capitalisable, et devine le dossier concerné (pour l'import au corpus).
export async function analyzeFile({ filename = "fichier", text = "", question = "", issues = [] }) {
  if (!aiAvailable()) throw new Error("Aucune clé IA configurée (assistant indisponible).");
  const body = String(text || "").trim();
  if (!body) throw new Error("Contenu vide ou non extractible.");
  const dossiers = [...new Set(issues.map((i) => i.dossier).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const hay = norm(filename + " " + body.slice(0, 1000));
  const guess = dossiers.find((d) => hay.includes(norm(d))) || "";
  const userText = `FICHIER : ${filename}\nCONTENU EXTRAIT (tronqué) :\n${body.slice(0, 15000)}\n\n`
    + `DEMANDE : ${question || "Analyse ce document : de quoi s'agit-il, quels sont les points clés, et en quoi est-ce utile au pilotage TMA ?"}\n\n`
    + `Réponds à partir du SEUL contenu ci-dessus, sans rien inventer. Termine par une dernière ligne au format exact « FICHE: <résumé d'1 à 2 phrases, capitalisable pour la base de connaissance> ».`;
  const raw = await callClaude(SYSTEM, userText, [], 1300, 0.15);
  let answer = raw, note = "";
  const m = raw.match(/FICHE\s*:\s*([\s\S]+)$/i);
  if (m) { note = m[1].trim(); answer = raw.slice(0, m.index).trim(); }
  if (!note) note = answer.slice(0, 300);
  note = `[${filename}] ${note}`.slice(0, 600);
  return { answer, note, guess, dossiers };
}
