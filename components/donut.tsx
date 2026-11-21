/**
 * A donut with its legend (Overview, 21.11.2026). Slices are shares of a whole that sums to 100 (the caller says of
 * what), colours from the CHART tokens in order; every slice has its label and percent written in the legend, so the
 * colour is never the only carrier.
 */
export type Slice = { key: string; label: string; value: number; tag?: string };

export function Donut({ slices, label, center, size = "normal" }: { slices: Slice[]; label: string; center: string; size?: "normal" | "large" }) {
  const total = slices.reduce((n, s) => n + s.value, 0) || 1;
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className={size === "large" ? "donut donut--large" : "donut"}>
      <svg className="donut__chart" viewBox="0 0 180 180" role="img" aria-label={label}>
        {slices.map((s, i) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={s.key}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              strokeWidth="26"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 90 90)"
              style={{ stroke: `var(--radar-chart-${Math.min(i + 1, 6)})` }}
            />
          );
          offset += len;
          return el;
        })}
        <text x="90" y="96" textAnchor="middle" className="donut__center">
          {center}
        </text>
      </svg>
      <ul className="donut__legend">
        {slices.map((s, i) => (
          <li key={s.key}>
            <span className="donut__dot" style={{ background: `var(--radar-chart-${Math.min(i + 1, 6)})` }} aria-hidden="true" />
            <span className="donut__label">{s.label}</span>
            {s.tag ? <span className="donut__tag">{s.tag}</span> : null}
            <span className="donut__pct">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
