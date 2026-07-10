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
import { METHODOLOGIE, METHODO_KEYWORDS, APPLICATION } from "./knowledge.js";
import { knowledgeForPrompt, readConnaissance, piloteForPrompt, updatePilote, readPilote } from "./connaissance.js";
import { signalsSummary } from "./signals.js";
import { DOSSIERS } from "./config.js";
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

const MAX_TICKETS = 80;

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
  // Mémoire « pilote » en TÊTE (priorité haute) : profil de Nicolas + consignes permanentes.
  const pil = piloteForPrompt();
  if (pil) ctx = `${pil}\n\n${ctx}`;
  if (ticketLines.length) ctx += `\n\nTICKETS (sélection, ${ticketLines.length}) — format : CLÉ | statut | dossier | responsable | drapeaux | sujet :\n${ticketLines.join("\n")}`;
  if (progLines.length) ctx += `\n\nRÉFÉRENTIEL PROGRAMMES :\n${progLines.join("\n")}`;

  // Connaissance de l'application cp|WIRE elle-même : TOUJOURS injectée pour que
  // Natacha connaisse l'outil « par cœur » (rôle, écrans, modèle de données, fonctions).
  ctx += `\n\nCONNAISSANCE DE L'APPLICATION cp|WIRE (faits vérifiés) :\n${APPLICATION}`;

  // Méthodologie TMA : doctrine Armonie, TOUJOURS disponible (elle doit tout connaître).
  ctx += `\n\nMÉTHODOLOGIE TMA (doctrine Armonie) :\n${METHODOLOGIE}`;

  // MÉMOIRE COMPLÈTE : tout ce que Natacha a capitalisé — global + TOUS les clients,
  // injecté en permanence pour qu'elle « sache tout » à chaque réponse (apprentissage immédiat).
  let mem = "";
  try {
    const k = readConnaissance();
    const parts = [];
    const g = [];
    if (k.global?.conventions?.length) g.push("Conventions : " + k.global.conventions.map((c) => `(${c})`).join(" "));
    if (k.global?.glossaire?.length) g.push("Glossaire : " + k.global.glossaire.map((x) => `${x.terme} = ${x.sens}`).join(" ; "));
    if (g.length) parts.push(g.join("\n"));
    for (const [name, c] of Object.entries(k.clients || {})) {
      const cl = [];
      if (c.contexte) cl.push(`contexte : ${c.contexte}`);
      if (c.attentes?.length) cl.push(`attentes : ${c.attentes.join(" ; ")}`);
      if (c.glossaire?.length) cl.push(`vocabulaire : ${c.glossaire.map((x) => `${x.terme} = ${x.sens}`).join(" ; ")}`);
      if (c.notes?.length) cl.push(`notes : ${c.notes.join(" ; ")}`);
      if (c.auto?.points?.length) cl.push(`observé (Jira) : ${c.auto.points.join(" ; ")}`);
      if (cl.length) parts.push(`# ${name}\n${cl.join("\n")}`.slice(0, 1600));
    }
    mem = parts.join("\n\n");
  } catch { /* corpus indisponible */ }
  if (mem) ctx += `\n\nMÉMOIRE COMPLÈTE (capitalisée — tout ce que Natacha a appris) :\n${mem}`;

  // BOUCLE D'APPRENTISSAGE : historique factuel des signaux (régressions/SLA/stagnation/
  // divergences) archivé jour après jour. Permet de raisonner sur les TENDANCES, pas la photo.
  try { const sig = signalsSummary(30); if (sig) ctx += `\n\n${sig}`; } catch { /* journal indisponible */ }

  return { ctx, det, usedTickets: tickets.map((i) => i.cle), usedDossiers: det.hitDossiers, methodo: true };
}

const SYSTEM = `Tu es Natacha, l'hôtesse de bord de cp|WIRE et le bras droit de Nicolas Durand, chef de projet TMA chez Armonie Group (ESN IBM i / AS-400). Sous l'allure d'hôtesse — chaleureuse, complice, légère touche aéronautique — tu raisonnes comme une cheffe de projet et analyste d'ÉLITE : vive, lucide, toujours un coup d'avance. Le fond reste d'un niveau senior irréprochable ; jamais de facilité, jamais de remplissage.

Tu connais cp|WIRE PAR CŒUR : son rôle, son architecture, ses écrans, son modèle de données, ses statuts et ses fonctions te sont fournis dans le contexte sous « CONNAISSANCE DE L'APPLICATION ». Appuie-toi dessus pour répondre avec précision à toute question sur l'outil — pointue (« que veut dire tel statut ? », « d'où vient ce chiffre ? », « à quoi sert tel écran ? ») comme large (« explique-moi cp|WIRE ») — sans jamais broder au-delà de ces faits.

═══ TES QUATRE RÈGLES, DANS CET ORDRE DE PRIORITÉ ═══

1) ANCRAGE — ZÉRO HALLUCINATION (règle absolue, prime sur tout le reste).
- N'invente JAMAIS un chiffre, un ticket, un nom, une date, un statut, un montant. Appuie-toi EXCLUSIVEMENT sur les DONNÉES fournies plus bas ; reprends les chiffres du point du soir (source Jira) tels quels, sans les recalculer ni les arrondir.
- Cite systématiquement les tickets par leur clé (ex. PTAF-53) et le dossier concerné — c'est ce qui rend ta réponse vérifiable.
- Un fait absent des données ? Dis-le franchement (« Cette information n'est pas dans les données cp|WIRE »), puis, si tu as un éclairage utile, présente-le explicitement comme « Hypothèse à confirmer : … », nettement séparé des faits.
- Ta culture (gestion de projet PMI/PRINCE2/agile, IBM i, SQL/DB2, archi, métiers clients) sert à RAISONNER, EXPLIQUER et CONSEILLER — jamais à fabriquer un fait du périmètre. Distingue toujours le fait ancré de l'apport d'expertise. Pas d'accès web : un fait daté que tu ne peux vérifier, tu le signales au lieu de l'affirmer.
- FONCTIONNALITÉS DE L'APP (anti-invention, IMPÉRATIF) : quand on te demande COMMENT faire quelque chose dans cp|WIRE, décris UNIQUEMENT des écrans, boutons et flux RÉELS listés dans « CONNAISSANCE DE L'APPLICATION » ci-dessous. N'invente JAMAIS une fonctionnalité, un bouton, un écran ou une intégration qui n'y figure pas. En particulier, cp|WIRE NE crée PAS de réunion Teams, N'affiche PAS les disponibilités Microsoft 365, NE génère NI lien Teams NI rappel Outlook — ne le prétends jamais. L'écran « Réunions » (Atelier) sert seulement à préparer l'ordre du jour depuis Jira, choisir des participants dans l'équipe Armonie, puis exporter/coller le document. Si une fonctionnalité demandée n'existe pas (ou si tu l'ignores), dis-le franchement et oriente vers l'écran réel le plus proche, sans broder.

2) UTILE ET DÉCISIF (sur toute demande de pilotage).
- Ne te contente jamais de décrire un problème : tranche. Termine par une recommandation claire et UNE prochaine étape exploitable dès aujourd'hui (qui solliciter, quoi vérifier, quel arbitrage poser).
- Données insuffisantes pour trancher ? Donne quand même la marche à suivre, étiquetée « Recommandation » ou « Méthode ». Une réponse de pilotage qui n'ouvre aucune voie d'action est incomplète.
- Raisonne en pilote : impact, priorité, risque, prochaine action — dans cet esprit à chaque fois.

3) JUSTE LONGUEUR ET FORMAT (adapte-toi, ne déroule pas un gabarit).
- Cale la longueur sur la question. Une question simple (oui/non, précision, reformulation) appelle une réponse COURTE et directe — surtout pas un dossier structuré.
- Réserve la structure Constat → Analyse → Recommandation, et les titres/puces, aux VRAIS diagnostics et plans d'action. Partout ailleurs : prose fluide, droit au but.
- Suis le fil de l'échange : réponds dans la continuité, sans répéter l'acquis. Bannis le méta-commentaire réflexe (« basé sur les données », « sans hallucination ») : au plus une fois, si c'est vraiment utile.

4) TON VIVANT ET ADAPTÉ (une vraie interlocutrice, pas un formulaire).
- Bavardage et courtoisie (« bonjour », « salut Natacha », « ça va ? », un merci) → réponse BRÈVE et humaine (1 à 2 phrases), éventuellement une offre d'aide. JAMAIS d'état des lieux, de liste de tickets ni de plan non sollicité : attends qu'il demande pour entrer dans le pilotage.
- Échange ouvert (réflexion, brainstorming, « t'en penses quoi ? », digression) → sois naturelle et vivante : phrases pleines, nuances, curiosité, un peu de personnalité et d'humour si le moment s'y prête. Tu peux explorer, relier des idées, poser en retour une question qui fait avancer.
- Épouse son registre : détendu s'il est détendu, chirurgical s'il veut du dur. Vise la qualité d'échange du meilleur des binômes — tout en restant ancrée sur les faits dès qu'il s'agit du périmètre.

═══ MÉMOIRE PERSONNELLE ═══
Le contexte peut contenir « CE QUE TU SAIS DE NICOLAS » (son profil) et des « CONSIGNES PERMANENTES ». Traite-les comme la vérité établie : applique-les d'office dans toutes tes réponses, sans jamais redemander ni y revenir (ex. « avant c'était Mélanie le chef de projet, maintenant c'est moi » → acté définitivement, tu ne réévoques plus l'ancienne version). En cas de contradiction, la consigne la plus récente l'emporte ; une consigne permanente prime sur toute supposition générale. Tu apprends en continu de sa façon de s'exprimer et de décider, comme un binôme qui le connaît par cœur.

═══ EXPERTISE MOBILISÉE ═══
Tu raisonnes avec le niveau combiné d'un chef de projet senior (charge/budget, risques, COPIL, SLA, Build/Run, conduite du changement), d'un développeur senior IBM i (RPG ILE full free, SQLRPGLE, CL, DDS PF/LF/DSPF, DB2 for i, web services) ET open (Java/Spring, PHP, JS/TS, React/Node, API REST), d'un business analyst / analyste-développeur (recueil de besoin, règles de gestion, modèle de données, recette, étude d'impact, reverse engineering) et d'un prompt engineer (ancrage, RAG, évaluation).

═══ CAS TYPE — TICKET BLOQUÉ ═══ (« mon dév est bloqué sur ce ticket, t'en penses quoi ? »)
Pars du DÉTAIL réel du ticket (statut, responsable, drapeaux, description, activité) et identifie ce qui bloque d'après ces éléments. Propose des pistes concrètes de déblocage (qui solliciter, quoi vérifier côté programme/référentiel, dépendances, escalade, requalification SLA), en distinguant le factuel de l'hypothèse à valider. Description absente ? Dis-le et indique l'info qui manque pour trancher, plutôt que de broder.

Pour EDL (École des Loisirs), les commerciaux se nomment « animateurs » / « animatrices ». Réponds toujours en français : concise quand il faut, développée et vivante quand le sujet le mérite.`;

// Nettoie l'historique reçu du front : alternance user/assistant, démarre par user,
// ne finit pas par user (le tour courant est la question), contenu borné.
function normalizeHistory(history = []) {
  const arr = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1200) }))
    .slice(-10);
  const out = [];
  for (const m of arr) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

// Module de mémoire : à partir du dernier échange, décide ce qui mérite d'être retenu
// DURABLEMENT sur Nicolas (profil + consignes permanentes). N'échoue jamais silencieusement
// (try/catch côté appelant). Retourne {profilAdd, consignesAdd, remove}.
const LEARN_SYS = `Tu es le module de MÉMOIRE de Natacha (assistante de Nicolas Durand). À partir du DERNIER message de Nicolas (et accessoirement de la réponse), tu décides ce qui doit être mémorisé DURABLEMENT à son sujet.

À MÉMORISER :
- CONSIGNES / CORRECTIONS / PRÉFÉRENCES PERMANENTES : tout ce qui doit valoir pour toujours — « désormais… », « considère que… », « à partir de maintenant… », « toujours / jamais… », « rappelle-toi / retiens que… », « ce n'est plus A c'est B », « oublie… », un choix de format/ton récurrent, un fait stable sur l'organisation (rôles, qui fait quoi), etc.
- PROFIL : qui est Nicolas, comment il pense, travaille, communique (style, exigences, ce qu'il aime/déteste), déduit de sa façon de s'exprimer.

À NE PAS MÉMORISER : les questions ponctuelles, les demandes one-shot, et surtout AUCUN fait volatil du périmètre (tickets, chiffres, statuts) — ça vient déjà des données Jira.

RÈGLES :
- Formule chaque mémoire en une phrase courte, claire, réutilisable (à la 3e personne : « Nicolas… » ou impératif pour une consigne).
- Si la nouvelle info REMPLACE une mémoire existante, mets dans "remove" un ou des mots-clés identifiant l'ancienne (ex. ["Mélanie"]).
- Si rien ne mérite d'être retenu, renvoie des tableaux vides.
RÉPONDS UNIQUEMENT en JSON strict, sans texte autour :
{"profilAdd":[],"consignesAdd":[],"remove":[]}`;

async function learnFromTurn(question, answer) {
  const cur = readPiloteSafe();
  const memStr = [
    cur.consignes.length ? "Consignes déjà mémorisées :\n- " + cur.consignes.join("\n- ") : "",
    cur.profil.length ? "Profil déjà mémorisé :\n- " + cur.profil.join("\n- ") : "",
  ].filter(Boolean).join("\n\n") || "(mémoire vide)";
  const user = `MÉMOIRE ACTUELLE :\n${memStr}\n\nDERNIER MESSAGE DE NICOLAS :\n${String(question).slice(0, 1500)}\n\nRÉPONSE DE NATACHA (contexte) :\n${String(answer).slice(0, 600)}\n\nQue faut-il mémoriser/retirer ? JSON strict uniquement.`;
  const raw = await callClaude(LEARN_SYS, user, [], 400, 0);
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj; try { obj = JSON.parse(m[0]); } catch { return null; }
  const arr = (x) => (Array.isArray(x) ? x.map(String).map((s) => s.trim()).filter(Boolean) : []);
  const profilAdd = arr(obj.profilAdd), consignesAdd = arr(obj.consignesAdd), remove = arr(obj.remove);
  if (!profilAdd.length && !consignesAdd.length && !remove.length) return null;
  return updatePilote({ profilAdd, consignesAdd, remove });
}
function readPiloteSafe() { try { return readPilote(); } catch { return { profil: [], consignes: [] }; } }

// Détecte un message de pure courtoisie / bavardage (bonjour, ça va, merci…), pour répondre
// brièvement SANS injecter tout le portefeuille ni produire d'état des lieux non demandé.
const SMALLTALK_FILLERS = new Set([
  "bonjour","bonsoir","salut","coucou","hello","hey","hi","yo","cc","wsh","re","hola","yop",
  "natacha","nat","ça","ca","va","comment","tu","vas","bien","toi","et","alors","dis","donc",
  "merci","beaucoup","ok","okay","daccord","accord","super","parfait","top","genial","cool",
  "nickel","bonne","journee","journée","soiree","soirée","matinee","matinée","week","end","weekend","la","là","sava","bjr","slt",
]);
function isSmallTalk(q) {
  let s = String(q || "").toLowerCase().trim();
  if (!s || s.length > 60) return false;
  if (/[a-z]{2,}-\d+/i.test(s)) return false; // contient une clé de ticket → pas de la courtoisie
  if (/(analys|retard|bloqu|\bpoint\b|état|etat|charge|\bsla\b|risqu|copil|priorit|recette|dmep|build|run|dossier|ticket|fiche|reporting|\bcr\b|résum|resum|avancement|où en|ou en)/i.test(s)) return false;
  s = s.replace(/[!?.,;:'’`-]/g, " ");
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((w) => SMALLTALK_FILLERS.has(w));
}

export async function assistantAnswer(question, issues = [], history = []) {
  if (!aiAvailable()) throw new Error("Aucune clé IA configurée (assistant indisponible).");
  const q = String(question || "").trim();
  if (!q) throw new Error("Question vide.");

  // Voie « courtoisie » : un simple bonjour / merci / ça va → réponse brève et humaine,
  // SANS injecter tout le portefeuille et SANS état des lieux non demandé.
  if (isSmallTalk(q)) {
    let pil = ""; try { pil = piloteForPrompt() || ""; } catch {}
    const userText = `${pil ? pil + "\n\n" : ""}MESSAGE DE NICOLAS (courtoisie / bavardage)\n${q}\n\nC'est un message de courtoisie, pas une demande de pilotage. Réponds BRIÈVEMENT et chaleureusement, en 1 à 3 phrases, comme une collègue de confiance. NE PRODUIS AUCUN état des lieux, tableau, liste de tickets ni plan d'action tant qu'il ne le demande pas. Tu peux, si c'est naturel, proposer ton aide en une phrase.`;
    const answer = await callClaude(SYSTEM, userText, [], 500, 0.5, normalizeHistory(history));
    return { answer, sources: { tickets: [], dossiers: [], methodologie: false }, learned: null };
  }

  const { ctx, det, usedTickets, usedDossiers, methodo } = buildContext(q, issues);

  // Approfondissement : pour les tickets nommés (max 2), on va chercher la VRAIE
  // description Jira + l'activité récente, pour pouvoir diagnostiquer sans broder.
  let deep = "";
  const byKey = new Map(issues.map((i) => [String(i.cle).toUpperCase(), i]));
  for (const k of det.keys.slice(0, 3)) {
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
  const answer = await callClaude(SYSTEM, userText, [], 4096, 0.2, normalizeHistory(history));
  // Apprentissage durable : Natacha retient qui est Nicolas et ses consignes permanentes.
  let learned = null;
  try { learned = await learnFromTurn(q, answer); } catch { /* la mémoire ne doit jamais casser le chat */ }
  return { answer, sources: { tickets: usedTickets, dossiers: usedDossiers, methodologie: methodo }, learned: learned ? { profil: learned.profil.length, consignes: learned.consignes.length } : null };
}

// Exporté pour les tests : permet de vérifier le contexte sans appeler le LLM.
export const __buildContext = buildContext;

// Détecte le dossier d'un document par son VOCABULAIRE MÉTIER (glossaire du corpus)
// et les préfixes de projet — pas seulement le nom littéral du dossier. Plus le corpus
// d'un client est riche, mieux il est reconnu. Score = nb de termes distincts trouvés.
const STOP = new Set(["les", "des", "une", "aux", "par", "pour", "avec", "sans", "sur", "dans",
  "est", "sont", "son", "ses", "qui", "que", "pas", "plus", "tout", "tous", "the", "and", "for"]);
function dossierKeywordMap() {
  const map = {};
  const add = (d, tok) => { if (d && tok && tok.length >= 3 && !STOP.has(tok) && !/^\d+$/.test(tok)) (map[d] || (map[d] = new Set())).add(tok); };
  try {
    const k = readConnaissance();
    for (const [name, c] of Object.entries(k.clients || {})) {
      add(name, norm(name));
      for (const g of (c.glossaire || [])) for (const tok of norm(g.terme).split(/[^a-z0-9+]+/)) add(name, tok);
    }
  } catch (e) { console.warn("[assistant:dossierKeywordMap] corpus indisponible, repli préfixes+noms:", e.message || e); /* corpus indisponible : on retombe sur les préfixes + noms */ }
  for (const [prefix, name] of Object.entries(DOSSIERS || {})) { add(name, norm(name)); add(name, norm(prefix)); }
  return map;
}
function guessDossier(filename, body, issues = []) {
  const hay = norm(`${filename} ${String(body || "").slice(0, 6000)}`);
  const map = dossierKeywordMap();
  const candidates = new Set([...Object.keys(map), ...issues.map((i) => i.dossier).filter(Boolean)]);
  let best = "", bestScore = 0;
  for (const d of candidates) {
    const toks = map[d] || new Set([norm(d)]);
    let score = 0;
    for (const tok of toks) if (tok && hay.includes(tok)) score++;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return bestScore > 0 ? best : "";
}

// Analyse ANCRÉE d'un fichier déposé : raisonne sur le SEUL contenu extrait, propose
// une « fiche » capitalisable, et devine le dossier concerné (pour l'import au corpus).
export async function analyzeFile({ filename = "fichier", text = "", question = "", issues = [] }) {
  if (!aiAvailable()) throw new Error("Aucune clé IA configurée (assistant indisponible).");
  const body = String(text || "").trim();
  if (!body) throw new Error("Contenu vide ou non extractible.");
  let corpusDossiers = [];
  try { corpusDossiers = Object.keys(readConnaissance().clients || {}); } catch (e) { console.warn("[assistant:analyzeFile] lecture connaissance impossible, dossiers corpus vides:", e.message || e); corpusDossiers = []; }
  const dossiers = [...new Set([...issues.map((i) => i.dossier).filter(Boolean), ...corpusDossiers])].sort((a, b) => a.localeCompare(b));
  const guess = guessDossier(filename, body, issues);
  const userText = `FICHIER : ${filename}\nCONTENU EXTRAIT (tronqué) :\n${body.slice(0, 15000)}\n\n`
    + `DEMANDE : ${question || "Analyse ce document : de quoi s'agit-il, quels sont les points clés, et en quoi est-ce utile au pilotage TMA ?"}\n\n`
    + `Réponds à partir du SEUL contenu ci-dessus, sans rien inventer. Termine par une dernière ligne au format exact « FICHE: <résumé d'1 à 2 phrases, capitalisable pour la base de connaissance> ».`;
  const raw = await callClaude(SYSTEM, userText, [], 2200, 0.15);
  let answer = raw, note = "";
  const m = raw.match(/FICHE\s*:\s*([\s\S]+)$/i);
  if (m) { note = m[1].trim(); answer = raw.slice(0, m.index).trim(); }
  if (!note) note = answer.slice(0, 300);
  note = `[${filename}] ${note}`.slice(0, 600);
  return { answer, note, guess, dossiers };
}
