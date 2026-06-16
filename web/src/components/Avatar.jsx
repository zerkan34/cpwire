import React, { useState } from "react";
import { PHOTOS } from "../team/photos.js";

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
