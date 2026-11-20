/**
 * Question D (target group): the figures the page shows, read from the export's
 * `series.D` blocks (collector/export.py). Pure functions, no I/O.
 *
 * SEM labels are "Status X: <measure> / <area>"; "Switzerland" is the whole
 * country. Only aggregate numbers exist in the file, never a single person.
 */
import type { Radar, SeriesBlock, SeriesPoint } from "@/lib/radar";

export const STATUSES = ["S", "F", "B", "N"] as const;
export type Status = (typeof STATUSES)[number];

export type StatusFigure = {
  status: Status;
  source: string;
  period: string;
  persons: number;
  workingAge: number | null;
  inWork: number | null;
  /** 0..1, employed among the 18-64 year olds. */
  employmentRate: number | null;
};

export type CantonFigure = { canton: string; persons: number };

function last(points: SeriesPoint[]): SeriesPoint | null {
  return points.length ? points[points.length - 1]! : null;
}

function find(block: SeriesBlock, label: string): SeriesPoint | null {
  const s = block.series.find((x) => x.label === label);
  return s ? last(s.points) : null;
}

export function blocksFor(data: Radar, question: string): SeriesBlock[] {
  return data.series?.[question] ?? [];
}

/** Persons, working age, in work and the employment rate per status, latest month. */
export function statusFigures(data: Radar): StatusFigure[] {
  const out: StatusFigure[] = [];
  for (const status of STATUSES) {
    const block = blocksFor(data, "D").find((b) => b.source === `sem_erwerb_status_${status.toLowerCase()}`);
    if (!block) continue;
    const persons = find(block, `Status ${status}: persons / Switzerland`);
    if (!persons) continue;
    const rate = find(block, `Status ${status}: employment rate (18-64) / Switzerland`);
    out.push({
      status,
      source: block.source,
      period: persons.period,
      persons: persons.value,
      workingAge: find(block, `Status ${status}: working age (18-64) / Switzerland`)?.value ?? null,
      inWork: find(block, `Status ${status}: in work (18-64) / Switzerland`)?.value ?? null,
      employmentRate: rate && rate.period === persons.period ? rate.value : null,
    });
  }
  return out;
}

const CANTON_PREFIX = "Asylum process total: persons / ";

/** People in the asylum process (N, S, F) per canton, latest month, largest first. */
export function cantonFigures(data: Radar, limit = 8): { period: string | null; rows: CantonFigure[] } {
  const block = blocksFor(data, "D").find((b) => b.source === "sem_asylprozess");
  if (!block) return { period: null, rows: [] };
  let period: string | null = null;
  const rows: CantonFigure[] = [];
  for (const s of block.series) {
    if (!s.label.startsWith(CANTON_PREFIX) || s.dimension !== "Canton") continue;
    const p = last(s.points);
    if (!p) continue;
    if (period === null || p.period > period) period = p.period;
    rows.push({ canton: s.label.slice(CANTON_PREFIX.length), persons: p.value });
  }
  rows.sort((a, b) => b.persons - a.persons || a.canton.localeCompare(b.canton));
  return { period, rows: rows.slice(0, limit) };
}

/** "2026-10" -> "Oktober 2026" / "October 2026". */
export function formatMonth(period: string, localeTag: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return new Intl.DateTimeFormat(localeTag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}
