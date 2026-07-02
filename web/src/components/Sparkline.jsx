import React from "react";

// Sparkline — micro-courbe d'une série de nombres. Couleur selon la direction.
export default function Sparkline({ data = [], dir = "flat", w = 96, h = 28 }) {
  const pts = (data || []).filter((v) => typeof v === "number");
  const col = dir === "up" ? "#2F7D4F" : dir === "down" ? "#b23b46" : "#8b8698";
  if (pts.length < 2) return <svg width={w} height={h} className="spark" aria-hidden="true"><line x1="2" y1={h - 4} x2={w - 2} y2={h - 4} stroke="#d9d5e6" strokeWidth="1.5" strokeDasharray="2 3" /></svg>;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const dx = (w - 6) / (pts.length - 1);
  const xy = pts.map((v, i) => [3 + i * dx, h - 4 - ((v - min) / span) * (h - 8)]);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${h - 2} L${xy[0][0].toFixed(1)} ${h - 2} Z`;
  const gid = "sg" + Math.round(w + h + pts.length + pts[0]);
  return (
    <svg width={w} height={h} className="spark" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.22" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.4" fill={col} />
    </svg>
  );
}
