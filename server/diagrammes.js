// diagrammes.js — graphiques SVG pour le dossier de passation.
//
// SVG écrit à la main, sans bibliothèque : le dossier doit s'ouvrir dans dix ans
// sur n'importe quelle machine, sans réseau et sans installer quoi que ce soit.
// Une image PNG ne se relit pas, un graphique JavaScript exige un navigateur
// moderne et parfois un CDN. Le SVG est du texte, il vieillit bien.
//
// Palette : celle de la charte Armonie, importée et non recopiée.

import { ARMONIE_PALETTE as P } from "../shared/armonie-palette.js";

const ech = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SERIE = [P.navy, P.gold, P.green, P.red, P.amber, "#6A5FB0", "#2F7D9E", "#B0682F"];

/** Enveloppe commune : cadre, titre, sous-titre. */
function cadre({ w = 900, h = 340, titre = "", sous = "", corps = "" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Inter, system-ui, sans-serif">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <text x="24" y="30" font-size="15" font-weight="700" fill="${P.ink}">${ech(titre)}</text>
  ${sous ? `<text x="24" y="50" font-size="11.5" fill="${P.muted}">${ech(sous)}</text>` : ""}
  ${corps}
</svg>`;
}

/**
 * Courbes d'évolution. `series` = [{ nom, points: [{x, y}] }].
 * Les x sont des libellés (dates), les y des nombres.
 */
export function courbes({ titre, sous, series = [], w = 900, h = 340 }) {
  const utiles = series.filter((s) => (s.points || []).length >= 2);
  if (!utiles.length) return cadre({ w, h, titre, sous, corps:
    `<text x="24" y="${h / 2}" font-size="12.5" fill="${P.muted}">Pas assez d'historique pour tracer une courbe.</text>` });

  const g = { l: 56, r: 20, t: 70, b: 58 };
  const W = w - g.l - g.r, H = h - g.t - g.b;
  const labels = utiles[0].points.map((p) => p.x);
  const n = Math.max(...utiles.map((s) => s.points.length));
  const maxY = Math.max(1, ...utiles.flatMap((s) => s.points.map((p) => +p.y || 0)));
  const px = (i) => g.l + (n === 1 ? W / 2 : (i * W) / (n - 1));
  const py = (v) => g.t + H - ((+v || 0) / maxY) * H;

  // Graduations : quatre repères suffisent à lire un ordre de grandeur.
  let grille = "";
  for (let k = 0; k <= 4; k++) {
    const v = Math.round((maxY * k) / 4), y = py(v);
    grille += `<line x1="${g.l}" y1="${y}" x2="${w - g.r}" y2="${y}" stroke="${P.line}" stroke-width="1"/>`
           + `<text x="${g.l - 8}" y="${y + 4}" font-size="10" fill="${P.muted}" text-anchor="end">${v}</text>`;
  }

  // Un libellé sur k, sinon l'axe est illisible.
  const pas = Math.max(1, Math.ceil(n / 12));
  let axe = "";
  labels.forEach((lab, i) => {
    if (i % pas && i !== n - 1) return;
    axe += `<text x="${px(i)}" y="${h - g.b + 18}" font-size="9.5" fill="${P.muted}" text-anchor="middle" transform="rotate(-35 ${px(i)} ${h - g.b + 18})">${ech(lab)}</text>`;
  });

  let traces = "", legende = "";
  utiles.forEach((s, si) => {
    const c = SERIE[si % SERIE.length];
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
    traces += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    traces += s.points.map((p, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="2.4" fill="${c}"/>`).join("");
    const lx = g.l + si * 150;
    legende += `<rect x="${lx}" y="${h - 20}" width="10" height="3" fill="${c}"/>`
             + `<text x="${lx + 15}" y="${h - 15}" font-size="10.5" fill="${P.ink}">${ech(s.nom)}</text>`;
  });

  return cadre({ w, h, titre, sous, corps: grille + axe + traces + legende });
}

/** Barres horizontales, pour un classement (par client, par personne…). */
export function barres({ titre, sous, donnees = [], w = 900, unite = "" }) {
  if (!donnees.length) return cadre({ w, h: 160, titre, sous, corps:
    `<text x="24" y="90" font-size="12.5" fill="${P.muted}">Aucune donnée.</text>` });

  const lignes = donnees.slice(0, 20);
  const hL = 26, g = { l: 190, r: 70, t: 70 };
  const h = g.t + lignes.length * hL + 26;
  const W = w - g.l - g.r;
  const maxV = Math.max(1, ...lignes.map((d) => +d.valeur || 0));

  let corps = "";
  lignes.forEach((d, i) => {
    const y = g.t + i * hL;
    const lw = Math.max(2, ((+d.valeur || 0) / maxV) * W);
    corps += `<text x="${g.l - 10}" y="${y + 14}" font-size="11.5" fill="${P.ink}" text-anchor="end">${ech(String(d.nom).slice(0, 30))}</text>`
           + `<rect x="${g.l}" y="${y + 3}" width="${lw.toFixed(1)}" height="15" rx="3" fill="${d.couleur || P.navy}"/>`
           + `<text x="${g.l + lw + 8}" y="${y + 15}" font-size="11" font-weight="700" fill="${P.ink}">${d.valeur}${unite}</text>`;
  });
  return cadre({ w, h, titre, sous, corps });
}

/** Répartition en anneau, avec sa légende chiffrée. */
export function anneau({ titre, sous, parts = [], w = 900, h = 300 }) {
  const total = parts.reduce((n, p) => n + (+p.valeur || 0), 0);
  if (!total) return cadre({ w, h: 160, titre, sous, corps:
    `<text x="24" y="90" font-size="12.5" fill="${P.muted}">Aucune donnée.</text>` });

  const cx = 170, cy = 175, R = 82, r = 48;
  let a0 = -Math.PI / 2, corps = "";
  parts.forEach((p, i) => {
    const frac = (+p.valeur || 0) / total;
    if (frac <= 0) return;
    const a1 = a0 + frac * Math.PI * 2;
    const grand = frac > 0.5 ? 1 : 0;
    const pt = (a, ray) => `${(cx + ray * Math.cos(a)).toFixed(1)},${(cy + ray * Math.sin(a)).toFixed(1)}`;
    const c = p.couleur || SERIE[i % SERIE.length];
    corps += `<path d="M${pt(a0, R)} A${R},${R} 0 ${grand} 1 ${pt(a1, R)} L${pt(a1, r)} A${r},${r} 0 ${grand} 0 ${pt(a0, r)} Z" fill="${c}"/>`;
    const ly = 92 + i * 22;
    corps += `<rect x="330" y="${ly - 9}" width="11" height="11" rx="2" fill="${c}"/>`
           + `<text x="350" y="${ly}" font-size="12" fill="${P.ink}">${ech(p.nom)}</text>`
           + `<text x="640" y="${ly}" font-size="12" font-weight="700" fill="${P.ink}" text-anchor="end">${p.valeur}</text>`
           + `<text x="700" y="${ly}" font-size="11" fill="${P.muted}" text-anchor="end">${Math.round(frac * 100)} %</text>`;
    a0 = a1;
  });
  corps += `<text x="${cx}" y="${cy - 2}" font-size="22" font-weight="800" fill="${P.ink}" text-anchor="middle">${total}</text>`
         + `<text x="${cx}" y="${cy + 16}" font-size="10.5" fill="${P.muted}" text-anchor="middle">au total</text>`;
  return cadre({ w, h: Math.max(h, 92 + parts.length * 22 + 30), titre, sous, corps });
}

/** Frise des échéances à venir, sur douze mois. */
export function frise({ titre, sous, jalons = [], w = 900 }) {
  if (!jalons.length) return cadre({ w, h: 150, titre, sous, corps:
    `<text x="24" y="90" font-size="12.5" fill="${P.muted}">Aucune échéance enregistrée.</text>` });

  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const fin = new Date(auj); fin.setMonth(fin.getMonth() + 12);
  const dans = jalons
    .map((j) => ({ ...j, d: new Date(j.date) }))
    .filter((j) => !isNaN(j.d) && j.d >= new Date(auj.getTime() - 60 * 86400000) && j.d <= fin)
    .sort((a, b) => a.d - b.d)
    .slice(0, 24);
  if (!dans.length) return cadre({ w, h: 150, titre, sous, corps:
    `<text x="24" y="90" font-size="12.5" fill="${P.muted}">Aucune échéance dans les douze mois.</text>` });

  const g = { l: 40, r: 40, t: 96 };
  const h = g.t + dans.length * 22 + 30, W = w - g.l - g.r;
  const debut = new Date(auj.getTime() - 60 * 86400000);
  const x = (d) => g.l + ((d - debut) / (fin - debut)) * W;

  let corps = `<line x1="${g.l}" y1="78" x2="${w - g.r}" y2="78" stroke="${P.line}" stroke-width="2"/>`;
  for (let m = 0; m <= 12; m += 2) {
    const d = new Date(debut); d.setMonth(d.getMonth() + m);
    corps += `<line x1="${x(d).toFixed(1)}" y1="72" x2="${x(d).toFixed(1)}" y2="84" stroke="${P.line}" stroke-width="1"/>`
           + `<text x="${x(d).toFixed(1)}" y="66" font-size="9.5" fill="${P.muted}" text-anchor="middle">${d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}</text>`;
  }
  corps += `<line x1="${x(auj).toFixed(1)}" y1="60" x2="${x(auj).toFixed(1)}" y2="${h - 20}" stroke="${P.red}" stroke-width="1.5" stroke-dasharray="4 3"/>`
         + `<text x="${x(auj).toFixed(1)}" y="56" font-size="9.5" font-weight="700" fill="${P.red}" text-anchor="middle">aujourd'hui</text>`;

  dans.forEach((j, i) => {
    const y = g.t + i * 22, cxp = x(j.d);
    const passe = j.d < auj;
    corps += `<circle cx="${cxp.toFixed(1)}" cy="${y}" r="4" fill="${passe ? P.red : P.navy}"/>`
           + `<text x="${(cxp + 9).toFixed(1)}" y="${y + 4}" font-size="11" fill="${P.ink}">${ech(String(j.label || "").slice(0, 62))}</text>`
           + `<text x="${(cxp - 9).toFixed(1)}" y="${y + 4}" font-size="9.5" fill="${P.muted}" text-anchor="end">${j.d.toLocaleDateString("fr-FR")}</text>`;
  });
  return cadre({ w, h, titre, sous, corps });
}
