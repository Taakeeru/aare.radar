import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRadar, type Radar } from "@/lib/radar";
import { cantonFigures, formatMonth, statusFigures } from "@/lib/target-group";
import { ROOT } from "./support/files";

const sample = (): Radar => parseRadar(fs.readFileSync(path.join(ROOT, "fixtures", "radar.sample.json"), "utf8"));

describe("question D figures (series.D)", () => {
  it("reads persons and the employment rate per status from the SEM tables (Oct 2026)", () => {
    const f = Object.fromEntries(statusFigures(sample()).map((x) => [x.status, x]));
    expect(f.S).toMatchObject({ period: "2026-10", persons: 74937 });
    expect(f.F).toMatchObject({ period: "2026-10", persons: 42151 });
    expect(f.B).toMatchObject({ period: "2026-10", persons: 68426 });
    expect(Math.round(f.S!.employmentRate! * 1000)).toBe(390);
    expect(Math.round(f.F!.employmentRate! * 1000)).toBe(473);
    expect(Math.round(f.B!.employmentRate! * 1000)).toBe(392);
  });

  it("lists cantons largest first and never the Switzerland total", () => {
    const { period, rows } = cantonFigures(sample());
    expect(period).toBe("2026-10");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.canton)).not.toContain("Switzerland");
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.persons).toBeGreaterThanOrEqual(rows[i]!.persons);
  });

  it("a file without series (older export) gives no figures instead of failing", () => {
    const d = sample();
    delete d.series;
    expect(statusFigures(d)).toEqual([]);
    expect(cantonFigures(d)).toEqual({ period: null, rows: [] });
  });

  it("an employment rate from another month than the head count is not shown", () => {
    const d = sample();
    const block = d.series!.D!.find((b) => b.source === "sem_erwerb_status_s")!;
    const rate = block.series.find((s) => s.label === "Status S: employment rate (18-64) / Switzerland")!;
    rate.points = rate.points.slice(0, -1);
    expect(statusFigures(d).find((x) => x.status === "S")!.employmentRate).toBeNull();
  });

  it("a malformed series block is rejected by the contract check", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "radar.sample.json"), "utf8"));
    raw.series.D[0].series[0].points = [{ period: "2026-10", value: "many" }];
    expect(() => parseRadar(JSON.stringify(raw))).toThrow(/series/);
  });

  it("months read in both languages", () => {
    expect(formatMonth("2026-10", "de-CH")).toBe("Oktober 2026");
    expect(formatMonth("2026-10", "en-GB")).toBe("October 2026");
  });
});
