/**
 * A small multi-line chart (Dashboard «Evolution of skills», 21.11.2026): one line per series, colours from the CHART
 * tokens, a legend with the latest value written out, so colour is never the only carrier.
 */
export type Line = { key: string; label: string; points: { x: string; y: number }[] };

export function LineChart({ lines, xLabels, label, format = String }: { lines: Line[]; xLabels: string[]; label: string; format?: (n: number) => string }) {
  const W = 640;
  const H = 260;
  const L = 48;
  const B = 28;
  const max = Math.max(1, ...lines.flatMap((l) => l.points.map((p) => p.y)));
  const step = xLabels.length > 1 ? (W - L - 16) / (xLabels.length - 1) : 0;
  const x = (i: number) => L + i * step;
  const y = (v: number) => 12 + (H - B - 12) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div className="linechart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="linechart__svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="linechart__grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="linechart__tick">
              {format(t)}
            </text>
          </g>
        ))}
        {xLabels.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" className="linechart__tick">
            {m}
          </text>
        ))}
        {lines.map((l, li) => (
          <g key={l.key} style={{ stroke: `var(--radar-chart-${Math.min(li + 1, 6)})`, fill: `var(--radar-chart-${Math.min(li + 1, 6)})` }}>
            <polyline className="linechart__line" points={l.points.map((p, i) => `${x(i)},${y(p.y)}`).join(" ")} />
            {l.points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.y)} r="3.5" />
            ))}
          </g>
        ))}
      </svg>
      <ul className="donut__legend linechart__legend">
        {lines.map((l, li) => (
          <li key={l.key}>
            <span className="donut__dot" style={{ background: `var(--radar-chart-${Math.min(li + 1, 6)})` }} aria-hidden="true" />
            <span className="donut__label">{l.label}</span>
            <span className="donut__pct">{format(l.points[l.points.length - 1]?.y ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
