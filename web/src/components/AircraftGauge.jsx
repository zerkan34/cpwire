import React, { useEffect, useState } from "react";

// ============================================================================
// AircraftGauge — instrument MISSION façon cockpit (ECAM Airbus).
// Aiguille + arc orange animés au montage. Piloté UNIQUEMENT par les vrais
// chiffres : pct = valides / total (computeFacts). Aucun nombre inventé.
// ============================================================================

const SIZE = 240, CX = 120, CY = 120, R = 92;
const A0 = -135, A1 = 135;            // 0 % en bas-gauche → 100 % en bas-droite (balayage 270°)

// Repère : 0° = haut, sens horaire positif.
const pt = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const arc = (r, a0, a1) => {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const angleOf = (v) => A0 + (Math.max(0, Math.min(100, v)) / 100) * (A1 - A0);
const nf = (n) => (n ?? 0).toLocaleString("fr-FR");

export default function AircraftGauge({ pct = 0, value = 0, total = 0, label = "MISSION" }) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const [live, setLive] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setLive(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const needleDeg = live ? angleOf(p) : A0;
  const dashoffset = live ? 100 - p : 100;

  const ticks = [];
  for (let v = 0; v <= 100; v += 5) {
    const major = v % 25 === 0;
    const [x0, y0] = pt(angleOf(v), R + 2);
    const [x1, y1] = pt(angleOf(v), R + 2 - (major ? 13 : 7));
    ticks.push(
      <line key={v} x1={x0.toFixed(2)} y1={y0.toFixed(2)} x2={x1.toFixed(2)} y2={y1.toFixed(2)}
        stroke={major ? "#E9EEF7" : "#3c4862"} strokeWidth={major ? 2.4 : 1.2} strokeLinecap="round" />
    );
  }
  const labels = [0, 25, 50, 75, 100].map((v) => {
    const [x, y] = pt(angleOf(v), R - 18);
    return <text key={v} x={x.toFixed(2)} y={(y + 4).toFixed(2)} className="ag-scale" textAnchor="middle">{v}</text>;
  });
  const [kx, ky] = pt(180, R + 4);

  return (
    <div className="ag-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ag-svg" role="img" aria-label={`${label} ${p}%`}>
        <defs>
          <linearGradient id="agGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF9D2E" />
            <stop offset="1" stopColor="#FFB347" />
          </linearGradient>
        </defs>

        {/* boîtier + face */}
        <circle cx={CX} cy={CY} r={R + 16} fill="#11161f" stroke="#3a4658" strokeWidth="4" />
        <circle cx={CX} cy={CY} r={R + 9} fill="#0d1622" stroke="#0a0d13" strokeWidth="2" />

        {/* piste + progression */}
        <path d={arc(R, A0, A1)} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="9" strokeLinecap="round" />
        <path d={arc(R, A0, A1)} fill="none" stroke="url(#agGrad)" strokeWidth="9" strokeLinecap="round"
          pathLength="100" strokeDasharray="100" strokeDashoffset={dashoffset} className="ag-prog" />

        {ticks}
        {labels}

        {/* aiguille (flotte dans la couronne, ne barre pas le texte) */}
        <g className="ag-needle" style={{ transform: `rotate(${needleDeg}deg)` }}>
          <line x1={CX} y1={CY - 36} x2={CX} y2={CY - (R - 4)} stroke="#FF9D2E" strokeWidth="3.4" strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r="7" fill="#1b2333" stroke="#FF9D2E" strokeWidth="2" />

        {/* bouton de réglage */}
        <circle cx={kx.toFixed(2)} cy={ky.toFixed(2)} r="7" fill="#222c3a" stroke="#46566b" strokeWidth="1.6" />

        {/* lecture centrale */}
        <text x={CX} y={CY - 26} className="ag-label" textAnchor="middle">{label}</text>
        <text x={CX} y={CY + 12} className="ag-pct" textAnchor="middle">{p}%</text>
        <text x={CX} y={CY + 40} className="ag-count" textAnchor="middle">{nf(value)} / {nf(total)}</text>
        <text x={CX} y={CY + 54} className="ag-sub" textAnchor="middle">TICKETS TRAITÉS</text>
      </svg>
    </div>
  );
}
