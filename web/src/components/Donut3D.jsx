import React from "react";

// Donut3D — camembert 3D SANS couture blanche, à la charte Armonie (même géométrie
// que le CR / le skill armonie-design : flancs, ombre radiale, filet de bord).
// segs = [{ label, value, top, side, lc }]. Rendu SVG pur (aucune dépendance).

export default function Donut3D({ segs = [], scale = 1.9, caption = "", legend = true }) {
  const clean = segs.filter((s) => s.value > 0);
  const tot = clean.reduce((s, x) => s + x.value, 0) || 1;
  const rx = 62 * scale, ry = 27 * scale, depth = 22 * scale;
  const cx = rx + 6, cy = ry + 10;
  const w = rx * 2 + 12, h = ry * 2 + depth + 26;
  const P = (deg) => { const r = (deg * Math.PI) / 180; return [cx + rx * Math.cos(r), cy + ry * Math.sin(r)]; };
  let a = 0; const rng = [];
  for (const s of clean) { const sw = 360 * s.value / tot; rng.push({ a0: a, a1: a + sw, ...s }); a += sw; }

  const sides = [];
  for (const r of rng) {
    const s0 = Math.max(r.a0, 0), e0 = Math.min(r.a1, 180);
    if (e0 > s0) {
      const [x0, y0] = P(s0), [x1, y1] = P(e0); const lg = (e0 - s0) > 180 ? 1 : 0;
      sides.push(<path key={"s" + r.a0} d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A${rx} ${ry} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x1.toFixed(2)} ${(y1 + depth).toFixed(2)} A${rx} ${ry} 0 ${lg} 0 ${x0.toFixed(2)} ${(y0 + depth).toFixed(2)} Z`} fill={r.side} stroke={r.side} strokeWidth="1" />);
    }
  }
  const tops = [], labs = [];
  for (const r of rng) {
    const [x0, y0] = P(r.a0), [x1, y1] = P(r.a1); const lg = (r.a1 - r.a0) > 180 ? 1 : 0;
    tops.push(<path key={"t" + r.a0} d={`M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${rx} ${ry} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`} fill={r.top} stroke={r.top} strokeWidth="1.3" strokeLinejoin="round" />);
    const m = ((r.a0 + r.a1) / 2) * Math.PI / 180; const lx = cx + rx * 0.55 * Math.cos(m), ly = cy + ry * 0.55 * Math.sin(m);
    const pct = Math.round(r.value / tot * 100);
    if (pct >= 12) labs.push(<text key={"l" + r.a0} x={lx.toFixed(1)} y={ly.toFixed(1)} fill={r.lc} fontFamily="Poppins, sans-serif" fontWeight="800" fontSize={15 * scale} textAnchor="middle" dominantBaseline="central">{pct}%</text>);
  }
  const [rx0, ry0] = P(0), [rx1, ry1] = P(180);
  const uid = "dn" + Math.round(cx + cy + tot);

  return (
    <div className="eh-donut">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption || "Avancement"}>
        <defs>
          <radialGradient id={uid} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#15122B" stopOpacity="0.40" />
            <stop offset="48%" stopColor="#15122B" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#15122B" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={cx} cy={(cy + ry + depth + 3).toFixed(1)} rx={(rx * 1.12).toFixed(1)} ry={(9 * scale).toFixed(1)} fill={`url(#${uid})`} />
        {sides}{tops}
        <path d={`M${rx0.toFixed(2)} ${ry0.toFixed(2)} A${rx} ${ry} 0 0 1 ${rx1.toFixed(2)} ${ry1.toFixed(2)}`} fill="none" stroke="#000000" strokeOpacity="0.13" strokeWidth="0.8" />
        {labs}
      </svg>
      {caption ? <div className="eh-donut-cap">{caption}</div> : null}
      {legend ? (
        <table className="eh-leg"><tbody>
          {clean.map((s, i) => (
            <tr key={i}>
              <td className="lc"><span className="sw" style={{ background: s.top }} />{s.label}</td>
              <td className="lp">{Math.round(s.value / tot * 100)}&nbsp;%</td>
            </tr>
          ))}
        </tbody></table>
      ) : null}
    </div>
  );
}
