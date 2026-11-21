import { CH_OUTLINE, project } from "@/lib/volunteers-mockup";

/** Approximate centre of each canton (lat, lon), for the bubbles of «Where the jobs are» (21.11.2026). */
const CENTRE: Record<string, [number, number]> = {
  ZH: [47.41, 8.65], BE: [46.82, 7.62], LU: [47.07, 8.11], UR: [46.77, 8.63], SZ: [47.06, 8.75], OW: [46.85, 8.25],
  NW: [46.93, 8.4], GL: [46.98, 9.07], ZG: [47.16, 8.54], FR: [46.68, 7.08], SO: [47.3, 7.64], BS: [47.56, 7.6],
  BL: [47.45, 7.72], SH: [47.71, 8.6], AR: [47.37, 9.3], AI: [47.32, 9.42], SG: [47.23, 9.25], GR: [46.66, 9.63],
  AG: [47.41, 8.15], TG: [47.57, 9.1], TI: [46.3, 8.8], VD: [46.57, 6.55], VS: [46.21, 7.6], NE: [46.99, 6.8],
  GE: [46.21, 6.12], JU: [47.35, 7.15],
};

/**
 * Map of Switzerland with one bubble per canton, its area proportional to the ads (Isabella, 21.11.2026: «put a map
 * of Switzerland»). The five largest are labelled with their count; the list below the map gives every number in words.
 */
export function CantonMap({ cantons, label, name }: { cantons: { canton: string; count: number }[]; label: string; name: (code: string) => string }) {
  const W = 640;
  const H = 420;
  const max = Math.max(1, ...cantons.map((c) => c.count));
  const outline = CH_OUTLINE.map(([lon, lat]) => project(lon, lat, W, H).join(",")).join(" ");
  const top = new Set(cantons.slice(0, 5).map((c) => c.canton));
  const shown = cantons.filter((c) => CENTRE[c.canton]).sort((a, b) => b.count - a.count);
  return (
    <svg className="cmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polygon className="vol__land" points={outline} />
      {[...shown].reverse().map((c) => {
        const [lat, lon] = CENTRE[c.canton]!;
        const [x, y] = project(lon, lat, W, H);
        const r = 5 + 28 * Math.sqrt(c.count / max);
        return (
          <g key={c.canton} className="cmap__bubble">
            <circle cx={x} cy={y} r={r}>
              <title>{`${name(c.canton)}: ${c.count}`}</title>
            </circle>
            {top.has(c.canton) ? (
              <>
                <text x={x} y={y + 4} textAnchor="middle" className="cmap__n">
                  {c.count}
                </text>
                <text x={x} y={y - r - 5} textAnchor="middle" className="cmap__name">
                  {name(c.canton)}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
