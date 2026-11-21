/**
 * The dashboard's data: ONE JSON file, written by `python3 -m collector.export`
 * (collector/export.py documents the contract; keep the types below in step with it).
 *
 * The app never runs Python and never reads the collector's SQLite file. The file
 * is read on the server only: its path comes from the environment variable
 * RADAR_DATA (default fixtures/radar.sample.json, relative to the working
 * directory) and the parsed result is cached for 10 minutes.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type RadarSource = { id: string; name: string; url: string; what: string; updated: string | null };
export type WeeklyPoint = { week: string; new_ads: number };
/** One calendar month of publications (export field `monthly`); `partial` marks the current, unfinished month. */
export type MonthlyPoint = { month: string; new_ads: number; partial: boolean };
/** The whole IT market (export field `market`): distinct ads in the window, monthly history, roles by ads. */
export type Market = { ads: number; monthly: MonthlyPoint[]; roles: { id: string; ads: number }[] };
export type SkillShare = { skill: string; count: number; share: number };
/** One month of one skill (export field `skills_monthly`); `partial` marks the current, unfinished month. */
export type SkillMonthPoint = { month: string; count: number; share: number; partial: boolean };
export type SkillSeries = { skill: string; points: SkillMonthPoint[] };
export type CantonCount = { canton: string; count: number };
export type ExampleAd = { title: string; company: string | null; city: string | null; published: string | null; url: string };
export type CompanyCount = { company: string; ads: number };
export type RoleBarriers = {
  german_required: number;
  french_required: number;
  degree_required: number;
  senior_experience: number;
  english_ok: number;
};
export type RadarRole = {
  id: string;
  label: string;
  ads: number;
  weekly: WeeklyPoint[];
  /** Optional: the role's ads by published month over the whole history, at most 24 months, oldest first. */
  monthly?: MonthlyPoint[];
  skills: SkillShare[];
  /** Optional: number of the role's full-text ads in the window that say entry level (basis of entry_skills). */
  entry_ads?: number;
  /** Optional: like skills, counted only over the entry-level ads, top 15. */
  entry_skills?: SkillShare[];
  /** Optional: month by month history of the role's top 8 skills, last 12 months, oldest first. */
  skills_monthly?: SkillSeries[];
  barriers: RoleBarriers;
  /** Share of ads that say junior / career changer / trainee / internship (question A, good news, apart from the barriers). */
  entry_level_share: number;
  /** Direct employers with 2+ ads for the role (question C), top 15. */
  employers: CompanyCount[];
  /** Recruiting agencies posting for the role, top 8 (listed apart). */
  agencies: CompanyCount[];
  agency_share: number;
  cantons: CantonCount[];
  reporting_obligation_share: number;
  examples: ExampleAd[];
};
export type SectorPoint = { series: string; period: string; value: number };
export type SeriesPoint = { period: string; value: number };
export type Series = { label: string; unit: string; dimension: string | null; points: SeriesPoint[] };
/** One source's time series for one question (export field `series`, keyed by question letter). */
export type SeriesBlock = { source: string; name: string; url: string; updated: string | null; series: Series[] };
export type PolicyItem = { source: string; title: string; date: string | null; status: string | null; url: string | null; matched: string | null };
/** Every IT ad by job-room occupation code (export field `it_market`, 21.11.2026). */
export type ItGroup = { group: string; label_en: string; label_de: string; ads: number };
export type ItOccupation = { code: string; label_en: string; label_de: string; group: string; ads: number; entry_ads?: number; entry_level_share: number };
export type ItMarket = {
  ads: number;
  /** Ads open to beginners: the full text says junior / trainee / career changer / internship, or job-room's experience field says none or under a year. */
  entry_ads?: number;
  read_in_full?: number;
  entry_level_share: number;
  reporting_obligation_share: number;
  weekly: WeeklyPoint[];
  groups: ItGroup[];
  occupations: ItOccupation[];
  cantons: CantonCount[];
};
export type Radar = {
  generated_at: string;
  window_days: number;
  sources: RadarSource[];
  roles: RadarRole[];
  sector: SectorPoint[];
  policy: PolicyItem[];
  /** Optional: Swiss IT market totals. */
  market?: Market;
  /** Optional (added with sources-as-config): time series per question letter. */
  series?: Record<string, SeriesBlock[]>;
  /** Optional (21.11.2026): every IT ad, not only the three roles. */
  it_market?: ItMarket;
};

export type RadarResult = { ok: true; data: Radar; file: string } | { ok: false; error: string };

export const BARRIER_KEYS = ["german_required", "french_required", "degree_required", "senior_experience", "english_ok"] as const;
export const CACHE_MS = 10 * 60 * 1000;
export const DEFAULT_DATA_FILE = "fixtures/radar.sample.json";

export function dataFilePath(env: Record<string, string | undefined> = process.env): string {
  const p = (env.RADAR_DATA ?? "").trim() || DEFAULT_DATA_FILE;
  // The path is decided at run time (RADAR_DATA); the bundler must not try to trace it.
  return path.isAbsolute(p) ? p : path.join(/*turbopackIgnore: true*/ process.cwd(), p);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrOrNull = (v: unknown) => v === null || v === undefined || isStr(v);
const isCompanyCount = (c: unknown) => isObj(c) && isStr(c.company) && isNum(c.ads);
const isArr = (v: unknown, each: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(each);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const isMonthly = (m: unknown) => isObj(m) && isStr(m.month) && MONTH.test(m.month) && isNum(m.new_ads) && typeof m.partial === "boolean";
const isSkillShare = (s: unknown) => isObj(s) && isStr(s.skill) && isNum(s.count) && isNum(s.share);
const isSkillMonth = (m: unknown) => isObj(m) && isStr(m.month) && MONTH.test(m.month) && isNum(m.count) && isNum(m.share) && typeof m.partial === "boolean";
const isSkillSeries = (s: unknown) => isObj(s) && isStr(s.skill) && isArr(s.points, isSkillMonth);

/** Throws a readable Error when the document does not have the shape of the contract. */
export function parseRadar(text: string): Radar {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The data file is not valid JSON.");
  }
  const bad = (what: string): never => {
    throw new Error(`The data file does not match the contract: ${what}.`);
  };
  if (!isObj(raw)) return bad("top level is not an object");
  if (!isStr(raw.generated_at) || Number.isNaN(Date.parse(raw.generated_at))) bad("generated_at");
  if (!isNum(raw.window_days)) bad("window_days");
  if (!isArr(raw.sources, (s) => isObj(s) && isStr(s.id) && isStr(s.name) && isStr(s.url) && isStr(s.what) && isStrOrNull(s.updated))) bad("sources");
  if (
    !isArr(
      raw.roles,
      (r) =>
        isObj(r) &&
        isStr(r.id) &&
        isStr(r.label) &&
        isNum(r.ads) &&
        isArr(r.weekly, (w) => isObj(w) && isStr(w.week) && /^\d{4}-W\d{2}$/.test(w.week) && isNum(w.new_ads)) &&
        (r.monthly === undefined || isArr(r.monthly, isMonthly)) &&
        isArr(r.skills, isSkillShare) &&
        (r.entry_ads === undefined || isNum(r.entry_ads)) &&
        (r.entry_skills === undefined || isArr(r.entry_skills, isSkillShare)) &&
        (r.skills_monthly === undefined || isArr(r.skills_monthly, isSkillSeries)) &&
        isObj(r.barriers) &&
        BARRIER_KEYS.every((k) => isNum((r.barriers as Record<string, unknown>)[k])) &&
        isNum(r.entry_level_share) &&
        isArr(r.employers, isCompanyCount) &&
        isArr(r.agencies, isCompanyCount) &&
        isNum(r.agency_share) &&
        isArr(r.cantons, (c) => isObj(c) && isStr(c.canton) && isNum(c.count)) &&
        isNum(r.reporting_obligation_share) &&
        isArr(r.examples, (e) => isObj(e) && isStr(e.title) && isStr(e.url) && isStrOrNull(e.company) && isStrOrNull(e.city) && isStrOrNull(e.published)),
    )
  ) {
    bad("roles");
  }
  if (!isArr(raw.sector, (s) => isObj(s) && isStr(s.series) && isStr(s.period) && /^\d{4}Q[1-4]$/.test(s.period) && isNum(s.value))) bad("sector");
  if (
    !isArr(
      raw.policy,
      (p) => isObj(p) && isStr(p.source) && isStr(p.title) && isStrOrNull(p.date) && isStrOrNull(p.status) && isStrOrNull(p.url) && isStrOrNull(p.matched),
    )
  ) {
    bad("policy");
  }
  if (raw.market !== undefined) {
    const m = raw.market;
    if (!isObj(m) || !isNum(m.ads) || !isArr(m.monthly, isMonthly) || !isArr(m.roles, (r) => isObj(r) && isStr(r.id) && isNum(r.ads))) bad("market");
  }
  if (raw.series !== undefined) {
    const isPoint = (p: unknown) => isObj(p) && isStr(p.period) && isNum(p.value);
    const isSeries = (x: unknown) => isObj(x) && isStr(x.label) && isStr(x.unit) && isStrOrNull(x.dimension) && isArr(x.points, isPoint);
    const isBlock = (b: unknown) => isObj(b) && isStr(b.source) && isStr(b.name) && isStr(b.url) && isStrOrNull(b.updated) && isArr(b.series, isSeries);
    if (!isObj(raw.series) || !Object.values(raw.series).every((v) => isArr(v, isBlock))) bad("series");
  }
  if (raw.it_market !== undefined) {
    const m = raw.it_market;
    const ok =
      isObj(m) &&
      isNum(m.ads) &&
      (m.entry_ads === undefined || isNum(m.entry_ads)) &&
      isNum(m.entry_level_share) &&
      isNum(m.reporting_obligation_share) &&
      isArr(m.weekly, (w) => isObj(w) && isStr(w.week) && /^\d{4}-W\d{2}$/.test(w.week) && isNum(w.new_ads)) &&
      isArr(m.groups, (g) => isObj(g) && isStr(g.group) && isStr(g.label_en) && isStr(g.label_de) && isNum(g.ads)) &&
      isArr(m.occupations, (o) => isObj(o) && isStr(o.code) && isStr(o.label_en) && isStr(o.label_de) && isStr(o.group) && isNum(o.ads) && isNum(o.entry_level_share) && (o.entry_ads === undefined || isNum(o.entry_ads))) &&
      isArr(m.cantons, (c) => isObj(c) && isStr(c.canton) && isNum(c.count));
    if (!ok) bad("it_market");
  }
  return raw as unknown as Radar;
}

type Cache = { at: number; file: string; result: RadarResult };
declare global {
  var __radar_data_cache__: Cache | undefined;
}

/**
 * The data, cached for 10 minutes per file. A failed read is cached for only
 * 30 seconds, and a file that was good before keeps being served (marked by the
 * unchanged `data`) when a later read fails, so a half-written file never
 * blanks the dashboard.
 */
export function loadRadar(now: number = Date.now(), env: Record<string, string | undefined> = process.env): RadarResult {
  const file = dataFilePath(env);
  const cached = globalThis.__radar_data_cache__;
  if (cached && cached.file === file) {
    const ttl = cached.result.ok ? CACHE_MS : 30 * 1000;
    if (now - cached.at < ttl) return cached.result;
  }
  let result: RadarResult;
  try {
    result = { ok: true, data: parseRadar(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")), file };
  } catch (e) {
    const message = e instanceof Error ? e.message : "The data file could not be read.";
    result = cached && cached.file === file && cached.result.ok ? cached.result : { ok: false, error: message };
  }
  globalThis.__radar_data_cache__ = { at: now, file, result };
  return result;
}

/** For tests. */
export function clearRadarCache(): void {
  globalThis.__radar_data_cache__ = undefined;
}
