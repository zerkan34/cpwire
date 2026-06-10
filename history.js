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

function templateDaily(dossier, issues) {
  const inCat = (c) => issues.filter((i) => i.categorie === c);
  const inCats = (cs) => issues.filter((i) => cs.includes(i.categorie));
  const n = (c) => inCat(c).length;

  const reste = inCats(RESTE_CATS).length;
  const recArmonie = n("recetteArmonie");
  const recClient = n("recetteClient");
  const attClient = n("attenteClient");
  const enProd = n("miseEnProd");
  const termineTot = n("termine");

  const termineToday = inCat("termine").filter((i) => isToday(i.maj));
  const prodToday = inCat("miseEnProd").filter((i) => isToday(i.maj));
  const enCours = inCats(ACTIVE_CATS).sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));

  // Activité du jour par personne : tickets touchés aujourd'hui (terminés / en cours).
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
    ? `<h2>Activité du jour par personne</h2>
       <table class="data"><tr><th>Personne</th><th>Terminés</th><th>En cours</th><th>Total du jour</th></tr>` +
      personnes.map((p) => `<tr><td><span class="who">${esc(p.dev)}</span></td><td>${p.faits}</td><td>${p.encours}</td><td><b>${p.total}</b></td></tr>`).join("") +
      `</table>`
    : `<h2>Activité du jour par personne</h2><p>Aucun ticket mis à jour aujourd'hui.</p>`;

  // Ligne de synthèse chiffrée
  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="v">${reste}</div><div class="l">Reste à faire</div></div>
    <div class="kpi"><div class="v">${recArmonie}</div><div class="l">Attente recette</div></div>
    <div class="kpi"><div class="v">${recClient}</div><div class="l">Recette client</div></div>
    <div class="kpi"><div class="v">${enProd}</div><div class="l">Mises en prod</div></div>
    <div class="kpi"><div class="v">${termineTot}</div><div class="l">Terminés</div></div>
  </div>`;

  const ligne = `<p><b>En une ligne :</b> ${reste} à faire · ${recArmonie} en attente de recette (Armonie) · ` +
    `${recClient} en attente de recette client · ${attClient} en attente client · ${enProd} en mise en production` +
    `${prodToday.length ? ` (dont ${prodToday.length} aujourd'hui)` : ""}.</p>`;

  const termineBloc = termineToday.length
    ? `<h2>Terminés aujourd'hui (${termineToday.length})</h2>${catList(termineToday)}`
    : `<h2>Terminés aujourd'hui</h2><p>Aucun ticket passé en « Terminé » aujourd'hui.</p>`;

  const prodBloc = prodToday.length
    ? `<h2>Mises en production aujourd'hui (${prodToday.length})</h2>${catList(prodToday)}`
    : "";

  return kpis +
    `<h2>Synthèse de la journée</h2><p>Dossier <b>${esc(dossier)}</b>.</p>${ligne}` +
    tablePersonnes +
    termineBloc +
    prodBloc +
    `<h2>En cours (${enCours.length})</h2>${catList(enCours, { showStatus: true })}` +
    `<h2>En attente de recette — Armonie (${recArmonie})</h2>${catList(inCat("recetteArmonie"))}` +
    `<h2>En attente de recette — client (${recClient})</h2>${catList(inCat("recetteClient"))}` +
    (attClient ? `<h2>En attente client (${attClient})</h2>${catList(inCat("attenteClient"))}` : "");
}

export async function dailyReport(dossier, issues) {
  // Le corps (chiffres + listes) est TOUJOURS calculé de façon déterministe :
  // les nombres sont donc exacts. L'IA n'ajoute (si dispo) qu'une intro rédigée.
  const body = templateDaily(dossier, issues);

  let intro = "";
  if (aiAvailable()) {
    const isToday = (iso) => { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); };
    const reste = issues.filter((i) => RESTE_CATS.includes(i.categorie)).length;
    const recA = issues.filter((i) => i.categorie === "recetteArmonie").length;
    const recC = issues.filter((i) => i.categorie === "recetteClient").length;
    const prod = issues.filter((i) => i.categorie === "miseEnProd").length;
    const finisJour = issues.filter((i) => i.categorie === "termine" && isToday(i.maj)).length;
    try {
      const prompt = `Rédige UNIQUEMENT un court paragraphe d'introduction (2 à 3 phrases, balise <p>) ` +
        `pour le compte rendu journalier du dossier "${dossier}". Données réelles à refléter fidèlement, ` +
        `sans inventer de chiffres : ${finisJour} ticket(s) terminé(s) aujourd'hui, ${reste} restant(s) à faire, ` +
        `${recA} en attente de recette Armonie, ${recC} en attente de recette client, ${prod} en mise en production. ` +
        `Ton professionnel, factuel. Ne renvoie que le <p>…</p>.`;
      intro = await callClaude(STYLE, prompt);
    } catch { intro = ""; }
  }

  const html = buildDoc({
    kicker: "Compte rendu journalier",
    title: `Journée du ${new Date().toLocaleDateString("fr-FR")}`,
    subtitle: `Dossier ${dossier} · activité consolidée`,
    cartouche: [["Client / dossier", dossier], ["Type", "CR journalier"], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: intro + body,
    etabliPar: process.env.ME || "Chef de projet",
  });
  return { html, generatedBy: aiAvailable() ? "Claude + données" : "données" };
}


// ---------- Brief de réunion matinale (état des lieux) ----------
// Reprend la charge active : À FAIRE + EN COURS + RETOUR TEST + RETOUR PRODUCTION.
export async function morningReport(dossier, issues) {
  const active = issues.filter((i) => RESTE_CATS.includes(i.categorie));

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

  const kpis = `<div class="kpi-row">
    <div class="kpi"><div class="v">${active.length}</div><div class="l">À traiter</div></div>
    <div class="kpi"><div class="v">${active.filter((i) => i.categorie === "encours").length}</div><div class="l">En cours</div></div>
    <div class="kpi"><div class="v">${active.filter((i) => i.categorie === "retourTest").length}</div><div class="l">Retour test</div></div>
    <div class="kpi"><div class="v">${active.filter((i) => i.categorie === "retourProd").length}</div><div class="l">Retour prod</div></div>
    <div class="kpi"><div class="v">${active.filter((i) => i.categorie === "afaire").length}</div><div class="l">À faire</div></div>
  </div>`;

  const body = kpis +
    `<h2>Synthèse</h2><p>État des lieux pour la réunion du matin — dossier <b>${esc(dossier)}</b> : ` +
    `${active.length} ticket(s) actif(s) à passer en revue.</p>` +
    charge +
    sec("encours", "En cours") +
    sec("retourTest", "Retour test") +
    sec("retourProd", "Retour production") +
    sec("afaire", "À faire");

  const html = buildDoc({
    kicker: "Brief de réunion matinale",
    title: `Réunion du ${new Date().toLocaleDateString("fr-FR")}`,
    subtitle: `Dossier ${dossier} · état des lieux (charge active)`,
    cartouche: [["Client / dossier", dossier], ["Type", "Brief matinal"], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Chef de projet",
  });
  return { html, generatedBy: "données" };
}


export async function explainTicket(ticket) {
  if (aiAvailable()) {
    const prompt = `Explique ce ticket Jira en français très simple, pour un chef de projet NON technique.
Titre : ${ticket.resume}
${ticket.descriptionText ? "Description :\n" + ticket.descriptionText : ""}
Statut : ${ticket.statut}
En 2 à 4 phrases courtes : de quoi il s'agit concrètement, et ce que ça change pour le client. Pas de jargon. Réponds en texte simple.`;
    return await callClaude(
      "Tu traduis des tickets techniques en explications claires pour une personne non technique. Français, simple, concret, sans jargon.",
      prompt
    );
  }
  // Repli sans clé : on renvoie au moins la description nettoyée.
  return ticket.descriptionText
    ? `Résumé : ${ticket.resume}. Détail indiqué dans le ticket : ${ticket.descriptionText.slice(0, 400)}`
    : `Ce ticket concerne : ${ticket.resume}. (Ajoute une clé IA pour une explication détaillée en langage clair.)`;
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
    cartouche: [["Type", "Rapport global"], ["Clients", dossiers.join(", ")], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: intro + body,
    etabliPar: process.env.ME || "Chef de projet",
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
    cartouche: [["Objet", esc(titre || "Réunion")], ["Participants", esc(participants || "—")], ["Date", new Date().toLocaleDateString("fr-FR")]],
    bodyHtml: body,
    etabliPar: process.env.ME || "Chef de projet",
  });
  return { html, generatedBy: aiAvailable() ? "Claude" : "gabarit" };
}
