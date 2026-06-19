import React, { useState } from "react";

// Collecte AUTOMATIQUE des photos de l'équipe (déposées dans web/src/team/).
// Inliné ici volontairement : le build ne dépend plus d'un fichier photos.js
// séparé (qui pouvait manquer à l'upload). Si le dossier est vide ou absent,
// import.meta.glob renvoie {} et l'avatar retombe sur les initiales — rien ne casse.
const _mods = import.meta.glob("../team/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}", {
  eager: true, query: "?url", import: "default",
});
const PHOTOS = {};
for (const _p in _mods) {
  const _base = _p.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
  PHOTOS[_base] = _mods[_p];
}

// Nom -> clé de fichier (minuscules, sans accents, tirets). Doit matcher le nom du fichier photo.
export function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0][0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

// Couleur stable dérivée du nom (mêmes initiales = même couleur à chaque fois).
function hue(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({ name, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const url = PHOTOS[slugify(name)];
  const base = { width: size, height: size, borderRadius: "50%", flex: "0 0 auto", objectFit: "cover" };

  if (url && !broken) {
    return <img className="avatar" src={url} alt={name} title={name} loading="lazy" style={base} onError={() => setBroken(true)} />;
  }
  const h = hue(name);
  return (
    <span
      className="avatar avatar-ini"
      title={name}
      style={{ ...base, display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: Math.round(size * 0.36), background: `hsl(${h} 50% 90%)`, color: `hsl(${h} 45% 34%)` }}
    >
      {initials(name)}
    </span>
  );
}
