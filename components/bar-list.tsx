export type BarRow = {
  key: string;
  label: string;
  /** 0 to 1, the length of the bar. */
  fraction: number;
  /** The number, in words ("in 23 von 100 Inseraten"). */
  value: string;
  /** Colour of the bar: the data colour, or a meaning that is ALSO written in `tag`. */
  tone?: "link" | "healthy" | "warning" | "critical";
  tag?: string;
  /** A sentence under the label (the plain-language barrier sentence). */
  sentence?: string;
};

/** A ranked list of horizontal bars. Every bar has its number written out next to it. */
export function BarList({ rows, label }: { rows: BarRow[]; label: string }) {
  return (
    <ol className={rows.some((r) => r.sentence) ? "rank rank--stacked" : "rank"} aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="rank__row">
          <div className="rank__top">
            <span className="rank__name">{r.sentence ?? r.label}</span>
            <span className="rank__value">{r.value}</span>
          </div>
          <div className="rank__bar">
            <div className="rank__track" aria-hidden="true">
              <div className={`rank__fill rank__fill--${r.tone ?? "link"}`} style={{ width: `${Math.max(1, Math.min(100, r.fraction * 100))}%` }} />
            </div>
            {r.tag ? (
              <span className={`tag tag--${r.tone ?? "link"}`}>
                <span className="tag__dot" aria-hidden="true" />
                {r.tag}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
