"use client";

import { useState } from "react";

/**
 * A donut with its legend (Dashboard, 21.11.2026). Slices are shares of a whole that sums to 100 (the caller says of
 * what), colours from the CHART tokens in order; every slice has its label and percent written in the legend, so the
 * colour is never the only carrier. Interactive (Isabella): a click on a slice or its legend row highlights it and
 * shows its number in the middle; a second click goes back to the whole.
 */
export type Slice = { key: string; label: string; value: number; tag?: string };

export function Donut({ slices, label, center, size = "normal", selected, onSelect, unit = "" }: {
  slices: Slice[];
  label: string;
  center: string;
  size?: "normal" | "large";
  selected?: string;
  onSelect?: (key: string) => void;
  unit?: string;
}) {
  const [own, setOwn] = useState("");
  const sel = selected ?? own;
  const pick = (k: string) => {
    const next = sel === k && !onSelect ? "" : k;
    if (onSelect) onSelect(next);
    else setOwn(next);
  };
  const total = slices.reduce((n, s) => n + s.value, 0) || 1;
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const chosen = slices.find((s) => s.key === sel);
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
              strokeWidth={sel === s.key ? 34 : sel ? 18 : 26}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 90 90)"
              style={{ stroke: `var(--radar-chart-${Math.min(i + 1, 6)})`, cursor: "pointer" }}
              onClick={() => pick(s.key)}
            />
          );
          offset += len;
          return el;
        })}
        <text x="90" y={chosen ? 88 : 96} textAnchor="middle" className="donut__center">
          {chosen ? `${Math.round((chosen.value / total) * 100)}%` : center}
        </text>
        {chosen ? (
          <text x="90" y="108" textAnchor="middle" className="donut__sub">
            {chosen.label.length > 14 ? `${chosen.label.slice(0, 13)}…` : chosen.label}
          </text>
        ) : null}
      </svg>
      <ul className="donut__legend">
        {slices.map((s, i) => (
          <li key={s.key}>
            <button type="button" className="donut__row" aria-pressed={sel === s.key} onClick={() => pick(s.key)}>
              <span className="donut__dot" style={{ background: `var(--radar-chart-${Math.min(i + 1, 6)})` }} aria-hidden="true" />
              <span className="donut__label">{s.label}</span>
              {s.tag ? <span className="donut__tag">{s.tag}</span> : null}
              <span className="donut__pct">
                {Math.round((s.value / total) * 100)}%{sel === s.key && unit ? ` · ${s.value} ${unit}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
