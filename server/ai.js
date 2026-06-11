// ai.js — rédaction assistée. Utilise l'API Claude si ANTHROPIC_API_KEY est défini,
// sinon des gabarits structurés (l'outil reste utilisable sans clé).
import { buildDoc } from "./docgen.js";
import { CATEGORY_LABEL, RESTE_CATS, ACTIVE_CATS, DONE_CATS } from "./config.js";

const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

export function aiAvailable() { return Boolean(KEY); }

// Appel générique. `images` = [{media_type, dataBase64}]. Renvoie du texte.
async function callClaude(system, userText, images = []) {
  const content = [];
  for (const im of images) content.push({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.dataBase64 } });
  content.push({ type: "text", text: userText });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`API Claude ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

const STYLE = `Tu es l'assistant d'un chef de projet senior d'Armonie Group (centre de services IBM i).
Tu rédiges en français, ton professionnel, clair, concis et rigoureux — comme un compte rendu Armonie.
Tu renvoies UNIQUEMENT un fragment HTML (pas de <html>, <head> ni <body>), en utilisant
seulement <h2>, <h3>, <p>, <ul><li>, et <table class="data"> avec <th>/<td>. Pas de style inline.`;

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

function templateDaily(dossier, issues, analyseHtml = "") {
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
    <h3>Terminés aujourd'hui (${doneToday.length})</h3>${doneToday.length ? catList(doneToday) : "<p>Aucun ticket passé en « Terminé » aujourd'hui.</p>"}
    <h3>En cours / en traitement (${enCoursToday.length})</h3>${enCoursToday.length ? catList(enCoursToday, { showStatus: true }) : "<p>Aucun ticket travaillé aujourd'hui.</p>"}
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
      const liste = dayDone.slice(0, 25).map((i) => `- ${i.cle} : ${i.resume}${i.dev && i.dev !== "Non assigné" ? " [" + i.dev + "]" : ""}`).join("\n");
      const prompt = `Tu es un chef de projet senior. Rédige une ANALYSE de la journée pour le dossier "${dossier}", ` +
        `en 3 à 5 phrases, claire, précise et pertinente : ce qui a été accompli, les points saillants, ` +
        `un éventuel point d'attention. Reste factuel, ne réinvente pas de chiffres.\n` +
        `Données réelles : ${dayDone.length} ticket(s) terminé(s) aujourd'hui, ${dayActive.length} en cours dans la journée, ` +
        `${recA} en attente de recette Armonie. Réparti par personne : ${topWho || "—"}.\n` +
        `Tickets terminés aujourd'hui :\n${liste || "(aucun)"}\n` +
        `Réponds UNIQUEMENT par un ou deux paragraphes HTML <p>…</p>, sans titre.`;
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

  const body = templateDaily(dossier, issues, analyseHtml);

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


// ---------- Brief de réunion matinale (état des lieux) ----------
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
  // Repli sans clé IA : une phrase simple à partir des infos disponibles.
  if (ticket.descriptionText) {
    return `En clair : ${ticket.resume}. ${ticket.descriptionText.slice(0, 220).trim()}…`;
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
  for (const dossier of dossiers) {
    const issues = byDossier[dossier];
    const g = buckets(issues);
    totalAll += issues.length; doneAll += g["Terminé"].length;
    body += `<h2>${esc(dossier)}</h2>` + kpiRow(g, issues.length) +
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
function templateMeeting({ titre, participants, notes, transcript }) {
  const corps = [notes, transcript].filter(Boolean).join("\n");
  return `<h2>Objet</h2><p>${esc(titre || "Réunion")}</p>
    <h2>Participants</h2><p>${esc(participants || "—")}</p>
    <h2>Points abordés</h2>${notes ? `<p>${esc(notes).replace(/\n/g, "<br>")}</p>` : "<p>—</p>"}
    ${transcript ? `<h2>Transcription (brut)</h2><p>${esc(transcript).slice(0, 4000).replace(/\n/g, "<br>")}</p>` : ""}
    <h2>Décisions</h2><ul><li>À compléter.</li></ul>
    <h2>Actions</h2><table class="data"><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr><tr><td>À compléter</td><td>—</td><td>—</td></tr></table>`;
}

export async function meetingReport({ titre, participants, notes, transcript, images = [] }) {
  let body;
  if (aiAvailable()) {
    const prompt = `Rédige un compte rendu de réunion structuré à partir des éléments suivants.
Titre : ${titre || "Réunion"}
Participants : ${participants || "non précisés"}
Notes du chef de projet :\n${notes || "(aucune)"}
${transcript ? "Transcription audio :\n" + transcript.slice(0, 8000) : ""}
${images.length ? "Des images (tableau blanc / slides) sont jointes : intègre ce qu'elles montrent." : ""}
Sections attendues : Objet, Participants, Points abordés, Décisions (numérotées D1, D2…), Actions (table : Action / Responsable / Échéance), Prochaines étapes.`;
    body = await callClaude(STYLE, prompt, images);
  } else {
    body = templateMeeting({ titre, participants, notes, transcript });
  }
  const html = buildDoc({
    kicker: "Compte rendu de réunion",
    title: titre || "Compte rendu de réunion",
    subtitle: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
    cartouche: [["Objet", esc(titre || "Réunion")], ["Chef de projet", process.env.ME || "Nicolas Durand"], ["Participants", esc(participants || "—")], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Nicolas Durand",
  });
  return { html, generatedBy: aiAvailable() ? "Claude" : "gabarit" };
}
