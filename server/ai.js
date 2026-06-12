// ai.js — rédaction assistée. Utilise l'API Claude si ANTHROPIC_API_KEY est défini,
// sinon des gabarits structurés (l'outil reste utilisable sans clé).
import { buildDoc } from "./docgen.js";
import { CATEGORY_LABEL, RESTE_CATS, ACTIVE_CATS, DONE_CATS } from "./config.js";
import { fetchIssueActivity, fetchIssueDescription } from "./jira.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
// Modèle : Anthropic si clé Anthropic, sinon modèle Groq gratuit par défaut.
const MODEL = process.env.AI_MODEL || (ANTHROPIC_KEY ? "claude-sonnet-4-6" : "llama-3.3-70b-versatile");

export function aiAvailable() { return Boolean(ANTHROPIC_KEY || GROQ_KEY); }

// Aiguilleur d'appel IA. Priorité : Anthropic (payant, données privées) si présent ;
// sinon Groq (gratuit, sans carte bancaire, compatible OpenAI) ; sinon erreur (→ gabarit).
// `images` = [{media_type, dataBase64}] (vision : Anthropic uniquement).
async function callClaude(system, userText, images = [], maxTokens = 2000) {
  if (ANTHROPIC_KEY) return callAnthropic(system, userText, images, maxTokens);
  if (GROQ_KEY) return callGroq(system, userText, maxTokens);
  throw new Error("Aucune clé IA configurée.");
}

async function callAnthropic(system, userText, images = [], maxTokens = 2000) {
  const content = [];
  for (const im of images) content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.dataBase64 } });
  content.push({ type: "text", text: userText });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`API Claude ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// Groq : API gratuite compatible OpenAI. Texte uniquement (les images sont ignorées).
async function callGroq(system, userText, maxTokens = 2000) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, temperature: 0.4,
      messages: [{ role: "system", content: system }, { role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw new Error(`API Groq ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

const STYLE = `Tu es l'assistant d'un chef de projet senior d'Armonie Group (centre de services IBM i).
Tu rédiges en français, ton professionnel, clair, concis et rigoureux — comme un compte rendu Armonie.
Tu renvoies UNIQUEMENT un fragment HTML (pas de <html>, <head> ni <body>), sans style inline. Éléments autorisés :
<h2> et <h3> (titres), <p>, <ul><li>, <b>, <table class="data"> avec <th>/<td>, et ces classes de la charte :
<span class="tk"> (clé de ticket), <span class="who"> (nom de personne),
<span class="pill done|prog|todo|block"> (statut : done=résolu/clôturé, prog=en cours, todo=à faire/en attente, block=bloqué),
<div class="indic"> (encadré pour un point marquant), et <div class="opt"><div class="ot">Option 1</div>…</div> (présenter des options).`;

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

// Petite limite de concurrence pour ne pas saturer Jira lors de la récupération des détails.
async function mapLimit(items, limit, fn) {
  const out = []; let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
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

  return enriched.map(({ i, desc, act }) => {
    const statut = CATEGORY_LABEL[i.categorie] || i.statut || "—";
    const who = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "");
    const prob = desc
      ? esc(desc.slice(0, 600)) + (desc.length > 600 ? "…" : "")
      : `<span class="cr-none">Non documentée dans Jira.</span>`;
    const works = (act.worklogs || []).filter((w) => w.comment)
      .map((w) => `<li>${esc(w.comment)} <span class="cr-meta">— ${esc(w.who)}${w.time ? ", " + esc(w.time) : ""}</span></li>`);
    const travaux = works.length
      ? `<ul class="cr-works">${works.join("")}</ul>`
      : `<span class="cr-none">Aucun détail de travaux saisi dans Jira — à demander au développeur.</span>`;
    const trans = (act.timeline || []).filter((t) => t.champ === "Statut")
      .slice(0, 6).reverse()
      .map((t) => `<span class="cr-from">${esc(t.from)}</span> → <span class="cr-to">${esc(t.to)}</span>`)
      .join(" , puis ");
    const avancement = trans || `Statut actuel : <b>${esc(statut)}</b>`;
    const tps = act.totalSeconds ? ` · ${esc(act.totalTime)} saisies` : "";
    return `<details class="cr-tk">
      <summary><span class="cr-tk-k">${esc(i.cle)}</span> ${esc(i.resume)} <span class="cr-tk-st">${esc(statut)}</span></summary>
      <div class="cr-tk-bd">
        <p class="cr-row"><span class="cr-lbl">Problématique / contexte</span>${prob}</p>
        <div class="cr-row"><span class="cr-lbl">Travaux réalisés</span>${travaux}</div>
        <p class="cr-row"><span class="cr-lbl">Avancement</span>${avancement}</p>
        <p class="cr-row"><span class="cr-lbl">Intervenant(s)</span>${esc(who || "—")}${tps}</p>
      </div>
    </details>`;
  }).join("");
}


function templateDaily(dossier, issues, analyseHtml = "", detailedHtml = "") {
  const inCat = (c) => issues.filter((i) => i.categorie === c);
  const doneToday = issues.filter((i) => DONE_CATS.includes(i.categorie) && isToday(i.maj)).sort(byMajDesc);
  const enCoursToday = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && isToday(i.maj)).sort(byMajDesc);
  const recArmonie = inCat("recetteArmonie");
  const recClient = inCat("recetteClient");
  const attenteClient = inCat("attenteClient");
  const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);

  // Photo globale du dossier (pas seulement la journée) pour la ligne de KPI.
  const g = { "Terminé": [], "En cours": [], "À faire": [], "Bloqué": [] };
  issues.forEach((i) => { (g[i.statut] || (g[i.statut] = [])).push(i); });

  // Activité du jour par personne.
  const touchedToday = issues.filter((i) => isToday(i.maj));
  const parPersonne = {};
  touchedToday.forEach((i) => {
    const d = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "Non assigné");
    (parPersonne[d] ||= { dev: d, faits: 0, encours: 0, total: 0 });
    parPersonne[d].total += 1;
    if (DONE_CATS.includes(i.categorie)) parPersonne[d].faits += 1;
    else if (ACTIVE_CATS.includes(i.categorie)) parPersonne[d].encours += 1;
  });
  const personnes = Object.values(parPersonne).sort((a, b) => b.total - a.total);
  const tablePersonnes = personnes.length
    ? `<table class="data"><tr><th>Personne</th><th>Terminés</th><th>En cours</th><th>Total du jour</th></tr>` +
      personnes.map((p) => `<tr><td><span class="who">${esc(p.dev)}</span></td><td>${p.faits}</td><td>${p.encours}</td><td><b>${p.total}</b></td></tr>`).join("") +
      `</table>`
    : `<p>Aucun ticket mis à jour aujourd'hui.</p>`;

  const recette = [...recArmonie, ...recClient];
  const recetteBloc = recette.length
    ? `<h3>En recette — ${recArmonie.length} côté Armonie · ${recClient.length} côté client</h3>${catList(recette, { showStatus: true, cap: 40 })}`
    : `<h3>En recette</h3><p>Aucun ticket en attente de recette.</p>`;
  const attenteBloc = attenteClient.length
    ? `<h3>En attente client (${attenteClient.length})</h3>${catList(attenteClient, { cap: 40 })}`
    : "";
  const bloquantsBloc = bloquants.length
    ? `<h3>⚠ Points bloquants (${bloquants.length})</h3>${catList(bloquants, { showStatus: true, cap: 40 })}`
    : `<h3>Points bloquants</h3><p>Aucun point bloquant signalé à ce jour.</p>`;

  return `<h2>Synthèse de la journée</h2>
    ${kpiRow(g, issues.length)}
    ${analyseHtml || ""}
    <h2>État des lieux détaillé</h2>
    <p style="font-size:12px;color:#74718a;margin-top:-2px;">${doneToday.length} terminé(s) · ${enCoursToday.length} en cours aujourd'hui. Cliquez sur un ticket pour déplier le détail (sujet, problématique, travaux réalisés, avancement).</p>
    ${detailedHtml || "<p>Aucun ticket travaillé aujourd'hui.</p>"}
    ${recetteBloc}
    ${attenteBloc}
    ${bloquantsBloc}
    <h2>Activité du jour par personne</h2>${tablePersonnes}`;
}

export async function dailyReport(dossier, issues) {
  // Données du jour (toujours exactes, calcul déterministe).
  const dayDone = issues.filter((i) => i.categorie === "termine" && isToday(i.maj));
  const dayActive = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && isToday(i.maj));
  const recA = issues.filter((i) => i.categorie === "recetteArmonie").length;

  // Compte par personne (pour nourrir l'analyse).
  const whoDone = {};
  dayDone.forEach((i) => { const d = i.dev && i.dev !== "Non assigné" ? i.dev : (i.assigne || "Non assigné"); whoDone[d] = (whoDone[d] || 0) + 1; });
  const topWho = Object.entries(whoDone).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} (${n})`).join(", ");

  // Analyse « chef de projet senior » : claire, concise, pertinente — placée avant « Terminés ».
  let analyseHtml = "";
  if (aiAvailable()) {
    try {
      const dev = (i) => (i.dev && i.dev !== "Non assigné" ? " [" + i.dev + "]" : (i.assigne && i.assigne !== "Non assigné" ? " [" + i.assigne + "]" : ""));
      const doneList = dayDone.slice(0, 25).map((i) => `- ${i.cle} : ${i.resume}${dev(i)}`).join("\n");
      const activeList = dayActive.slice(0, 25).map((i) => `- ${i.cle} : ${i.resume}${dev(i)} (${CATEGORY_LABEL[i.categorie] || i.statut})`).join("\n");
      const prompt = `Tu es un chef de projet senior. Rédige une ANALYSE rédigée de la journée pour le dossier "${dossier}", ` +
        `comme si tu l'écrivais toi-même : explique CE QUI A AVANCÉ et QUI a travaillé sur QUOI, en 2 à 4 paragraphes clairs et factuels, ` +
        `en citant les personnes par leur nom et les tickets par leur clé. Termine par un point d'attention si pertinent. Ne réinvente aucun chiffre.\n` +
        `Données réelles : ${dayDone.length} terminé(s) aujourd'hui, ${dayActive.length} en cours dans la journée, ${recA} en attente de recette Armonie. Terminés par personne : ${topWho || "—"}.\n` +
        `Tickets terminés aujourd'hui :\n${doneList || "(aucun)"}\n` +
        `Tickets en cours aujourd'hui :\n${activeList || "(aucun)"}\n` +
        `Réponds UNIQUEMENT par 1 à 4 paragraphes HTML <p>…</p>, sans titre.`;
      analyseHtml = await callClaude(STYLE, prompt);
    } catch { analyseHtml = ""; }
  }
  if (!analyseHtml) {
    // Repli déterministe (sans IA) : une synthèse concise et utile.
    if (dayDone.length || dayActive.length) {
      const phrases = [];
      phrases.push(`Aujourd'hui, <b>${dayDone.length}</b> ticket(s) terminé(s) et <b>${dayActive.length}</b> ticket(s) travaillé(s) sur le dossier ${esc(dossier)}.`);
      if (topWho) phrases.push(`Contributions principales : ${esc(topWho)}.`);
      if (recA) phrases.push(`<b>${recA}</b> ticket(s) restent en attente de recette côté Armonie — à suivre pour validation.`);
      analyseHtml = `<p>${phrases.join(" ")}</p>`;
    } else {
      analyseHtml = `<p>Aucune activité enregistrée aujourd'hui sur le dossier ${esc(dossier)} (aucun ticket terminé ni mis à jour).</p>`;
    }
  }

  // Détail explicatif par ticket : ce qui a été travaillé/terminé aujourd'hui.
  // Repli : si rien aujourd'hui, on prend les tickets les plus récemment mis à jour.
  const seen = new Set();
  let detailSource = [...dayDone, ...dayActive].filter((i) => { if (seen.has(i.cle)) return false; seen.add(i.cle); return true; });
  if (!detailSource.length) detailSource = [...issues].sort(byMajDesc).slice(0, 10);
  const detailedHtml = await detailedTicketsHtml(detailSource);

  const body = templateDaily(dossier, issues, analyseHtml, detailedHtml);

  const html = buildDoc({
    kicker: "Compte rendu journalier",
    title: `Journée du ${new Date().toLocaleDateString("fr-FR")}`,
    subtitle: `Dossier ${dossier} — équipe Armonie · activité consolidée`,
    cartouche: [["Client / dossier", `${dossier} — équipe Armonie`], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Type", "CR journalier"], ["Date", new Date().toLocaleDateString("fr-FR")]],
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
function exTicket(i) { const d = devOf(i); return `<b>${esc(i.cle)}</b> (${esc(shorten(i.resume, 60))}${d ? ", " + esc(d) : ""})`; }
function exList(arr, max = 4) {
  let s = arr.slice(0, max).map(exTicket).join(", ");
  if (arr.length > max) s += `, parmi ${arr.length} au total`;
  return s;
}

function writtenTemplate(dossier, issues) {
  const dayDone = issues.filter((i) => DONE_CATS.includes(i.categorie) && isToday(i.maj)).sort(byMajDesc);
  const dayActive = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && isToday(i.maj)).sort(byMajDesc);
  const recArmonie = issues.filter((i) => i.categorie === "recetteArmonie");
  const recClient = issues.filter((i) => i.categorie === "recetteClient");
  const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);
  const recTot = recArmonie.length + recClient.length;

  const whoDone = {};
  dayDone.forEach((i) => { const d = devOf(i) || "Non assigné"; whoDone[d] = (whoDone[d] || 0) + 1; });
  const topWho = Object.entries(whoDone).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([d, n]) => `${esc(d)} (${n})`).join(", ");

  const enBref = `<p>Sur la journée, <b>${dayDone.length}</b> ticket(s) terminé(s), <b>${dayActive.length}</b> en cours${bloquants.length ? ` et <b>${bloquants.length}</b> à surveiller` : ""}.${topWho ? ` Contributions principales : ${topWho}.` : ""}</p>`;
  const sTermine = dayDone.length
    ? `<p>${dayDone.length} ticket(s) clôturé(s) aujourd'hui. Notamment ${exList(dayDone)}.</p>`
    : `<p>Aucun ticket clôturé aujourd'hui.</p>`;
  const sEnCours = dayActive.length
    ? `<p>${dayActive.length} ticket(s) en cours de traitement. Exemples : ${exList(dayActive)}.</p>`
    : `<p>Aucun ticket travaillé aujourd'hui.</p>`;
  const sRecette = recTot
    ? `<p>${recTot} ticket(s) en attente de recette (${recArmonie.length} côté Armonie, ${recClient.length} côté client). ${exList([...recArmonie, ...recClient], 3)}.</p>`
    : "";
  const sBloq = bloquants.length
    ? `<p>${bloquants.length} point(s) à surveiller : ${exList(bloquants)}.</p>`
    : `<p>Aucun point bloquant signalé à ce jour.</p>`;
  const sChiffres = `<p>${dayDone.length} terminé(s) · ${dayActive.length} en cours · ${recTot} en recette · ${bloquants.length} à surveiller · ${issues.length} au total sur le dossier.</p>`;

  return `<h2>En bref</h2>${enBref}
    <h2>Ce qui a été terminé</h2>${sTermine}
    <h2>En cours</h2>${sEnCours}
    ${recTot ? `<h2>En recette</h2>${sRecette}` : ""}
    <h2>Points d'attention</h2>${sBloq}
    <h2>Chiffres</h2>${sChiffres}`;
}

export async function writtenDailyReport(dossier, issues) {
  let body = "";
  if (aiAvailable()) {
    try {
      const pick = (arr) => arr.slice(0, 20).map((i) => `- ${i.cle} : ${i.resume}${devOf(i) ? " [" + devOf(i) + "]" : ""} (${CATEGORY_LABEL[i.categorie] || i.statut})`).join("\n");
      const dayDone = issues.filter((i) => DONE_CATS.includes(i.categorie) && isToday(i.maj));
      const dayActive = issues.filter((i) => ACTIVE_CATS.includes(i.categorie) && isToday(i.maj));
      const bloquants = issues.filter((i) => i.statut === "Bloqué" || i.flagged);
      const prompt = `Rédige un COMPTE RENDU ÉCRIT de la journée pour le dossier "${dossier}", en français, SANS bla-bla : phrases courtes, factuelles, aucun remplissage ni formule de politesse.\n` +
        `Structure en sections avec des titres HTML <h2> : "En bref" (2 à 3 phrases), "Ce qui a été terminé", "En cours", "Points d'attention", "Chiffres".\n` +
        `Dans chaque section, cite des EXEMPLES de tickets : clé en gras (<b>CLE</b>) suivie d'un mot sur le sujet. Si un regroupement par thème est pertinent, utilise des sous-titres <h3>.\n` +
        `Ne réinvente AUCUN chiffre ni statut ; appuie-toi uniquement sur les données ci-dessous. Réponds UNIQUEMENT en HTML (<h2>, <h3>, <p>, <b>), sans <html> ni <body>.\n\n` +
        `Terminés aujourd'hui (${dayDone.length}) :\n${pick(dayDone) || "(aucun)"}\n\n` +
        `En cours aujourd'hui (${dayActive.length}) :\n${pick(dayActive) || "(aucun)"}\n\n` +
        `À surveiller (${bloquants.length}) :\n${pick(bloquants) || "(aucun)"}`;
      body = await callClaude(STYLE, prompt);
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
      synthese = await callClaude(STYLE, prompt);
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

  const body = kpis +
    `<h2>État des lieux</h2>${synthese}` +
    charge +
    sec("encours", "En cours") +
    sec("retourTest", "Retour test");

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
    const doneToday = issues.filter((i) => DONE_CATS.includes(i.categorie) && isToday(i.maj)).sort(byMajDesc);
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

export async function meetingReport({ titre, participants, notes, transcript, images = [] }) {
  const parts = parseParticipants(participants);
  const partLine = parts.length ? parts.join(", ") : "non précisés";
  let body;
  if (aiAvailable()) {
    const prompt = `À partir des éléments ci-dessous, rédige un COMPTE RENDU DE RÉUNION complet, clair et bien mis en page, en français, style CR professionnel Armonie. Sois fidèle aux éléments, n'invente rien, attribue chaque sujet à la bonne personne, et ne perds aucun sujet.

STRUCTURE ATTENDUE :
- <h2>Synthèse générale</h2> : un paragraphe de synthèse, suivi d'un <div class="indic"> qui met en avant LE point marquant (un départ, un risque, une échéance clé).
- Puis UNE SECTION <h2> NUMÉROTÉE PAR SUJET (ex. <h2>1. Continuité opérationnelle</h2>). Si un sujet porte un numéro de ticket : <h2>4. <span class="tk">Ticket 792</span> — Libellé</h2>. À l'intérieur : des <h3> si utile, des <p>, des listes <ul><li>, les personnes en <span class="who">Nom</span>, et le statut en <span class="pill done|prog|todo|block">…</span> (done=résolu/clôturé, prog=en cours, todo=à faire/en attente, block=bloqué).
- Si plusieurs solutions/options sont évoquées : <div class="opt"><div class="ot">Option 1</div>texte de l'option</div> (une boîte par option).
- <h2>Plan d'actions</h2> : un <table class="data"> avec les colonnes Action / Responsable / Échéance (responsables en <span class="who">).
- <h2>Conclusion</h2> : 2 à 3 phrases.

ÉLÉMENTS :
Titre : ${titre || "Réunion"}
Participants : ${partLine}
${notes ? "Notes / résumé :\n" + notes + "\n" : ""}${transcript ? "Transcription / notes de séance :\n" + transcript.slice(0, 12000) : ""}
${images.length ? "Des images (tableau blanc / slides) sont jointes : intègre ce qu'elles montrent." : ""}
Réponds UNIQUEMENT par le fragment HTML (pas de <html>/<head>/<body>).`;
    body = await callClaude(STYLE, prompt, images, 4000);
  } else {
    body = templateMeeting({ titre, participants, notes, transcript });
  }
  const html = buildDoc({
    kicker: "Compte rendu de réunion",
    title: titre || "Compte rendu de réunion",
    subtitle: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
    cartouche: [["Objet", esc(titre || "Réunion")], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Participants", esc(partLine === "non précisés" ? "—" : partLine)], ["Date", new Date().toLocaleDateString("fr-FR")]],
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
      contexte = await callClaude(STYLE, prompt);
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
        agenda = await callClaude(STYLE, prompt);
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
