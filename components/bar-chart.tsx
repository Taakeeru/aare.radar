import { niceScale } from "@/lib/radar-view";

export type ChartBar = {
  key: string;
  value: number;
  /** Written under the bar; empty = no label for this bar. */
  label: string;
  /** For the screen-reader table. */
  description: string;
  /** An edge period that is not complete: drawn as an outline. */
  partial?: boolean;
};

/**
 * Vertical bars from zero, one axis, labelled axes, numbers written out (above
 * every bar when `showValues`, otherwise in the screen-reader table and in the
 * text next to the chart). Plain HTML and CSS: it scales with the page, so the
 * text stays readable at phone width. The colours come from the CSS tokens.
 */
export function BarChart({
  bars,
  yTitle,
  xTitle,
  caption,
  showValues,
  format,
}: {
  bars: ChartBar[];
  yTitle: string;
  xTitle: string;
  caption: string;
  showValues?: boolean;
  format: (n: number) => string;
}) {
  const scale = niceScale(Math.max(0, ...bars.map((b) => b.value)));
  const cols = { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` };
  return (
    <figure className="chart">
      <figcaption className="chart__ytitle">{yTitle}</figcaption>
      <div className="chart__frame" aria-hidden="true">
        <div className="chart__y">
          {scale.ticks.map((tk) => (
            <span key={tk} style={{ bottom: `${(tk / scale.max) * 100}%` }}>
              {format(tk)}
            </span>
          ))}
        </div>
        <div className="chart__plot">
          {scale.ticks.map((tk) => (
            <div key={tk} className="chart__grid" style={{ bottom: `${(tk / scale.max) * 100}%` }} />
          ))}
          <div className="chart__bars" style={cols}>
            {bars.map((b) => (
              <div key={b.key} className="chart__col">
                {showValues ? <span className="chart__val">{format(b.value)}</span> : null}
                <div className={b.partial ? "chart__bar chart__bar--partial" : "chart__bar"} style={{ height: `${(b.value / scale.max) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="chart__x" aria-hidden="true">
        <div className="chart__xlabels" style={cols}>
          {bars.map((b) => (
            <span key={b.key} className="chart__xl">
              <span>{b.label}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="chart__xtitle">{xTitle}</p>
      <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{xTitle}</th>
            <th scope="col">{yTitle}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.description}</th>
              <td>{format(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
