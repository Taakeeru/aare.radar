/**
 * Pure helpers between the data (lib/radar.ts) and the pages: plain-language
 * numbers, dates, chart scales, the choice of the sector series. No React here,
 * so every rule is unit-tested (lib/__tests__/radar-view.test.ts).
 */
import type { Radar, RadarRole, SectorPoint } from "@/lib/radar";
import { LOCALE_TAGS, type Locale } from "@/i18n/routing";

/** "23 of 100": the share as a whole number out of 100. */
export function outOf100(share: number): number {
  return Math.min(100, Math.max(0, Math.round(share * 100)));
}

/** "4 of 10": the share as a whole number out of 10, for the plain sentences. */
export function outOf10(share: number): number {
  return Math.min(10, Math.max(0, Math.round(share * 10)));
}

export type HurdleLevel = "low" | "medium" | "high";

/** How hard a barrier is for newcomers, by how many ads ask for it. Always shown with a word. */
export function hurdleLevel(share: number): HurdleLevel {
  const n = outOf100(share);
  if (n < 20) return "low";
  if (n < 45) return "medium";
  return "high";
}

export function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "20.11.2026" (de) or "20 Nov 2026" (en). Date-only values are read as UTC so no time zone moves them. */
export function formatDate(iso: string | null | undefined, locale: Locale): string {
  const d = dateOnly(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
}

/** A timestamp in Swiss time: "20.11.2026, 20:37". */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" }).format(new Date(iso));
}

export function formatInt(n: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(Math.round(n));
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Monday and Sunday (YYYY-MM-DD) of an ISO week "2026-W47". */
export function isoWeekRange(week: string): { monday: string; sunday: string } {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`not an ISO week: ${week}`);
  const year = Number(m[1]);
  const w = Number(m[2]);
  // Jan 4th is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() + ((w - 1) * 7 - (jan4Day - 1)) * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { monday: f(monday), sunday: f(sunday) };
}

/** ISO week label ("KW 47" is built by the page): the number only. */
export function weekNumber(week: string): number {
  return Number(week.slice(-2));
}

export type WeekPoint = { week: string; newAds: number; partial: boolean };

/**
 * The weekly points with the two edges marked. The collector counts by
 * publication date from (today - window) to today, so the first week starts
 * before the window and the last week has not ended yet unless the export ran
 * on a Sunday.
 */
export function weeklyPoints(role: Pick<RadarRole, "weekly">, generatedAt: string, windowDays: number): WeekPoint[] {
  const today = dateOnly(generatedAt);
  if (!today || role.weekly.length === 0) return role.weekly.map((w) => ({ week: w.week, newAds: w.new_ads, partial: false }));
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - windowDays * 86400000).toISOString().slice(0, 10);
  const first = role.weekly[0]!.week;
  const last = role.weekly[role.weekly.length - 1]!.week;
  return role.weekly.map((w) => ({
    week: w.week,
    newAds: w.new_ads,
    partial: (w.week === first && isoWeekRange(w.week).monday < start) || (w.week === last && isoWeekRange(w.week).sunday > today),
  }));
}

/** Average new ads per week over the last `n` complete weeks and the `n` before them; null when there are too few. */
export function recentVersusBefore(points: WeekPoint[], n = 3): { recent: number; before: number } | null {
  const complete = points.filter((p) => !p.partial);
  if (complete.length < n * 2) return null;
  const avg = (xs: WeekPoint[]) => xs.reduce((s, p) => s + p.newAds, 0) / xs.length;
  return { recent: avg(complete.slice(-n)), before: avg(complete.slice(-2 * n, -n)) };
}

/** A y-axis from 0: a "nice" maximum clearly above `max` (a little room above the tallest bar; its value label sits in the chart's top margin) and 4 equal steps. */
export function niceScale(max: number): { max: number; ticks: number[] } {
  const target = Math.max(max * 1.05, 4);
  const rough = target / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((f) => f * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  return { max: step * 4, ticks };
}

/** The series the dashboard shows: "open positions in IT services" = NOGA 62-63. Falls back to the first series. */
export function sectorSeries(sector: SectorPoint[]): { series: string; points: SectorPoint[] } | null {
  if (sector.length === 0) return null;
  const names = [...new Set(sector.map((s) => s.series))];
  const series = names.find((n) => /62-63/.test(n)) ?? names[0]!;
  const points = sector.filter((s) => s.series === series).sort((a, b) => a.period.localeCompare(b.period));
  return { series, points };
}

/** "2026Q2" -> { year: 2026, quarter: 2 } */
export function parsePeriod(period: string): { year: number; quarter: number } {
  return { year: Number(period.slice(0, 4)), quarter: Number(period.slice(5)) };
}

/** The same quarter one year earlier, when it is in the series. */
export function yearBefore(points: SectorPoint[], period: string): SectorPoint | null {
  const { year, quarter } = parsePeriod(period);
  return points.find((p) => p.period === `${year - 1}Q${quarter}`) ?? null;
}

/** Percent change from `before` to `now`, rounded to a whole number. */
export function percentChange(now: number, before: number): number {
  return before === 0 ? 0 : Math.round(((now - before) / before) * 100);
}

/** Share of all ads that sit in the top `n` cantons, as a whole number out of 100. */
export function topCantonShare(cantons: { count: number }[], n: number): number {
  const total = cantons.reduce((s, c) => s + c.count, 0);
  if (total === 0) return 0;
  return Math.round((cantons.slice(0, n).reduce((s, c) => s + c.count, 0) / total) * 100);
}

export function roleById(data: Radar, id: string | undefined): RadarRole | undefined {
  return data.roles.find((r) => r.id === id) ?? data.roles[0];
}

export const CANTON_NAMES: Record<string, string> = {
  AG: "Aargau", AI: "Appenzell Innerrhoden", AR: "Appenzell Ausserrhoden", BE: "Bern", BL: "Basel-Landschaft", BS: "Basel-Stadt",
  FR: "Freiburg", GE: "Genf", GL: "Glarus", GR: "Graubünden", JU: "Jura", LU: "Luzern", NE: "Neuenburg", NW: "Nidwalden",
  OW: "Obwalden", SG: "St. Gallen", SH: "Schaffhausen", SO: "Solothurn", SZ: "Schwyz", TG: "Thurgau", TI: "Tessin", UR: "Uri",
  VD: "Waadt", VS: "Wallis", ZG: "Zug", ZH: "Zürich",
};
export const CANTON_NAMES_EN: Record<string, string> = {
  FR: "Fribourg", GE: "Geneva", GR: "Grisons", NE: "Neuchâtel", TI: "Ticino", VD: "Vaud", VS: "Valais", LU: "Lucerne", ZH: "Zurich", BS: "Basel-City", BL: "Basel-Country",
  SO: "Solothurn", AG: "Aargau", BE: "Bern", SG: "St. Gallen", TG: "Thurgau", ZG: "Zug", SZ: "Schwyz", UR: "Uri", NW: "Nidwalden", OW: "Obwalden", GL: "Glarus",
  SH: "Schaffhausen", AI: "Appenzell Innerrhoden", AR: "Appenzell Ausserrhoden", JU: "Jura",
};

export function cantonName(code: string, locale: Locale): string {
  const table = locale === "en" ? CANTON_NAMES_EN : CANTON_NAMES;
  return table[code] ?? code;
}

/** Only http(s) addresses from the data file become links (a javascript: address in the file never reaches an href). */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Age in whole days of an ISO timestamp or date, relative to `now`. */
export function ageInDays(iso: string | null | undefined, now: number = Date.now()): number | null {
  const d = dateOnly(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((now - Date.parse(`${d}T00:00:00Z`)) / 86400000));
}

export type Freshness = "fresh" | "aging" | "old" | "unknown";

/** Up to 2 days old: fresh; up to 7: older; beyond: outdated. */
export function freshness(days: number | null): Freshness {
  if (days === null) return "unknown";
  if (days <= 2) return "fresh";
  if (days <= 7) return "aging";
  return "old";
}

/** The sources a block names: the listed ids from the export, or a bare entry when the export does not list one. */
export function pickSources(data: Radar, ids: string[]): { id: string; name: string; url: string | null; updated: string | null }[] {
  return ids.map((id) => {
    const s = data.sources.find((x) => x.id === id);
    return s ? { id, name: s.name, url: safeHttpUrl(s.url), updated: s.updated } : { id, name: id, url: null, updated: null };
  });
}


/**
 * A simple estimate for the next quarter (21.11.2026, the team asked for a forecast): the same quarter one year
 * earlier, times the change of the last four quarters against the four before. Null without two full years.
 * It is an estimate, drawn as an outline and said so in words.
 */
export function nextQuarterEstimate(points: SectorPoint[]): { period: string; value: number } | null {
  if (points.length < 8) return null;
  const last = points[points.length - 1]!;
  const { year, quarter } = parsePeriod(last.period);
  const next = quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
  const base = points.find((p) => p.period === `${next.year - 1}Q${next.quarter}`);
  if (!base) return null;
  const sum = (a: SectorPoint[]) => a.reduce((n, p) => n + p.value, 0);
  const recent = sum(points.slice(-4));
  const before = sum(points.slice(-8, -4));
  if (before <= 0) return null;
  return { period: `${next.year}Q${next.quarter}`, value: Math.round(base.value * (recent / before)) };
}
