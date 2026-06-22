// ai.js — rédaction assistée. Utilise l'API Claude si ANTHROPIC_API_KEY est défini,
// sinon des gabarits structurés (l'outil reste utilisable sans clé).
import { buildDoc } from "./docgen.js";
import { knowledgeForPrompt, saveAuto, autoAgeMs } from "./connaissance.js";
import { CATEGORY_LABEL, RESTE_CATS, ACTIVE_CATS, DONE_CATS, categoryFromStatus, statusIsExplicit } from "./config.js";
import { fetchIssueActivity, fetchIssueDescription } from "./jira.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || "";   // gratuit, UE, compatible OpenAI (recommandé)
const GROQ_KEY = process.env.GROQ_API_KEY || "";          // gratuit mais bloque les IP cloud (ne marche pas sur Render)
const QWEN_KEY = process.env.QWEN_API_KEY || "";          // Qwen (Alibaba DashScope / OpenRouter), compatible OpenAI
const QWEN_BASE = (process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
const AI_API_KEY = process.env.AI_API_KEY || "";          // fournisseur générique compatible OpenAI
const AI_BASE_URL = (process.env.AI_BASE_URL || "").replace(/\/$/, ""); // ex. https://api.mistral.ai/v1

// Modèle par défaut selon le fournisseur présent (surchargé par AI_MODEL).
function defaultModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  if (QWEN_KEY) return "qwen-plus";
  if (ANTHROPIC_KEY) return "claude-sonnet-4-6";
  if (MISTRAL_KEY) return "mistral-small-latest";
  if (GROQ_KEY) return "llama-3.3-70b-versatile";
  return "gpt-4o-mini";
}
const MODEL = defaultModel();

export function aiAvailable() {
  return Boolean(QWEN_KEY || ANTHROPIC_KEY || MISTRAL_KEY || GROQ_KEY || (AI_API_KEY && AI_BASE_URL));
}

// Aiguilleur d'appel IA. Priorité : Qwen (si configuré) → Anthropic → Mistral → Groq → générique.
// `images` = [{media_type, dataBase64}] (vision : Anthropic uniquement).
async function callClaude(system, userText, images = [], maxTokens = 2000, temperature = 0.2) {
  if (QWEN_KEY) return callOpenAICompat(QWEN_BASE, QWEN_KEY, system, userText, maxTokens, temperature);
  if (ANTHROPIC_KEY) return callAnthropic(system, userText, images, maxTokens, temperature);
  if (MISTRAL_KEY) return callOpenAICompat("https://api.mistral.ai/v1", MISTRAL_KEY, system, userText, maxTokens, temperature);
  if (GROQ_KEY) return callOpenAICompat("https://api.groq.com/openai/v1", GROQ_KEY, system, userText, maxTokens, temperature);
  if (AI_API_KEY && AI_BASE_URL) return callOpenAICompat(AI_BASE_URL, AI_API_KEY, system, userText, maxTokens, temperature);
  throw new Error("Aucune clé IA configurée.");
}

async function callAnthropic(system, userText, images = [], maxTokens = 2000, temperature = 0.2) {
  const content = [];
  for (const im of images) content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.dataBase64 } });
  content.push({ type: "text", text: userText });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`API Claude ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// Fournisseur compatible OpenAI (Mistral, Groq, OpenRouter, etc.). Texte uniquement (images ignorées).
async function callOpenAICompat(baseUrl, key, system, userText, maxTokens = 2000, temperature = 0.2) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, temperature,
      messages: [{ role: "system", content: system }, { role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`API IA ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

const STYLE = `Tu es l'assistant d'un chef de projet senior d'Armonie Group (centre de services IBM i).
Tu rédiges en français, ton professionnel, clair, concis et rigoureux — comme un compte rendu Armonie.
Tu renvoies UNIQUEMENT un fragment HTML (pas de <html>, <head> ni <body>), sans style inline. Éléments autorisés :
<h2> et <h3> (titres), <p>, <ul><li>, <b>, <table class="data"> avec <th>/<td>, et ces classes de la charte :
<span class="tk"> (clé de ticket), <span class="who"> (nom de personne),
<span class="pill done|prog|todo|block"> (statut : done=résolu/clôturé, prog=en cours, todo=à faire/en attente, block=bloqué),
<div class="indic"> (encadré pour un point marquant), et <div class="opt"><div class="ot">Option 1</div>…</div> (présenter des options).

RÈGLES DE FIDÉLITÉ — IMPÉRATIVES, prioritaires sur tout le reste :
- N'invente JAMAIS rien. Utilise UNIQUEMENT les informations présentes dans les données fournies ci-dessous par l'utilisateur.
- NOMS DE PERSONNES : n'écris que des noms réellement présents dans les données. N'invente aucun nom, ne déduis JAMAIS un nom à partir d'une clé de ticket, d'un projet ou d'un client. Si tu n'as pas le nom, écris « non précisé » (jamais un prénom inventé).
- CLÉS DE TICKETS, PROJETS, CLIENTS, DATES, CHIFFRES : reprends-les EXACTEMENT depuis les données. N'en invente aucun, n'arrondis pas, ne complète pas « de mémoire ».
- Si une information manque, écris « non précisé » ou n'en parle pas — ne comble JAMAIS un vide par une supposition.
- Aucune citation inventée, aucun événement non mentionné. En cas de doute, reste général plutôt que d'inventer un détail précis.
- Ne mélange pas les clients/projets entre eux : ce qui concerne un dossier ne doit pas être attribué à un autre.`;

// ---------- CR journalier par client ----------
function buckets(issues) {
  const g = { "Terminé": [], "En cours": [], "À faire": [], "Bloqué": [] };
  issues.forEach((i) => (g[i.statut] || (g[i.statut] = [])).push(i));
  return g;
}
function listHtml(arr) {
  if (!arr.length) return "<p>—</p>";
  return "<ul>" + arr.map((i) => {
    const who = (i.dev && i.dev !== "Non assigné") ? i.dev : (i.assigne && i.assigne !== "Non assigné" ? i.assigne : "");
    return `<li><b>${esc(i.cle)}</b> — ${esc(i.resume)}${who ? ` — <span class="who">${esc(who)}</span>` : ""}</li>`;
  }).join("") + "</ul>";
}
function esc(s){return String(s==null?"":s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));}

function kpiRow(g, total) {
  return `<div class="kpi-row">
    <div class="kpi"><div class="v">${total}</div><div class="l">Total</div></div>
    <div class="kpi"><div class="v">${g["Terminé"].length}</div><div class="l">Terminés</div></div>
    <div class="kpi"><div class="v">${g["En cours"].length}</div><div class="l">En cours</div></div>
    <div class="kpi"><div class="v">${g["À faire"].length}</div><div class="l">À faire</div></div>
    <div class="kpi"><div class="v">${g["Bloqué"].length}</div><div class="l">Bloqués</div></div>
  </div>`;
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
// "Terminé / clôturé dans la fenêtre" : on se fie à la DATE DE RÉSOLUTION (clôture réelle),
// PAS à la date de modification (qui bouge pour un commentaire, un label ou un import/édition en masse,
// ce qui faisait compter des milliers de tickets clos comme « terminés aujourd'hui »).
// Repli : une mise en prod sans date de résolution est datée par sa dernière modif.
function doneWithin(within, i) {
  if (!DONE_CATS.includes(i.categorie)) return false;
  if (i.resolu) return within(i.resolu);
  return i.categorie === "miseEnProd" && within(i.maj);
}
// Liste HTML d'une sélection de tickets (avec dév + statut détaillé, plafonnée).
function catList(arr, { showStatus = false, cap = 60 } = {}) {
  if (!arr.length) return "<p>—</p>";
  const shown = arr.slice(0, cap);
  const li = shown.map((i) => {
    const who = i.dev && i.dev !== "Non assigné" ? ` — <span class="who">${esc(i.dev)}</span>` : "";
    const st = showStatus ? ` — <b>${esc(CATEGORY_LABEL[i.categorie] || i.statutJira || "")}</b>` : "";
    return `<li><b>${esc(i.cle)}</b> — ${esc(i.resume)}${who}${st}</li>`;
  }).join("");
  const more = arr.length > cap ? `<li>+ ${arr.length - cap} autre(s)…</li>` : "";
  return `<ul>${li}${more}</ul>`;
}

function byMajDesc(a, b) { return String(b.maj || "").localeCompare(String(a.maj || "")); }

// Liste alignée en colonnes : Clé · Description · Programme · Intervenant · État.
// Affiche les 10 premiers, puis replie le reste dans un accordéon « Afficher les N autre(s) »
// — les deux tables partagent la même largeur de colonnes (table-layout fixe) pour rester alignées.
const TK_COLGROUP = `<colgroup><col style="width:10%"><col style="width:40%"><col style="width:16%"><col style="width:18%"><col style="width:16%"></colgroup>`;
function tkRow(i) {
  const who = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne && i.assigne !== "Non assigné" ? i.assigne : "Non assigné");
  const st = CATEGORY_LABEL[i.categorie] || i.statut || "—";
  const prog = i.prog && i.prog.name ? `<span class="cr-prog">📦 ${esc(i.prog.name)}</span>` : "";
  return `<tr><td class="tk-k"><b>${esc(i.cle)}</b></td><td class="tk-res">${esc(i.resume)}</td><td class="tk-prog">${prog}</td><td class="tk-who"><span class="who">${esc(who)}</span></td><td class="tk-st">${esc(st)}</td></tr>`;
}
function tkList(arr) {
  if (!arr.length) return `<p class="cr-scope">—</p>`;
  const head = arr.slice(0, 10), rest = arr.slice(10);
  let html = `<table class="tk-tbl">${TK_COLGROUP}<tbody>${head.map(tkRow).join("")}</tbody></table>`;
  if (rest.length) {
    html += `<details class="cr-more"><summary>Afficher les ${rest.length} autre(s)</summary><table class="tk-tbl">${TK_COLGROUP}<tbody>${rest.map(tkRow).join("")}</tbody></table></details>`;
  }
  return html;
}

// Petite limite de concurrence pour ne pas saturer Jira lors de la récupération des détails.
async function mapLimit(items, limit, fn) {
  const out = []; let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

// Reformule en langage clair (1 seul appel IA, groupé) la "problématique" de chaque ticket,
// à partir de sa description Jira — pour ne PAS recopier le pavé brut. Repli sûr si pas d'IA.
async function clarifyContexts(enriched) {
  if (!aiAvailable()) return {};
  const items = enriched.filter(({ desc }) => desc && desc.trim())
    .map(({ i, desc }) => `${i.cle} | ${i.resume} | ${desc.replace(/\s+/g, " ").slice(0, 400)}`);
  if (!items.length) return {};
  const prompt = `Pour CHAQUE ticket ci-dessous (format "CLÉ | titre | description Jira"), reformule en UNE phrase claire, en français simple, CE DONT IL S'AGIT et ce qu'il faut faire — sans recopier la description, sans jargon inutile ni identifiants d'incident. Ne traite QUE les tickets listés, n'en invente AUCUN, n'ajoute aucun nom ni client absent.\n` +
    items.join("\n") +
    `\nRéponds STRICTEMENT en JSON : un objet {"CLÉ": "phrase claire", ...}, sans texte autour ni Markdown.`;
  try {
    const raw = await callClaude("Tu es un chef de projet qui vulgarise des tickets techniques, fidèlement, sans rien inventer.", prompt);
    const j = JSON.parse(String(raw).replace(/```json|```/gi, "").trim());
    return (j && typeof j === "object" && !Array.isArray(j)) ? j : {};
  } catch { return {}; }
}

// Construit, pour chaque ticket, un bloc dépliable (accordéon) qui explique réellement :
// le sujet, la problématique (description Jira), les travaux réalisés (commentaires de temps),
// l'avancement (transitions de statut) et les intervenants. Honnête : indique ce qui manque dans Jira.
async function detailedTicketsHtml(tickets) {
  if (!tickets || !tickets.length) return "";
  const cap = tickets.slice(0, 14);
  const enriched = await mapLimit(cap, 5, async (i) => {
    const [desc, act] = await Promise.all([
      fetchIssueDescription(i.cle).catch(() => ""),
      fetchIssueActivity(i.cle).catch(() => ({ timeline: [], worklogs: [], totalTime: "", totalSeconds: 0 })),
    ]);
    return { i, desc, act };
  });

  const clear = await clarifyContexts(enriched);
  return enriched.map(({ i, desc, act }) => {
    const statut = CATEGORY_LABEL[i.categorie] || i.statut || "—";
    const who = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "");
    // Reformulation claire (IA) si dispo, sinon court extrait — jamais le pavé Jira recopié intégralement.
    const prob = clear[i.cle]
      ? esc(clear[i.cle])
      : (desc ? esc(desc.replace(/\s+/g, " ").slice(0, 280)) + (desc.length > 280 ? "…" : "") : `<span class="cr-none">Non documentée dans Jira.</span>`);
    const works = (act.worklogs || []).filter((w) => w.comment)
      .map((w) => `<li>${esc(w.comment)} <span class="cr-meta">— ${esc(w.who)}${w.time ? ", " + esc(w.time) : ""}</span></li>`);
    const travaux = works.length
      ? `<ul class="cr-works">${works.join("")}</ul>`
      : `<span class="cr-none">Aucun détail de travaux saisi dans Jira — à demander au développeur.</span>`;
    // Avancement : parcours des statuts (sans répétition) + nb de changements et de retours,
    // au lieu de la liste brute « X→Y , puis Y→X… » qui donnait un ping-pong illisible.
    const seq = (act.timeline || []).filter((t) => t.champ === "Statut").slice().reverse(); // chrono
    const visited = new Set(); const ordered = []; let changes = 0, retours = 0;
    seq.forEach((t, k) => {
      if (k === 0 && t.from) { ordered.push(t.from); visited.add(t.from); }
      if (t.to) {
        changes += 1;
        if (visited.has(t.to) || /retour/i.test(t.to)) retours += 1;
        if (!ordered.includes(t.to)) ordered.push(t.to);
        visited.add(t.to);
      }
    });
    const parcours = ordered.length > 1 ? ordered.map((s) => esc(s)).join(" → ") : "";
    const avancement = changes
      ? `Statut actuel : <b>${esc(statut)}</b><span class="cr-meta"> · ${changes} changement${changes > 1 ? "s" : ""}${retours ? `, dont ${retours} retour${retours > 1 ? "s" : ""}` : ""}${parcours ? ` · parcours : ${parcours}` : ""}</span>`
      : `Statut actuel : <b>${esc(statut)}</b>`;
    const tps = act.totalSeconds ? ` · ${esc(act.totalTime)} saisies` : "";
    return `<details class="cr-tk">
      <summary><span class="cr-tk-k">${esc(i.cle)}</span><span class="cr-tk-res">${esc(i.resume)}</span><span class="cr-prog-cell">${i.prog && i.prog.name ? `<span class="cr-prog">📦 ${esc(i.prog.name)}</span>` : ""}</span><span class="cr-tk-who">${esc(who || "—")}</span><span class="cr-tk-st">${esc(statut)}</span></summary>
      <div class="cr-tk-bd">
        <p class="cr-row"><span class="cr-lbl">Problématique / contexte</span>${prob}</p>
        <div class="cr-row"><span class="cr-lbl">Travaux réalisés</span>${travaux}</div>
        <p class="cr-row"><span class="cr-lbl">Avancement</span>${avancement}</p>
        <p class="cr-row"><span class="cr-lbl">Intervenant(s)</span>${esc(who || "—")}${tps}</p>
      </div>
    </details>`;
  }).join("");
}


// État clair + prochaine étape déduits de la catégorie (mapping factuel, pas d'invention).
function plainEtatNext(i) {
  if (i.statut === "Bloqué" || i.flagged) return { etat: "bloqué", next: "Lever le blocage en priorité." };
  switch (i.categorie) {
    case "encours": return { etat: "en cours de réalisation", next: "Poursuivre puis finaliser." };
    case "retourTest": return { etat: "renvoyé en test", next: "À tester, puis valider." };
    case "recetteArmonie": return { etat: "en cours de vérification côté Armonie", next: "Valider avant de livrer au client." };
    case "recetteClient": return { etat: "en cours de vérification côté client", next: "En attente du retour du client." };
    case "miseEnProd": return { etat: "en mise en service", next: "Confirmer la mise en service." };
    case "termine": return { etat: "terminé", next: "Clôturer le ticket." };
    case "afaire": return { etat: "pas encore démarré", next: "À planifier." };
    default: return { etat: (CATEGORY_LABEL[i.categorie] || i.statut || "en cours").toLowerCase(), next: "À suivre." };
  }
}

// « Ce qui a avancé » — accordéon SIMPLE et clair (langage courant, éléments en gras).
// Une carte repliable par ticket : où ça en est, ce qui a été fait, ce qu'il reste à faire.
async function progressHtml(tickets) {
  if (!tickets || !tickets.length) return "<p>Aucun ticket à passer en revue ce matin.</p>";
  const cap = tickets.slice(0, 14);
  const enriched = await mapLimit(cap, 5, async (i) => {
    const act = await fetchIssueActivity(i.cle).catch(() => ({ timeline: [], worklogs: [] }));
    return { i, act };
  });
  return enriched.map(({ i, act }) => {
    const statut = CATEGORY_LABEL[i.categorie] || i.statut || "—";
    const who = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "");
    const { etat, next } = plainEtatNext(i);
    const lastT = (act.timeline || []).find((t) => t.champ === "Statut");
    const mouvement = lastT ? ` Le statut est récemment passé de <b>${esc(lastT.from)}</b> à <b>${esc(lastT.to)}</b>.` : "";
    const etatLine = `Ce sujet est <b>${esc(etat)}</b>${who ? `, suivi par <b>${esc(who)}</b>` : ""}.${mouvement}`;
    const works = (act.worklogs || []).filter((w) => w.comment).slice(0, 4)
      .map((w) => `<li>${esc(w.comment)} <span class="cr-meta">— ${esc(w.who)}${w.time ? ", " + esc(w.time) : ""}</span></li>`);
    const fait = works.length
      ? `<ul class="cr-works">${works.join("")}</ul>`
      : `<span class="cr-none">Pas encore de détail noté dans Jira — à voir avec ${esc(who || "la personne concernée")}.</span>`;
    return `<details class="cr-tk">
      <summary><span class="cr-tk-k">${esc(i.cle)}</span> ${esc(i.resume)} <span class="cr-tk-st">${esc(statut)}</span></summary>
      <div class="cr-tk-bd">
        <p class="cr-row"><span class="cr-lbl">Où ça en est</span>${etatLine}</p>
        <div class="cr-row"><span class="cr-lbl">Ce qui a déjà été fait</span>${fait}</div>
        <p class="cr-row"><span class="cr-lbl">À faire ensuite</span><b>${esc(next)}</b></p>
      </div>
    </details>`;
  }).join("");
}


// Filtre de date paramétrable : par défaut "aujourd'hui", sinon une plage { startISO, endISO } (null/null = tout).
function makeWithin(range) {
  if (!range) return isToday;
  const s = range.startISO ? new Date(range.startISO).getTime() : null;
  const e = range.endISO ? new Date(range.endISO).getTime() : null;
  if (s == null && e == null) return () => true;
  return (iso) => { const t = new Date(iso).getTime(); if (isNaN(t)) return false; if (s != null && t < s) return false; if (e != null && t >= e) return false; return true; };
}


// ──────────────────────────────────────────────────────────────────────────
// Activité par intervenant — COMPTAGE DE TICKETS (jamais de transitions).
// Regroupement : périmètre (engagement TMA/Projet, déduit de la clé) → intervenant
// réel (assignee courant, sinon développeur identifié) → ventilation par statut courant.
// Chaque ticket est compté UNE seule fois. Tout le monde est inclus (aucun filtre période).
// ──────────────────────────────────────────────────────────────────────────
const ACT_COLS = [
  ["afaire", "À faire"],
  ["encours", "En cours"],
  ["retours", "Retours"],
  ["recArm", "Rec. Armonie"],
  ["recCli", "Rec. client"],
  ["attCli", "Attente cli."],
  ["doneMep", "Terminé / MEP"],
];
const PERIM_LABEL = { TMA: "TMA — maintenance courante", Projet: "Projet", Autre: "Autre" };
function actBucket(cat) {
  if (cat === "afaire") return "afaire";
  if (cat === "encours") return "encours";
  if (cat === "retourTest" || cat === "retourProd") return "retours";
  if (cat === "recetteArmonie") return "recArm";
  if (cat === "recetteClient") return "recCli";
  if (cat === "attenteClient") return "attCli";
  if (cat === "termine" || cat === "miseEnProd") return "doneMep";
  if (cat === "annule") return "annule";
  return "autre";
}
function intervenantOf(i) {
  if (i.assigne && i.assigne !== "Non assigné") return i.assigne;        // assignee courant prioritaire
  if (i.dev && i.dev !== "Non assigné") return i.dev;                    // sinon dev identifié (titre/étiquette)
  return "Non assigné";
}
export function buildActivite(issues = []) {
  const seen = new Set();
  const doublons = [];
  const distinct = new Set();
  const PERIM = {};
  const heur = new Map(); // statuts Jira NON mappés explicitement (résolus par heuristique → à vérifier)
  for (const i of issues) {
    if (seen.has(i.cle)) { doublons.push(i.cle); continue; } // garde-fou anti double comptage
    seen.add(i.cle);
    if (i.statutJira && !statusIsExplicit(i.statutJira)) heur.set(i.statutJira, categoryFromStatus(i.statutJira));
    const eng = i.engagement && i.engagement !== "—" ? i.engagement : "Autre";
    const P = (PERIM[eng] ||= { code: eng, label: PERIM_LABEL[eng] || eng, projets: new Set(), total: 0, nonAssignes: [], _w: {} });
    P.projets.add(String(i.cle).split("-")[0].toUpperCase());
    P.total += 1;
    const who = intervenantOf(i);
    if (who === "Non assigné") P.nonAssignes.push(i.cle); else distinct.add(who);
    const w = (P._w[who] ||= { nom: who, afaire: 0, encours: 0, retours: 0, recArm: 0, recCli: 0, attCli: 0, doneMep: 0, annule: 0, autre: 0, total: 0 });
    w[actBucket(i.categorie)] += 1; w.total += 1;
  }
  const perimetres = Object.values(PERIM).map((P) => {
    const intervenants = Object.values(P._w).sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));
    const parStatut = { afaire: 0, encours: 0, retours: 0, recArm: 0, recCli: 0, attCli: 0, doneMep: 0, annule: 0, autre: 0, total: 0 };
    intervenants.forEach((w) => Object.keys(parStatut).forEach((k) => (parStatut[k] += w[k] || 0)));
    return { code: P.code, label: P.label, projets: [...P.projets], total: P.total, nbNonAssignes: P.nonAssignes.length, nonAssignes: P.nonAssignes, intervenants, parStatut };
  }).sort((a, b) => (a.code === "TMA" ? -1 : 1) - (b.code === "TMA" ? -1 : 1));
  const sommeParPerimetre = {}; perimetres.forEach((p) => (sommeParPerimetre[p.code] = p.total));
  const sommePerim = perimetres.reduce((s, p) => s + p.total, 0);
  return {
    perimetres,
    controles: {
      intervenantsDistincts: [...distinct].sort((a, b) => a.localeCompare(b)),
      nbIntervenants: distinct.size,
      ticketsUniques: seen.size,
      ticketsRecus: issues.length,
      doublons,                                   // doit rester vide
      ticketsNonAssignes: perimetres.flatMap((p) => p.nonAssignes),
      sommeParPerimetre,
      reconciliationOK: sommePerim === seen.size,  // somme des périmètres == total unique
      statutsHeuristiques: [...heur.entries()].map(([s, c]) => ({ statut: s, categorie: CATEGORY_LABEL[c] || c })),
    },
  };
}
// Affiche au plus n clés, puis « … (+X autres) » — JAMAIS la liste complète (peut faire 1000+).
const capKeys = (arr, n = 6) => (arr.length <= n ? arr.map(esc).join(", ") : arr.slice(0, n).map(esc).join(", ") + ` … (+${arr.length - n} autres)`);
// Tableau intervenant × statut pour UN périmètre.
function activiteTableHtml(P) {
  const th = ACT_COLS.map(([, lib]) => `<th class="r">${lib}</th>`).join("");
  const rows = P.intervenants.map((w) =>
    `<tr><td><span class="who">${esc(w.nom)}</span></td>${ACT_COLS.map(([k]) => `<td class="r">${w[k] || "—"}</td>`).join("")}<td class="r"><b>${w.total}</b></td></tr>`
  ).join("");
  const tot = `<tr class="act-tot"><td><b>Total ${esc(P.code)}</b></td>${ACT_COLS.map(([k]) => `<td class="r"><b>${P.parStatut[k] || "—"}</b></td>`).join("")}<td class="r"><b>${P.total}</b></td></tr>`;
  return `<h3>${esc(P.label)} — ${P.total} ticket(s) · ${P.projets.map(esc).join(" / ")}</h3>
    <table class="data act-tbl"><thead><tr><th>Intervenant</th>${th}<th class="r">Total</th></tr></thead><tbody>${rows}${tot}</tbody></table>`;
}
// Bloc « contrôles » (vérifications anti-erreur) — discret, repliable.
function controlesHtml(act) {
  const c = act.controles;
  const recon = c.reconciliationOK ? "✓ cohérent" : "⚠ écart à vérifier";
  const perBits = Object.entries(c.sommeParPerimetre).map(([k, v]) => `${esc(k)} = ${v}`).join(" + ");
  return `<details class="cr-more"><summary>Contrôles de cohérence</summary>
    <ul class="cr-list">
      <li><b>${c.nbIntervenants}</b> intervenant(s) distinct(s) : ${c.intervenantsDistincts.length ? capKeys(c.intervenantsDistincts, 25) : "—"}</li>
      <li>Total : ${perBits || "—"} = <b>${c.ticketsUniques}</b> ticket(s) uniques (${recon}).</li>
      <li>Tickets non assignés : ${c.ticketsNonAssignes.length ? `<b>${c.ticketsNonAssignes.length}</b> (ex. ${capKeys(c.ticketsNonAssignes, 6)})` : "aucun"}.</li>
      <li>Doublons (ticket compté 2×) : ${c.doublons.length ? `<b>${c.doublons.length}</b> (${capKeys(c.doublons, 6)})` : "aucun"}.</li>
      ${(c.statutsHeuristiques && c.statutsHeuristiques.length) ? `<li>⚠ Statuts Jira non reconnus, classés par déduction <b>(à vérifier)</b> : ${c.statutsHeuristiques.map((x) => `« ${esc(x.statut)} » → ${esc(x.categorie)}`).join(" ; ")}.</li>` : `<li>Statuts Jira : tous reconnus explicitement. ✓</li>`}
    </ul></details>`;
}
// Ventile une liste de tickets par périmètre, et rend chaque sous-liste avec tkList.
function tkListByPerim(arr, multi) {
  if (!multi) return tkList(arr);
  const groups = {};
  arr.forEach((i) => { const e = i.engagement && i.engagement !== "—" ? i.engagement : "Autre"; (groups[e] ||= []).push(i); });
  const order = ["TMA", "Projet", "Autre"].filter((k) => groups[k]);
  if (!order.length) return tkList(arr);
  return order.map((k) => `<h4 class="cr-perim">${esc(PERIM_LABEL[k] || k)} (${groups[k].length})</h4>${tkList(groups[k])}`).join("");
}

function templateDaily(dossier, issues, analyseHtml = "", detailedHtml = "", within = isToday, isPeriod = false, actorAct = null, dayLabel = "") {
  const W = isPeriod ? "sur la période" : (dayLabel ? `pour la journée du ${dayLabel}` : "ce jour");
  const inCat = (c) => issues.filter((i) => i.categorie === c);
  const doneToday = issues.filter((i) => doneWithin(within, i)).sort(byMajDesc);
  const enCoursToday = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && within(i.maj)).sort(byMajDesc);
  const recArmonie = inCat("recetteArmonie");
  const recClient = inCat("recetteClient");
  const attenteClient = inCat("attenteClient");
  const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);

  // Photo globale du dossier (pas seulement la journée) pour la ligne de KPI.
  const g = { "Terminé": [], "En cours": [], "À faire": [], "Bloqué": [] };
  issues.forEach((i) => { (g[i.statut] || (g[i.statut] = [])).push(i); });

  // Périmètres présents sur le dossier (TMA vs Projet) — pour scinder synthèse/recette/détail.
  const engOf2 = (i) => (i.engagement && i.engagement !== "—" ? i.engagement : "Autre");
  const multi = new Set(issues.map(engOf2)).size > 1;

  // ACTIVITÉ DE LA JOURNÉE (ou de la période) : UNIQUEMENT les tickets touchés sur la fenêtre.
  // On ne compte pas le backlog, on ne parle pas des tickets non attribués : c'est un CR du jour.
  const dayIssues = issues.filter((i) => within(i.maj));
  const act = buildActivite(dayIssues);
  const tablePersonnes = act.perimetres.length
    ? act.perimetres.map(activiteTableHtml).join("")
    : `<p>Aucune activité enregistrée ${W}.</p>`;

  // Recette SÉPARÉE : Armonie = à valider PAR NOUS ; client = à valider par le CLIENT.
  // Séparée AUSSI par périmètre (TMA / Projet) quand le dossier en a plusieurs.
  const recArmBloc = recArmonie.length
    ? `<h3>Recette Armonie — ${recArmonie.length} ticket(s) · à valider par Armonie</h3>${tkListByPerim(recArmonie, multi)}`
    : `<h3>Recette Armonie</h3><p class="cr-scope">Aucun ticket en recette Armonie.</p>`;
  const recCliBloc = recClient.length
    ? `<h3>Recette client — ${recClient.length} ticket(s) · à valider par le client</h3>${tkListByPerim(recClient, multi)}`
    : "";

  const attenteBloc = attenteClient.length
    ? `<h3>En attente client (${attenteClient.length})</h3>${tkListByPerim(attenteClient, multi)}`
    : "";

  // Points bloquants : seulement les tickets OUVERTS réellement bloqués (on exclut terminés/annulés/MEP).
  const bloquantsOpen = bloquants.filter((i) => !DONE_CATS.includes(i.categorie) && i.categorie !== "annule");
  const bloquantsBloc = bloquantsOpen.length
    ? `<h3>⚠ Points bloquants (${bloquantsOpen.length})</h3>${tkListByPerim(bloquantsOpen, multi)}`
    : `<h3>Points bloquants</h3><p>Aucun point bloquant ouvert.</p>`;

  // Synthèse page 1 : seulement les états qui comptent. Séparée par périmètre si plusieurs.
  const synthFor = (subset, title) => {
    const c = (cat) => subset.filter((i) => i.categorie === cat).length;
    return `${title ? `<h3 class="cr-perim">${esc(title)}</h3>` : ""}<div class="kpi-row">
    <div class="kpi"><div class="v">${c("recetteArmonie")}</div><div class="l">Recette Armonie</div></div>
    <div class="kpi"><div class="v">${c("recetteClient")}</div><div class="l">Recette client</div></div>
    <div class="kpi"><div class="v">${c("attenteClient")}</div><div class="l">Attente client</div></div>
    <div class="kpi"><div class="v">${c("miseEnProd")}</div><div class="l">Mise en prod.</div></div>
    <div class="kpi"><div class="v">${c("termine")}</div><div class="l">Terminés</div></div>
  </div>`;
  };
  const synthRow = multi
    ? act.perimetres.map((p) => synthFor(issues.filter((i) => (i.engagement && i.engagement !== "—" ? i.engagement : "Autre") === p.code), p.label)).join("")
    : synthFor(issues, "");

  return `<h2>Synthèse ${isPeriod ? "de la période" : `de la journée${dayLabel ? " du " + dayLabel : ""}`}</h2>
    ${synthRow}
    ${analyseHtml || ""}
    <h2>État des lieux détaillé</h2>
    <p style="font-size:12px;color:#74718a;margin-top:-2px;">${(doneToday.length || enCoursToday.length) ? `${doneToday.length} terminé(s) · ${enCoursToday.length} en cours ${W}. ` : `Recette et suivi en cours ${W}. `}Cliquez sur un ticket pour le détail.</p>
    ${detailedHtml || `<p>Aucun ticket travaillé ${W}.</p>`}
    ${recArmBloc}
    ${recCliBloc}
    ${attenteBloc}
    ${bloquantsBloc}
    <h2>Activité ${isPeriod ? "sur la période" : "de la journée"} par intervenant${act.perimetres.length > 1 ? " et par périmètre" : ""}</h2>${tablePersonnes}`;
}

// À partir de l'historique Jira (transitions de statut sur la période), agrège QUI a réellement
// fait avancer les tickets — par acteur de la transition, PAS par développeur d'origine.
// items: [{ cle, transitions: [{ to, from, who, date }] }]
function actorActivity(items) {
  const MILESTONE = new Set(["recetteArmonie", "recetteClient", "attenteClient", "termine", "miseEnProd"]);
  const byActor = {};   // who -> { who, recC, term, recA, att, total, tickets:Set }
  const perTicket = []; // { cle, to, toCat, who, date } : dernier passage marquant du ticket
  for (const it of (items || [])) {
    const trs = (it.transitions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let last = null;
    for (const tr of trs) {
      const cat = categoryFromStatus(tr.to);
      if (!MILESTONE.has(cat)) continue;            // on ne compte que les avancées « recette / clôture »
      const who = (tr.who && tr.who !== "—") ? tr.who : "Inconnu";
      const a = (byActor[who] ||= { who, recC: 0, term: 0, recA: 0, att: 0, total: 0, tickets: new Set() });
      if (cat === "recetteClient") a.recC += 1;
      else if (cat === "termine" || cat === "miseEnProd") a.term += 1;
      else if (cat === "recetteArmonie") a.recA += 1;
      else if (cat === "attenteClient") a.att += 1;
      a.total += 1; a.tickets.add(it.cle);
      last = { cle: it.cle, to: tr.to, toCat: cat, who, date: tr.date };
    }
    if (last) perTicket.push(last);
  }
  const actors = Object.values(byActor)
    .map((a) => ({ ...a, nbTickets: a.tickets.size }))
    .sort((x, y) => y.total - x.total);
  return { actors, perTicket };
}

export async function dailyReport(dossier, issues, range = null, transitions = null) {
  const within = makeWithin(range);
  // Jour unique vs période réelle (≥ 2 jours civils). Un récap d'UN seul jour ne doit JAMAIS dire « période ».
  const todayFR = new Date().toLocaleDateString("fr-FR");
  let singleDay = !range, dayLabel = todayFR;
  if (range) {
    const sd = range.startISO ? String(range.startISO).slice(0, 10) : null;
    const ed = range.endISO ? String(range.endISO).slice(0, 10) : null;
    if (sd && ed && sd === ed) { singleDay = true; dayLabel = new Date(range.startISO).toLocaleDateString("fr-FR"); }
    else if (!sd && !ed && range.label && !/\bau\b/i.test(range.label)) { singleDay = true; dayLabel = range.label; }
  }
  const isPeriod = !singleDay;
  const periodLabel = (range && range.label) ? range.label : todayFR;
  const W = singleDay ? `pour la journée du ${dayLabel}` : "sur la période";
  // Données de la période (toujours exactes, calcul déterministe).
  const dayDone = issues.filter((i) => doneWithin(within, i));
  const dayActive = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && within(i.maj));
  const recA = issues.filter((i) => i.categorie === "recetteArmonie").length;

  // Acteurs RÉELS des transitions sur la période (qui a fait avancer / clôturé), via l'historique Jira.
  const act = (transitions && transitions.length) ? actorActivity(transitions) : null;
  const devByKey = {}; issues.forEach((i) => { devByKey[i.cle] = (i.dev && i.dev !== "Non assigné") ? i.dev : (i.assigne && i.assigne !== "Non assigné" ? i.assigne : ""); });

  // Compte par personne (pour nourrir l'analyse) : acteur réel si dispo, sinon repli sur l'assigné.
  const whoDone = {};
  if (act) { act.actors.forEach((a) => { whoDone[a.who] = a.total; }); }
  else { dayDone.forEach((i) => { const d = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "Non assigné"); whoDone[d] = (whoDone[d] || 0) + 1; }); }
  const topWho = Object.entries(whoDone).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} (${n})`).join(", ");

  // Analyse « chef de projet senior » : claire, concise, pertinente — placée avant « Terminés ».
  let analyseHtml = "";
  if (aiAvailable()) {
    try {
      let prompt;
      if (act) {
        // Récap centré sur les TRANSITIONS réelles : on crédite l'acteur, pas le dev d'origine.
        const ctx = (cle) => devByKey[cle] ? ` (développé par ${devByKey[cle]})` : "";
        const moves = act.perTicket.slice(0, 30).map((t) => `- ${t.cle} → ${CATEGORY_LABEL[t.toCat] || t.to}, par ${t.who}${ctx(t.cle)}`).join("\n");
        const parActeur = act.actors.slice(0, 12).map((a) => `${a.who} : ${a.recC} passage(s) en recette client, ${a.term} clôture(s)/terminé(s), ${a.recA} en recette Armonie (${a.nbTickets} ticket(s))`).join("\n");
        const tRecC = act.actors.reduce((s, a) => s + a.recC, 0), tTerm = act.actors.reduce((s, a) => s + a.term, 0), tRecA = act.actors.reduce((s, a) => s + a.recA, 0), tAtt = act.actors.reduce((s, a) => s + a.att, 0);
        prompt = `Tu es un chef de projet senior. Rédige une ANALYSE pour le dossier "${dossier}" sur « ${periodLabel} », en 2 à 4 paragraphes factuels.\n` +
          `ATTRIBUTION (à appliquer SANS jamais l'expliquer dans le texte) : crédite la personne qui a EFFECTUÉ la transition (recette / clôture), pas le développeur d'origine. N'écris AUCUNE phrase sur la méthode (interdits : « le recetteur est crédité », « rôle du développeur contextuel », « seuls les recetteurs… »). Attribue simplement, naturellement.\n` +
          `INTERDICTIONS ABSOLUES : (1) ne mentionne JAMAIS la mise en production / le déploiement / la « prod » NI leur absence — Armonie réalise la RECETTE, la mise en production est faite par le client ; (2) ne cite AUCUN total de périmètre ni « X tickets couverts » — parle seulement de ce qui a bougé ; (3) ne fais AUCUNE affirmation négative globale (ex. « aucun ticket en attente client ») : les chiffres ci-dessous ne portent QUE sur les transitions de la période, pas sur le stock du dossier.\n` +
          `Cite les personnes par leur nom et les tickets par leur clé. N'invente AUCUN ticket, client, sujet, nom ou action ; reformule en langage clair.\n` +
          `Chiffres de la période (à reprendre tels quels, sans en inventer d'autres, sans les présenter comme un stock total) : ${tTerm} clôture(s)/terminé(s), ${tRecC} passage(s) en recette client, ${tRecA} en recette Armonie.\n` +
          `Qui a fait avancer quoi (acteur réel des transitions) :\n${parActeur || "(aucune transition)"}\n` +
          `Détail des passages (ticket → nouveau statut · par qui · dev d'origine en contexte) :\n${moves || "(aucun)"}\n` +
          `Réponds UNIQUEMENT par 1 à 4 paragraphes HTML <p>…</p>, sans titre.`;
      } else {
        const dev = (i) => (i.dev && i.dev !== "Non assigné" ? " [" + i.dev + "]" : (i.assigne && i.assigne !== "Non assigné" ? " [" + i.assigne + "]" : ""));
        const doneList = dayDone.slice(0, 25).map((i) => `- ${i.cle} : ${i.resume}${dev(i)}`).join("\n");
        const activeList = dayActive.slice(0, 25).map((i) => `- ${i.cle} : ${i.resume}${dev(i)} (${CATEGORY_LABEL[i.categorie] || i.statut})`).join("\n");
        prompt = `Tu es un chef de projet senior. Rédige une ANALYSE rédigée pour le dossier "${dossier}" ${singleDay ? `pour la journée du ${dayLabel}` : `sur la période « ${periodLabel} »`}, ` +
          `comme si tu l'écrivais toi-même : explique CE QUI A AVANCÉ et QUI a travaillé sur QUOI, en 2 à 4 paragraphes clairs et factuels, ` +
          `en citant les personnes par leur nom et les tickets par leur clé. CONTRAINTE STRICTE : utilise UNIQUEMENT les tickets listés ci-dessous ; n'invente AUCUN ticket, client, sujet, nom ou action. INTERDICTIONS : ne mentionne JAMAIS la mise en production / le déploiement / la « prod » ni leur absence (Armonie fait la recette, le client met en production) ; ne cite aucun total de périmètre ; ne fais aucune affirmation négative globale sur le stock (ex. « aucun ticket en attente client »). Termine par un point d'attention si pertinent. Ne réinvente aucun chiffre.\n` +
          `Données réelles : ${dayDone.length} terminé(s) ${W}, ${dayActive.length} en cours ${W}, ${recA} en attente de recette Armonie. Terminés par personne : ${topWho || "—"}.\n` +
          `Tickets terminés (${periodLabel}) :\n${doneList || "(aucun)"}\n` +
          `Tickets en cours (${periodLabel}) :\n${activeList || "(aucun)"}\n` +
          `Réponds UNIQUEMENT par 1 à 4 paragraphes HTML <p>…</p>, sans titre.`;
      }
      analyseHtml = await callClaude(STYLE, prompt + lexique(dossier));
    } catch { analyseHtml = ""; }
  }
  if (!analyseHtml) {
    // Repli déterministe (sans IA).
    if (act && act.actors.length) {
      const totRecC = act.actors.reduce((s, a) => s + a.recC, 0);
      const totTerm = act.actors.reduce((s, a) => s + a.term, 0);
      const totRecA = act.actors.reduce((s, a) => s + a.recA, 0);
      const top = act.actors.slice(0, 4).map((a) => `${esc(a.who)} (${a.total})`).join(", ");
      const bits = [];
      if (totRecC) bits.push(`<b>${totRecC}</b> passage(s) en recette client`);
      if (totTerm) bits.push(`<b>${totTerm}</b> clôture(s)/terminé(s)`);
      if (totRecA) bits.push(`<b>${totRecA}</b> passage(s) en recette Armonie`);
      analyseHtml = `<p>${isPeriod ? "Sur la période, " : "Aujourd'hui, "}l'activité a surtout porté sur la recette et la clôture : ${bits.join(", ") || "aucune transition de statut enregistrée"}. Réalisé par : ${top || "—"}.</p>` +
        (recA ? `<p><b>${recA}</b> ticket(s) restent en attente de recette Armonie — à prioriser.</p>` : "");
    } else if (dayDone.length || dayActive.length) {
      const phrases = [];
      phrases.push(`${isPeriod ? "Sur la période, " : "Aujourd'hui, "}<b>${dayDone.length}</b> ticket(s) terminé(s) et <b>${dayActive.length}</b> ticket(s) travaillé(s) sur le dossier ${esc(dossier)}.`);
      if (topWho) phrases.push(`Contributions principales : ${esc(topWho)}.`);
      if (recA) phrases.push(`<b>${recA}</b> ticket(s) restent en attente de recette côté Armonie — à suivre pour validation.`);
      analyseHtml = `<p>${phrases.join(" ")}</p>`;
    } else {
      analyseHtml = `<p>Aucune activité enregistrée ${W} sur le dossier ${esc(dossier)} (aucun ticket terminé ni mis à jour).</p>`;
    }
  }

  // Détail explicatif par ticket : ce qui a été travaillé/terminé aujourd'hui.
  // Repli : si rien aujourd'hui, on prend les tickets les plus récemment mis à jour.
  const seen = new Set();
  let detailSource = [...dayDone, ...dayActive].filter((i) => { if (seen.has(i.cle)) return false; seen.add(i.cle); return true; });
  if (!detailSource.length) detailSource = [...issues].sort(byMajDesc).slice(0, 10);
  // Détail scindé par périmètre (TMA / Projet) quand le dossier en a plusieurs — sinon à plat.
  const engOf = (i) => (i.engagement && i.engagement !== "—" ? i.engagement : "Autre");
  const perimsDetail = [...new Set(detailSource.map(engOf))];
  let detailedHtml;
  if (perimsDetail.length > 1) {
    const parts = [];
    for (const code of ["TMA", "Projet", "Autre"]) {
      const sub = detailSource.filter((i) => engOf(i) === code);
      if (sub.length) parts.push(`<h3 class="cr-perim">${esc(PERIM_LABEL[code] || code)} (${sub.length})</h3>` + (await detailedTicketsHtml(sub)));
    }
    detailedHtml = parts.join("");
  } else {
    detailedHtml = await detailedTicketsHtml(detailSource);
  }

  const body = templateDaily(dossier, issues, analyseHtml, detailedHtml, within, isPeriod, act, singleDay ? dayLabel : "");

  const html = buildDoc({
    kicker: "Compte rendu journalier",
    title: singleDay ? `Journée du ${dayLabel}` : `Récap détaillé — ${periodLabel}`,
    subtitle: `Dossier ${dossier} — équipe Armonie · activité consolidée`,
    cartouche: [["Client / dossier", `${dossier} — équipe Armonie`], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Type", "CR journalier détaillé"], [singleDay ? "Journée" : "Période", singleDay ? dayLabel : periodLabel]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "Claude + données" : "données" };
}


// ---------- Compte rendu ÉCRIT (narratif, sans bla-bla, exportable) ----------
// Texte + titres + sous-titres + exemples de tickets cités au fil de l'eau.
// Sans clé IA : rédaction déterministe, factuelle, regroupée par statut.
function shorten(s, n = 70) { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
function devOf(i) { const d = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || ""); return d && d !== "Non assigné" ? d : ""; }
function exTicket(i) { const d = devOf(i); return `${esc(shorten(i.resume, 80) || "sujet non précisé")}${d ? " — " + esc(d) : ""}`; }
function exList(arr, max = 4) {
  let s = arr.slice(0, max).map(exTicket).join(" ; ");
  if (arr.length > max) s += ` ; et ${arr.length - max} autre(s)`;
  return s;
}

function writtenTemplate(dossier, issues) {
  const dayDone = issues.filter((i) => doneWithin(isToday, i)).sort(byMajDesc);
  const dayActive = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && isToday(i.maj)).sort(byMajDesc);
  const recArmonie = issues.filter((i) => i.categorie === "recetteArmonie");
  const recClient = issues.filter((i) => i.categorie === "recetteClient");
  const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);
  const recTot = recArmonie.length + recClient.length;

  const whoDone = {};
  dayDone.forEach((i) => { const d = devOf(i) || "Non assigné"; whoDone[d] = (whoDone[d] || 0) + 1; });
  const topWho = Object.entries(whoDone).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([d, n]) => `${esc(d)} (${n})`).join(", ");

  const enBref = `<p>Aujourd'hui, l'équipe a terminé <b>${dayDone.length}</b> sujet(s) et fait avancer <b>${dayActive.length}</b> autre(s)${bloquants.length ? `, avec <b>${bloquants.length}</b> point(s) à surveiller` : ""}.${topWho ? ` Principales contributions : ${topWho}.` : ""}</p>`;
  const sTermine = dayDone.length
    ? `<p>${dayDone.length} sujet(s) ont été finalisés aujourd'hui : ${exList(dayDone)}.</p>`
    : `<p>Aucun sujet n'a été finalisé aujourd'hui.</p>`;
  const sEnCours = dayActive.length
    ? `<p>Le travail s'est poursuivi sur ${dayActive.length} sujet(s) : ${exList(dayActive)}.</p>`
    : `<p>Aucun sujet n'a avancé aujourd'hui.</p>`;
  const sRecette = recTot
    ? `<p>${recTot} sujet(s) sont en cours de validation avant mise en service — ${recArmonie.length} à vérifier en interne (Armonie) et ${recClient.length} côté client : ${exList([...recArmonie, ...recClient], 3)}.</p>`
    : "";
  const sBloq = bloquants.length
    ? `<p>${bloquants.length} sujet(s) demandent une attention particulière : ${exList(bloquants)}.</p>`
    : `<p>Aucun blocage n'est signalé à ce jour.</p>`;
  const sChiffres = `<p>${dayDone.length} terminé(s) · ${dayActive.length} en cours · ${recTot} en validation · ${bloquants.length} à surveiller.</p>`;

  return `<h2>En bref</h2>${enBref}
    <h2>Ce qui a été terminé</h2>${sTermine}
    <h2>Ce qui avance</h2>${sEnCours}
    ${recTot ? `<h2>En cours de validation</h2>${sRecette}` : ""}
    <h2>Points d'attention</h2>${sBloq}
    <h2>En résumé</h2>${sChiffres}`;
}

export async function writtenDailyReport(dossier, issues) {
  let body = "";
  if (aiAvailable()) {
    try {
      const pick = (arr) => arr.slice(0, 20).map((i) => `- ${i.cle} : ${i.resume}${devOf(i) ? " [" + devOf(i) + "]" : ""} (${CATEGORY_LABEL[i.categorie] || i.statut})`).join("\n");
      const dayDone = issues.filter((i) => doneWithin(isToday, i));
      const dayActive = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && isToday(i.maj));
      const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);
      const noms = [...new Set(issues.flatMap((i) => (i.contributors && i.contributors.length ? i.contributors : [devOf(i)])).filter((n) => n && n !== "Non assigné"))];
      const prompt = `Rédige un COMPTE RENDU ÉCRIT de la journée pour le dossier "${dossier}", en français, destiné à un lecteur NON technique (par exemple un responsable côté client).\n` +
        `RÈGLES DE CLARTÉ (importantes) :\n` +
        `- Langage simple et concret, phrases courtes. Pas de jargon informatique.\n` +
        `- N'affiche PAS de références de tickets (pas de "ABC-123") : décris le travail en mots compréhensibles.\n` +
        `- Reformule les intitulés techniques en langage courant. Si un terme technique est indispensable, explique-le en quelques mots (ex. « recette » = phase de vérification avant mise en service).\n` +
        `- Pas de formules de politesse ni de remplissage.\n` +
        `- Ne mentionne JAMAIS la mise en production, le déploiement ou la « prod » (ni leur absence) : Armonie réalise la recette, la mise en service est faite par le client.\n` +
        `- Ne cite aucun total de périmètre (« X tickets ») ni aucune affirmation négative globale (ex. « aucun ticket en attente ») : parle seulement de ce qui a avancé.\n` +
        `Structure en sections avec des titres HTML <h2> : "En bref" (2 à 3 phrases), "Ce qui a été terminé", "Ce qui avance", "En cours de validation", "Points d'attention", "En résumé" (les chiffres clés en une phrase).\n` +
        `N'invente AUCUN chiffre, statut NI NOM ; appuie-toi uniquement sur les données ci-dessous. Les SEULES personnes que tu peux citer nommément sont : ${noms.join(", ") || "aucune (dans ce cas écris « l'équipe »)"}. Tout autre nom est interdit. Réponds UNIQUEMENT en HTML (<h2>, <h3>, <p>, <b>), sans <html> ni <body>.\n\n` +
        `Terminés aujourd'hui (${dayDone.length}) :\n${pick(dayDone) || "(aucun)"}\n\n` +
        `En cours aujourd'hui (${dayActive.length}) :\n${pick(dayActive) || "(aucun)"}\n\n` +
        `À surveiller (${bloquants.length}) :\n${pick(bloquants) || "(aucun)"}`;
      body = await callClaude(STYLE, prompt + lexique(dossier));
    } catch { body = ""; }
  }
  if (!body) body = writtenTemplate(dossier, issues);

  const html = buildDoc({
    kicker: "Compte rendu écrit",
    title: `Journée du ${new Date().toLocaleDateString("fr-FR")}`,
    subtitle: `Dossier ${dossier} — équipe Armonie`,
    cartouche: [["Client / dossier", `${dossier} — équipe Armonie`], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Type", "CR écrit"], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "Claude + données" : "données" };
}
// CR rédigé pour une DATE PRÉCISE (passée ou non) et un périmètre client donné.
// Contrairement à writtenDailyReport (figé sur "aujourd'hui"), on filtre sur le jour demandé.
export async function writtenDateReport(dossier, range, allIssues = []) {
  // range : { startISO, endISO, label }  — ou une simple date "YYYY-MM-DD" (compat ancienne version)
  let startISO = null, endISO = null, label = "";
  if (typeof range === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
      const [y, m, d] = range.split("-").map(Number);
      startISO = new Date(y, m - 1, d).toISOString();
      endISO = new Date(y, m - 1, d + 1).toISOString();
      label = new Date(y, m - 1, d).toLocaleDateString("fr-FR");
    }
  } else if (range && typeof range === "object") {
    startISO = range.startISO || null; endISO = range.endISO || null; label = range.label || "";
  }
  label = label || "la période";
  const scope = (!dossier || dossier === "Tous" || dossier === "Tous les clients") ? null : dossier;
  const scopeLabel = scope || "Tous les clients";
  const start = startISO ? new Date(startISO).getTime() : null;
  const end = endISO ? new Date(endISO).getTime() : null;
  const inR = (iso) => { const t = new Date(iso).getTime(); if (isNaN(t)) return false; if (start != null && t < start) return false; if (end != null && t >= end) return false; return true; };
  const pool = allIssues.filter((i) => (!scope || i.dossier === scope));
  const done = pool.filter((i) => DONE_CATS.includes(i.categorie) && inR(i.resolu || i.maj));
  const active = pool.filter((i) => ACTIVE_CATS.includes(i.categorie) && inR(i.maj));
  const bloquants = pool.filter((i) => (i.statut === "Bloqué" || i.flagged) && inR(i.maj));

  let body = "";
  if (aiAvailable()) {
    try {
      const pick = (arr) => arr.slice(0, 40).map((i) => `- ${i.cle} : ${i.resume}${devOf(i) ? " [" + devOf(i) + "]" : ""}${scope ? "" : " {" + (i.dossier || "?") + "}"} (${CATEGORY_LABEL[i.categorie] || i.statut})`).join("\n");
      const noms = [...new Set([...done, ...active, ...bloquants].flatMap((i) => (i.contributors && i.contributors.length ? i.contributors : [devOf(i)])).filter((n) => n && n !== "Non assigné"))];
      const prompt = `Rédige un COMPTE RENDU ÉCRIT, complet et précis, pour la période « ${label} », périmètre "${scopeLabel}", en français, destiné à un lecteur NON technique (responsable côté client).\n` +
        `RÈGLES DE CLARTÉ (importantes) :\n` +
        `- Langage simple et concret, phrases courtes. Pas de jargon informatique.\n` +
        `- N'affiche PAS de références de tickets (pas de "ABC-123") : décris le travail en mots.\n` +
        `- Reformule les intitulés techniques en langage courant ; si un terme technique est indispensable, explique-le brièvement.\n` +
        `- Sois exhaustif sur les éléments fournis ci-dessous, sans rien inventer. Pas de formules de politesse ni de remplissage.\n` +
        (scope ? "" : `- Plusieurs clients sont concernés : fais une sous-section <h3> par client (le nom figure entre accolades dans les données).\n`) +
        `Structure en sections HTML <h2> : "En bref" (2-3 phrases), "Ce qui a été terminé", "Ce qui avance", "En cours de validation", "Points d'attention", "En résumé" (chiffres clés en une phrase).\n` +
        `N'invente AUCUN chiffre, statut NI NOM ; appuie-toi UNIQUEMENT sur les données ci-dessous. Les SEULES personnes citables nommément : ${noms.join(", ") || "aucune (dans ce cas écris « l'équipe »)"}. Tout autre nom est interdit. Réponds UNIQUEMENT en HTML (<h2>, <h3>, <p>, <b>), sans <html> ni <body>.\n\n` +
        `Terminés sur la période (${done.length}) :\n${pick(done) || "(aucun)"}\n\n` +
        `En cours sur la période (${active.length}) :\n${pick(active) || "(aucun)"}\n\n` +
        `À surveiller (${bloquants.length}) :\n${pick(bloquants) || "(aucun)"}`;
      body = await callClaude(STYLE, prompt + lexique(scope));
    } catch { body = ""; }
  }
  if (!body) {
    const li = (arr) => arr.length ? "<ul>" + arr.slice(0, 60).map((i) => `<li>${esc(i.resume)}${devOf(i) ? " — " + esc(devOf(i)) : ""}${scope ? "" : " <i>(" + esc(i.dossier || "?") + ")</i>"}</li>`).join("") + "</ul>" : "<p>Aucun.</p>";
    body = `<h2>En bref</h2><p>Période « ${esc(label)} » — ${esc(scopeLabel)}. ${done.length} terminé(s), ${active.length} en cours, ${bloquants.length} à surveiller.</p>` +
      `<h2>Ce qui a été terminé</h2>${li(done)}<h2>Ce qui avance</h2>${li(active)}<h2>Points d'attention</h2>${li(bloquants)}`;
  }
  const html = buildDoc({
    kicker: "Compte rendu écrit",
    title: `Récap — ${label}`,
    subtitle: `${scopeLabel} — équipe Armonie`,
    cartouche: [["Périmètre", scopeLabel], ["Période", label], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Type", "CR écrit (IA)"]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "Claude + données" : "données" };
}
// Ne garde que les gens d'ARMONIE (les contacts client sont exclus via clientNames).
// Périmètre : ce qui est en mouvement (En cours + Retour test).
export async function morningReport(dossier, issues, clientNames = new Set()) {
  const FOCUS = ["encours", "retourTest"];
  const isClient = (i) => {
    const d = (i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "")).trim().toLowerCase();
    return d && clientNames.has(d);
  };
  // En mouvement + uniquement les gens d'Armonie.
  const active = issues.filter((i) => FOCUS.includes(i.categorie) && !isClient(i));

  // Charge par personne (qui a quoi sur sa table ce matin).
  const byDev = {};
  active.forEach((i) => {
    const d = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "Non assigné");
    byDev[d] = (byDev[d] || 0) + 1;
  });
  const persons = Object.entries(byDev).sort((a, b) => b[1] - a[1]);
  const charge = persons.length
    ? `<h2>Charge par personne</h2><table class="data"><tr><th>Personne</th><th>Tickets actifs</th></tr>` +
      persons.map(([d, n]) => `<tr><td><span class="who">${esc(d)}</span></td><td><b>${n}</b></td></tr>`).join("") + `</table>`
    : "";

  const sec = (cat, titre) => {
    const arr = active.filter((i) => i.categorie === cat);
    return `<h2>${titre} (${arr.length})</h2>${catList(arr, { cap: 100 })}`;
  };

  const nEnCours = active.filter((i) => i.categorie === "encours").length;
  const nRetourTest = active.filter((i) => i.categorie === "retourTest").length;
  const enRetard = active.filter((i) => i.enRetard);

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="v">${active.length}</div><div class="l">À passer en revue</div></div>
    <div class="kpi"><div class="v">${nEnCours}</div><div class="l">En cours</div></div>
    <div class="kpi"><div class="v">${nRetourTest}</div><div class="l">Retour test</div></div>
  </div>`;

  // Synthèse « état des lieux » préparée (façon chef de projet senior) : points à aborder au stand-up.
  let synthese = "";
  if (aiAvailable() && active.length) {
    try {
      const top = persons.slice(0, 6).map(([d, n]) => `${d} (${n})`).join(", ");
      const retardListe = enRetard.slice(0, 10).map((i) => `${i.cle} ${i.resume}`).join(" ; ");
      const prompt = `Tu es chef de projet senior. Prépare l'ÉTAT DES LIEUX pour le stand-up du matin, dossier "${dossier}", ` +
        `équipe Armonie uniquement. Sois concret et orienté action (points à aborder, priorités, blocages éventuels), ` +
        `en 3 à 5 phrases. Ne réinvente pas de chiffres.\n` +
        `Données : ${active.length} ticket(s) actif(s) (${nEnCours} en cours, ${nRetourTest} en retour test). ` +
        `Charge par personne : ${top || "—"}. ` +
        `${enRetard.length ? "En retard : " + enRetard.length + " (" + retardListe + ")." : "Aucun ticket en retard."}\n` +
        `Réponds UNIQUEMENT en HTML <p>…</p>, sans titre.`;
      synthese = await callClaude(STYLE, prompt + lexique(dossier));
    } catch { synthese = ""; }
  }
  if (!synthese) {
    const bits = [];
    bits.push(`État des lieux du matin — dossier <b>${esc(dossier)}</b> (équipe Armonie) : <b>${active.length}</b> ticket(s) à passer en revue, dont <b>${nEnCours}</b> en cours et <b>${nRetourTest}</b> en retour test.`);
    if (persons.length) bits.push(`À aborder en priorité avec ${esc(persons.slice(0, 3).map(([d]) => d).join(", "))}.`);
    if (enRetard.length) bits.push(`<b>Point d'attention :</b> ${enRetard.length} ticket(s) en retard à traiter en priorité.`);
    else bits.push(`Aucun ticket en retard à ce stade.`);
    synthese = `<p>${bits.join(" ")}</p>`;
  }

  const enCoursTk = active.filter((i) => i.categorie === "encours");
  const retourTk = active.filter((i) => i.categorie === "retourTest");
  const avanceBloc = `<h2>Ce qui a avancé (${enCoursTk.length})</h2>` +
    `<p style="font-size:12px;color:#74718a;margin-top:-2px;">Chaque sujet en cours, expliqué simplement. Cliquez sur un sujet pour déplier le détail.</p>` +
    (await progressHtml(enCoursTk));
  const retourBloc = `<h2>Retour test (${retourTk.length})</h2>` +
    (retourTk.length ? (await progressHtml(retourTk)) : "<p>Aucun ticket en retour test.</p>");

  const body = kpis +
    `<h2>État des lieux</h2>${synthese}` +
    charge +
    avanceBloc +
    retourBloc;

  const html = buildDoc({
    kicker: "Brief de réunion matinale",
    title: `Réunion du ${new Date().toLocaleDateString("fr-FR")}`,
    subtitle: `Dossier ${dossier} · équipe Armonie`,
    cartouche: [["Client / dossier", `${dossier} — équipe Armonie`], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Type", "Brief matinal"], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "Claude + données" : "données" };
}


export async function explainTicket(ticket) {
  if (aiAvailable()) {
    const prompt = `Explique ce ticket en 1 à 2 phrases TRÈS simples, comme à quelqu'un qui n'y connaît rien.
Titre : ${ticket.resume}
${ticket.descriptionText ? "Détail : " + ticket.descriptionText.slice(0, 1500) : ""}
Dis juste, sans jargon : de quoi il s'agit, et à quoi ça sert. Phrases courtes. Pas de termes techniques.`;
    return await callClaude(
      "Tu expliques des tickets techniques en mots simples du quotidien, pour une personne non technique. Très court, concret, zéro jargon.",
      prompt
    );
  }
  // Repli sans clé IA : on affiche le résumé puis la description COMPLÈTE (non tronquée).
  if (ticket.descriptionText) {
    return `En clair : ${ticket.resume}.\n\n${ticket.descriptionText.trim()}`;
  }
  return `En clair : ce ticket concerne « ${ticket.resume} ».`;
}

// ---------- Rapport de réalisation d'un ticket ----------
export async function ticketReport(ticket, note) {
  if (aiAvailable()) {
    const prompt = `Rédige un court rapport de réalisation pour le ticket ${ticket.cle} (« ${ticket.resume} »).
Note du chef de projet : "${note || "Réalisé."}".
2 à 4 phrases : ce qui a été fait, le résultat, et l'éventuelle suite. Renvoie du texte simple (pas de HTML).`;
    const txt = await callClaude("Tu rédiges des rapports de réalisation de tickets, en français, factuels et concis. Réponds en texte simple.", prompt);
    return txt;
  }
  return `Ticket ${ticket.cle} — « ${ticket.resume} » : traité. ${note ? note : "Travail réalisé et vérifié."} Clôture proposée.`;
}


// ---------- Rapport global (tous les clients, organisé par client) ----------
export async function globalReport(byDossier) {
  const dossiers = Object.keys(byDossier);
  let body = '';
  let totalAll = 0, doneAll = 0;
  let detailBudget = 18; // plafond global d'appels détaillés (latence Jira maîtrisée)
  for (const dossier of dossiers) {
    const issues = byDossier[dossier];
    const g = buckets(issues);
    totalAll += issues.length; doneAll += g["Terminé"].length;
    // Détail explicatif (accordéon) : terminés aujourd'hui, plafonné par client et au global.
    const doneToday = issues.filter((i) => doneWithin(isToday, i)).sort(byMajDesc);
    let detailHtml = "";
    if (doneToday.length && detailBudget > 0) {
      const take = doneToday.slice(0, Math.min(4, detailBudget));
      detailBudget -= take.length;
      detailHtml = `<h3>Terminés aujourd'hui — détail</h3>` + (await detailedTicketsHtml(take));
    }
    body += `<h2>${esc(dossier)}</h2>` + kpiRow(g, issues.length) +
      detailHtml +
      `<h3>Terminé</h3>${listHtml(g["Terminé"])}` +
      `<h3>En cours</h3>${listHtml(g["En cours"])}` +
      (g["Bloqué"].length ? `<h3>Bloqués</h3>${listHtml(g["Bloqué"])}` : "") +
      `<h3>À faire</h3>${listHtml(g["À faire"])}`;
  }
  const intro = `<p>Synthèse consolidée du jour sur ${dossiers.length} client(s) : ${totalAll} tickets, dont ${doneAll} terminé(s). Détail par client ci-dessous.</p>`;
  const html = buildDoc({
    kicker: "Rapport journalier global",
    title: `Activité du ${new Date().toLocaleDateString("fr-FR")}`,
    subtitle: "Tous les clients, organisé par dossier",
    cartouche: [["Équipe", "Armonie"], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Type", "Rapport global"], ["Clients", dossiers.join(", ")], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: intro + body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "données" : "gabarit" };
}

// ---------- Compte rendu de réunion ----------
// Détecte et nettoie des participants collés en vrac (sauts de ligne, virgules,
// points-virgules, « et », « & », puces, numéros). Renvoie des noms propres dédoublonnés.
function parseParticipants(str) {
  if (!str) return [];
  const parts = String(str)
    .split(/\r?\n|,|;|·|•|\u2022|\s+et\s+|\s+&\s+|\s\/\s/i)
    .map((s) => s.replace(/^[-*•·\d.\)\s]+/, "").trim())
    .filter((s) => s.length > 1);
  const seen = new Set(); const out = [];
  for (const p of parts) { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out;
}

// Structure un texte collé sans IA : « 1. » → sous-titre, « Label : » → libellé en gras,
// puces et lignes → liste. Préserve l'ordre. Bien mieux qu'un bloc empilé.
function structureNotes(text) {
  const lines = String(text || "").split(/\r?\n/);
  let html = ""; let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const numbered = line.match(/^(\d+)[.\)]\s+(.+)$/);
    const bullet = line.match(/^[-*•·]\s+(.+)$/);
    const labelColon = line.match(/^([^:]{2,40}):\s*(.*)$/);
    if (numbered) { closeList(); html += `<h3>${esc(numbered[2])}</h3>`; }
    else if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${esc(bullet[1])}</li>`; }
    else if (labelColon && labelColon[2]) { closeList(); html += `<p><b>${esc(labelColon[1].trim())} :</b> ${esc(labelColon[2])}</p>`; }
    else if (labelColon && !labelColon[2]) { closeList(); html += `<p><b>${esc(labelColon[1].trim())}</b></p>`; }
    else { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${esc(line)}</li>`; }
  }
  closeList();
  return html || "<p>—</p>";
}

function templateMeeting({ titre, participants, notes, transcript }) {
  const parts = parseParticipants(participants);
  const partHtml = parts.length ? `<ul>${parts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "<p>—</p>";
  const corps = [notes, transcript].filter(Boolean).join("\n\n");
  const pointsHtml = corps ? structureNotes(corps) : "<p>—</p>";
  return `<h2>Objet</h2><p>${esc(titre || "Réunion")}</p>
    <h2>Participants</h2>${partHtml}
    <h2>Points abordés</h2>${pointsHtml}
    <h2>Décisions</h2><ul><li>À compléter.</li></ul>
    <h2>Actions</h2><table class="data"><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr><tr><td>À compléter</td><td>—</td><td>—</td></tr></table>
    <p class="muted" style="margin-top:16px;font-size:12px;">Note : sans clé IA, ce compte rendu reprend vos notes (structurées au mieux : titres, libellés, puces). Pour un CR <b>rédigé, synthétisé et remis en page automatiquement</b> — décisions et actions extraites — ajoutez une clé IA (Groq gratuit ou Anthropic) dans Render.</p>`;
}

export async function meetingReport({ titre, participants, notes, transcript, images = [], equipe, consigne = "", jiraFacts = "" }) {
  const parts = parseParticipants(participants);
  const partLine = parts.length ? parts.join(", ") : "non précisés";
  const team = (equipe && String(equipe).trim()) || process.env.TEAM_LABEL || "TMA Armonie";
  let body;
  if (aiAvailable()) {
    const prompt = `À partir des éléments ci-dessous, rédige un COMPTE RENDU DE RÉUNION complet, clair et bien mis en page, en français, style CR professionnel Armonie.
${consigne && consigne.trim() ? `
CONSIGNE DE L'UTILISATEUR (PRIORITAIRE — applique-la scrupuleusement, elle prime sur la mise en forme par défaut) :
${consigne.trim()}
` : ""}
RÈGLES DE FIDÉLITÉ (PRIORITAIRES — ne jamais enfreindre) :
- N'utilise QUE les informations présentes dans les notes / la transcription. N'invente AUCUN fait, chiffre, date, nom, ticket, option ni décision.
- NOMS DE PERSONNES : les SEULS noms autorisés sont ceux de la liste « Participants » ci-dessous et ceux explicitement écrits dans les notes / la transcription. N'invente, ne déduis ni ne complète AUCUN autre nom ; si l'auteur d'une action est inconnu, écris « non précisé » (jamais un prénom inventé).
- NUMÉROS DE TICKETS : recopie-les EXACTEMENT depuis la source. Ne devine pas, ne transpose pas un numéro (ex. ne transforme pas 773 en 713). Si un numéro est incertain ou absent, écris « (numéro à confirmer) » — n'en invente jamais un.
- OPTIONS / SOLUTIONS : ne liste que les options réellement évoquées. Ne les multiplie pas, ne les fractionne pas, n'en ajoute pas pour « remplir la mise en page ». Si deux options ont été discutées, n'en mets que deux.
- ATTRIBUTION : rattache chaque fait (qui a fait quoi, mise en pré-production, livraison, analyse…) au BON ticket et à la BONNE personne. Ne fusionne JAMAIS deux tickets et ne déplace pas une action d'un ticket vers un autre. Un ticket = une section distincte.
- PÉRIMÈTRE / ÉQUIPE : l'équipe concernée est « ${team} » — emploie EXACTEMENT ce libellé et n'écris jamais « TMA » si ce n'est pas dans ce libellé. Ne restreins jamais le périmètre à des dossiers précis (ex. « Dataware / MCS ») sauf si la source le dit explicitement.
- Quand une information manque, écris-le clairement (« non précisé », « à confirmer ») plutôt que de combler le vide par une supposition.
${jiraFacts && jiraFacts.trim() ? `
CHIFFRES VÉRIFIÉS (Jira, à l'instant — mêmes données que le pilotage de bout en bout). SOURCE DE VÉRITÉ ABSOLUE :
${jiraFacts.trim()}
RÈGLE CHIFFRES : pour tout volume de tickets par dossier / par catégorie (à faire, en cours, recette Armonie, recette client, terminé…), n'emploie QUE ces valeurs. Si les notes, la transcription ou un compte rendu collé indiquent un autre chiffre, CORRIGE-le pour coller EXACTEMENT à ces données vérifiées. N'invente aucun autre chiffre.
` : ""}
STRUCTURE ATTENDUE :
- <h2>Synthèse générale</h2> : un paragraphe de synthèse, suivi d'un <div class="indic"> qui met en avant LE point marquant (un départ, un risque, une échéance clé) — uniquement s'il ressort de la source.
- Puis UNE SECTION <h2> NUMÉROTÉE PAR SUJET (ex. <h2>1. Continuité opérationnelle</h2>). Si un sujet porte un numéro de ticket : <h2>4. <span class="tk">Ticket 792</span> — Libellé</h2>. À l'intérieur : des <h3> si utile, des <p>, des listes <ul><li>, les personnes en <span class="who">Nom</span>, et le statut en <span class="pill done|prog|todo|block">…</span> (done=résolu/clôturé, prog=en cours, todo=à faire/en attente, block=bloqué).
- Si plusieurs solutions/options sont évoquées : <div class="opt"><div class="ot">Option 1</div>texte de l'option</div> (une boîte par option réellement discutée), puis une ligne <p><b>Décision :</b> …</p>.
- <h2>Plan d'actions</h2> : un <table class="data"> avec les colonnes Action / Responsable / Échéance (responsables en <span class="who">). Chaque action doit citer le bon numéro de ticket quand il y en a un.
- <h2>Conclusion</h2> : 2 à 3 phrases.

ÉLÉMENTS :
Titre : ${titre || "Réunion"}
Participants : ${partLine}
${notes ? "Notes / résumé :\n" + notes + "\n" : ""}${transcript ? "Transcription / notes de séance :\n" + transcript.slice(0, 12000) : ""}
${images.length ? "Des images (tableau blanc / slides) sont jointes : intègre ce qu'elles montrent, sans rien inventer au-delà." : ""}
Réponds UNIQUEMENT par le fragment HTML (pas de <html>/<head>/<body>).`;
    body = await callClaude(STYLE, prompt, images, 4000, 0.2);
  } else {
    body = templateMeeting({ titre, participants, notes, transcript });
  }
  const html = buildDoc({
    kicker: "Compte rendu de réunion",
    title: titre || "Compte rendu de réunion",
    subtitle: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
    cartouche: [["Objet", esc(titre || "Réunion")], ["Équipe", esc(team)], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Participants", esc(partLine === "non précisés" ? "—" : partLine)], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "Claude" : "gabarit" };
}


// ---------- Préparation de réunion ----------
// Document orienté pilotage : d'abord le CONTEXTE (point, qui travaille dessus, où on en est,
// points de friction), puis l'ordre du jour structuré à partir des notes / d'un fichier importé.
const WAIT_CATS = ["recetteArmonie", "recetteClient", "attenteClient"];

export async function meetingPrep({ dossier, sujet = "", type = "", notes = "", importedText = "", issues = [], clientNames = new Set() }) {
  const isClient = (i) => { const d = (i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "")).trim().toLowerCase(); return d && clientNames.has(d); };

  const done = issues.filter((i) => DONE_CATS.includes(i.categorie));
  const active = issues.filter((i) => ACTIVE_CATS.includes(i.categorie));
  const recette = issues.filter((i) => WAIT_CATS.includes(i.categorie));
  const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);
  const retard = issues.filter((i) => i.enRetard);
  const retours = issues.filter((i) => i.categorie === "retourTest" || i.categorie === "retourProd");
  const enRecette = issues.filter((i) => i.categorie === "recetteArmonie" || i.categorie === "recetteClient");
  const reste = issues.length - issues.filter((i) => DONE_CATS.includes(i.categorie) || i.categorie === "annule").length;
  const recentDone = done.filter((i) => i.maj).sort(byMajDesc).slice(0, 8);
  const avancement = issues.length ? Math.round((done.length / issues.length) * 100) : 0;

  const byDev = {};
  active.forEach((i) => { if (isClient(i)) return; const d = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "Non assigné"); byDev[d] = (byDev[d] || 0) + 1; });
  const persons = Object.entries(byDev).sort((a, b) => b[1] - a[1]);
  const chargeTbl = persons.length
    ? `<table class="data"><tr><th>Personne</th><th>Tickets actifs</th></tr>` + persons.map(([d, n]) => `<tr><td><span class="who">${esc(d)}</span></td><td><b>${n}</b></td></tr>`).join("") + `</table>`
    : `<p>Aucun intervenant Armonie actif identifié sur ce périmètre.</p>`;

  // CONTEXTE (façon chef de projet senior).
  let contexte = "";
  if (aiAvailable()) {
    try {
      const top = persons.slice(0, 6).map(([d, n]) => `${d} (${n})`).join(", ");
      const fric = bloquants.slice(0, 8).map((i) => `${i.cle} ${i.resume}`).join(" ; ");
      const prompt = `Tu es chef de projet senior. Rédige le CONTEXTE de préparation d'une réunion sur le dossier "${dossier}", équipe Armonie. ` +
        `En 4 à 6 phrases claires, orientées pilotage : où en est le projet, ce qui avance, qui travaille dessus, et les points de friction/risques à surveiller. Reste factuel, ne réinvente pas de chiffres.\n` +
        `Données : ${issues.length} tickets (${avancement}% terminés). ${active.length} en cours, ${recette.length} en recette/attente, ${bloquants.length} bloquant(s)/flaggé(s), ${retard.length} en retard. Charge par personne : ${top || "—"}. Points de friction : ${fric || "aucun"}.\n` +
        `Réponds UNIQUEMENT en HTML <p>…</p>, sans titre.`;
      contexte = await callClaude(STYLE, prompt + lexique(dossier));
    } catch { contexte = ""; }
  }
  if (!contexte) {
    const bits = [];
    bits.push(`Dossier <b>${esc(dossier)}</b> (équipe Armonie) : <b>${avancement}%</b> terminé (${done.length}/${issues.length}), <b>${active.length}</b> ticket(s) en cours, <b>${recette.length}</b> en recette ou attente.`);
    if (persons.length) bits.push(`Travaillent dessus : ${esc(persons.slice(0, 4).map(([d]) => d).join(", "))}.`);
    if (bloquants.length) bits.push(`<b>Points de friction :</b> ${bloquants.length} bloquant(s)/flaggé(s)${retard.length ? ` et ${retard.length} en retard` : ""} à arbitrer en réunion.`);
    else if (retard.length) bits.push(`<b>Point d'attention :</b> ${retard.length} ticket(s) en retard.`);
    else bits.push(`Pas de blocage majeur identifié à ce stade.`);
    contexte = `<p>${bits.join(" ")}</p>`;
  }

  // ORDRE DU JOUR (à partir des notes + fichier importé).
  const matiere = [notes, importedText].filter(Boolean).join("\n\n");
  let agenda = "";
  if (matiere.trim()) {
    if (aiAvailable()) {
      try {
        const prompt = `Tu es chef de projet senior. À partir des éléments bruts ci-dessous, structure l'ORDRE DU JOUR d'une réunion "${sujet || type || "point projet"}" pour le client "${dossier}". ` +
          `Produis : les objectifs, les points à aborder (puces), les questions ouvertes, et les décisions / actions attendues. Clair, concis, professionnel.\n` +
          `Éléments bruts :\n${matiere.slice(0, 6000)}\n` +
          `Réponds UNIQUEMENT en HTML avec <h3>, <p>, <ul><li>. Pas de <h1> ni <h2>.`;
        agenda = await callClaude(STYLE, prompt + lexique(dossier));
      } catch { agenda = ""; }
    }
    if (!agenda) {
      const lines = matiere.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      agenda = `<h3>Points à aborder</h3><ul>${lines.slice(0, 40).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    }
  } else {
    agenda = `<p class="indic">Ajoute des notes ou importe un fichier pour générer l'ordre du jour. Le contexte ci-dessus est déjà prêt pour démarrer la réunion.</p>`;
  }

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="v">${avancement}%</div><div class="l">Avancement</div></div>
    <div class="kpi"><div class="v">${active.length}</div><div class="l">En cours</div></div>
    <div class="kpi"><div class="v">${recette.length}</div><div class="l">En recette</div></div>
    <div class="kpi"><div class="v">${bloquants.length}</div><div class="l">Bloquants</div></div>
    <div class="kpi"><div class="v">${retard.length}</div><div class="l">En retard</div></div>
  </div>`;

  const body =
    `<h2>Point &amp; contexte</h2>${kpis}${contexte}` +
    `<h3>Qui travaille dessus</h3>${chargeTbl}` +
    `<h3>Où on en est — derniers livrables</h3>${recentDone.length ? catList(recentDone) : "<p>Aucun ticket récemment terminé.</p>"}` +
    `<h3>⚠ Points de friction</h3>${bloquants.length ? catList(bloquants, { showStatus: true, cap: 40 }) : "<p>Aucun blocage signalé à ce jour.</p>"}` +
    `<h2>Recette &amp; retours</h2>` +
    `<div class="kpi-row"><div class="kpi"><div class="v">${reste}</div><div class="l">À recetter</div></div><div class="kpi"><div class="v">${enRecette.length}</div><div class="l">En recette</div></div><div class="kpi"><div class="v">${retours.length}</div><div class="l">À retravailler</div></div></div>` +
    `<h3>↩ Programmes à retravailler (retours)</h3>${retours.length ? catList(retours, { showStatus: true, cap: 40 }) : "<p>Aucun retour de test/production en cours sur ce périmètre.</p>"}` +
    `<h2>Réunion — ${esc(sujet || type || "Point projet")}</h2>${agenda}`;

  const html = buildDoc({
    kicker: "Préparation de réunion",
    title: `Préparation — ${dossier}`,
    subtitle: `${sujet || type || "Point projet"} · équipe Armonie`,
    cartouche: [["Client / dossier", `${dossier} — équipe Armonie`], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Sujet", sujet || type || "Point projet"], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  const agendaText = String(agenda)
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|h2|h3|li|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n").trim();
  return {
    html,
    generatedBy: aiAvailable() ? "Claude + données" : "données",
    data: {
      dossier,
      sujet: sujet || type || "Point projet",
      avancement, active: active.length, recette: recette.length, bloquants: bloquants.length, retard: retard.length,
      contextText: String(contexte).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      agendaText,
      who: persons.map(([name, count]) => ({ name, count })),
      deliverables: recentDone.map((i) => ({ cle: i.cle, resume: i.resume, dossier: i.dossier })),
      frictions: bloquants.slice(0, 40).map((i) => ({ cle: i.cle, resume: i.resume, statut: i.statut || "" })),
    },
  };
}

// ---------- Glossaire métier par dossier ----------
// Vocabulaire spécifique à employer dans les récaps / CR / briefs générés.
// EDL : les commerciaux de l'école des loisirs s'appellent les « animateurs » (animatrices).
const DOSSIER_LEXIQUE = {
  EDL: "VOCABULAIRE DU DOSSIER — IMPÉRATIF : chez EDL (l'école des loisirs), « animateur » / « animatrice » désigne UNIQUEMENT les COMMERCIAUX CÔTÉ CLIENT (la force de vente d'EDL). Emploie ce terme à la place de « commercial » pour cette fonction. INTERDIT ABSOLU : ne qualifie JAMAIS un développeur, intervenant ou membre de l'équipe Armonie d'« animateur » — eux sont des « développeurs » / « intervenants Armonie ». Un nom listé comme intervenant/assigné d'un ticket est un développeur Armonie, jamais un animateur.",
};
function lexique(dossier) {
  const k = DOSSIER_LEXIQUE[dossier];
  return (k ? "\n\n" + k : "") + knowledgeForPrompt(dossier);
}

// ===== Mémoire auto-apprenante =====================================================
// L'IA lit l'activité Jira de chaque client et écrit, seule, un « contexte observé »
// (3 à 5 puces) dans la couche `auto` de la mémoire. Rien à faire côté utilisateur.
// Tourne en tâche de fond, throttlé, et NE FAIT RIEN sans clé IA.

const LEARN_TTL_MS = 20 * 3600 * 1000;   // au plus une fois ~par 20 h et par client
let learnRunning = false;

function summarizeForLearn(list) {
  if (!list.length) return "";
  const now = Date.now();
  const recent = list.filter((i) => { const t = new Date(i.maj || i.cree || 0).getTime(); return t && now - t < 60 * 86400000; });
  const scope = recent.length ? recent : list;
  const eng = {}, dev = {}, cat = {};
  scope.forEach((i) => {
    const e = i.engagement && i.engagement !== "—" ? i.engagement : "Autre"; eng[e] = (eng[e] || 0) + 1;
    const d = i.dev || i.assigne; if (d) dev[d] = (dev[d] || 0) + 1;
    cat[i.categorie] = (cat[i.categorie] || 0) + 1;
  });
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`).join(", ");
  const samples = scope.slice().sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || ""))).slice(0, 12)
    .map((i) => `- ${i.cle} [${i.statut}] ${i.resume}`).join("\n");
  return `Client : ${scope[0].dossier}\nTickets analyses : ${scope.length}\nPerimetres : ${top(eng, 4) || "-"}\nIntervenants : ${top(dev, 5) || "-"}\nRepartition par statut : ${top(cat, 6) || "-"}\nTickets recents :\n${samples}`;
}

export async function runAutoLearn(issues = [], { force = false } = {}) {
  if (!aiAvailable() || learnRunning) return { ran: false, learned: [] };
  learnRunning = true;
  const learned = [];
  try {
    const byDossier = {};
    for (const i of issues) { const d = i.dossier; if (d) (byDossier[d] ||= []).push(i); }
    for (const [dossier, list] of Object.entries(byDossier)) {
      if (!force && autoAgeMs(dossier) < LEARN_TTL_MS) continue;
      const summary = summarizeForLearn(list);
      if (!summary) continue;
      try {
        const raw = await callClaude(
          "Tu es analyste PMO. A partir de l'activite Jira d'un client, degage le CONTEXTE OBSERVE : perimetres actifs, themes recurrents, intervenants principaux, tendances. Strictement factuel, aucune invention. Reponds par 3 a 5 puces courtes, une par ligne, chacune commencant par tiret, sans titre ni phrase d'introduction.",
          summary, [], 400, 0.2
        );
        const points = String(raw || "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter((l) => l.length > 3).slice(0, 6);
        if (points.length) { saveAuto(dossier, points); learned.push(dossier); }
      } catch { /* un client echoue, on continue */ }
    }
  } finally { learnRunning = false; }
  return { ran: true, learned };
}
