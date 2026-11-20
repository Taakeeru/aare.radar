import { describe, expect, it } from "vitest";
import {
  ageInDays,
  formatDate,
  freshness,
  hurdleLevel,
  isoWeekRange,
  niceScale,
  outOf10,
  outOf100,
  percentChange,
  recentVersusBefore,
  safeHttpUrl,
  sectorSeries,
  topCantonShare,
  weeklyPoints,
  yearBefore,
} from "@/lib/radar-view";

describe("plain numbers", () => {
  it("out of 100 and out of 10", () => {
    expect(outOf100(0.2306)).toBe(23);
    expect(outOf10(0.39)).toBe(4);
    expect(outOf10(0.007)).toBe(0);
    expect(outOf100(1.4)).toBe(100);
  });
  it("hurdle level always maps to a word-bearing level", () => {
    expect(hurdleLevel(0.19)).toBe("low");
    expect(hurdleLevel(0.2)).toBe("medium");
    expect(hurdleLevel(0.45)).toBe("high");
  });
  it("percent change and canton share", () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(5, 0)).toBe(0);
    expect(topCantonShare([{ count: 50 }, { count: 25 }, { count: 25 }], 2)).toBe(75);
  });
});

describe("dates", () => {
  it("date-only values are not moved by a time zone", () => {
    expect(formatDate("2026-11-20", "de")).toBe("20.11.2026");
    expect(formatDate(null, "de")).toBe("");
  });
  it("ISO week ranges", () => {
    expect(isoWeekRange("2026-W47")).toEqual({ monday: "2026-11-16", sunday: "2026-11-22" });
    expect(isoWeekRange("2026-W01")).toEqual({ monday: "2025-12-29", sunday: "2026-01-04" });
  });
  it("age and freshness", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(ageInDays("2026-11-18", now)).toBe(2);
    expect(freshness(2)).toBe("fresh");
    expect(freshness(5)).toBe("aging");
    expect(freshness(9)).toBe("old");
    expect(freshness(null)).toBe("unknown");
  });
});

describe("weekly trend", () => {
  const weekly = Array.from({ length: 9 }, (_, i) => ({ week: `2026-W${39 + i}`, new_ads: 10 + i }));
  it("the last week is partial on a Friday export; the first is complete when the window starts on a Monday", () => {
    const p = weeklyPoints({ weekly }, "2026-11-20T19:37:22+00:00", 60); // window starts Monday 2026-09-21 = W39
    expect(p[0]!.partial).toBe(false);
    expect(p[8]!.partial).toBe(true);
  });
  it("the first week is partial when the window starts mid-week", () => {
    const p = weeklyPoints({ weekly }, "2026-11-20T19:37:22+00:00", 58);
    expect(p[0]!.partial).toBe(true);
  });
  it("a window starting on a Monday and an export on a Sunday have no partial week", () => {
    const p = weeklyPoints({ weekly }, "2026-11-22T10:00:00+00:00", 62);
    expect(p.some((x) => x.partial)).toBe(false);
  });
  it("compares the last 3 complete weeks with the 3 before, or says there is not enough", () => {
    const pts = weekly.map((w) => ({ week: w.week, newAds: w.new_ads, partial: false }));
    expect(recentVersusBefore(pts)).toEqual({ recent: 17, before: 14 });
    expect(recentVersusBefore(pts.slice(0, 4))).toBeNull();
  });
});

describe("chart scale", () => {
  it("starts at zero, has 4 equal steps and headroom above the maximum", () => {
    for (const max of [0, 3, 37, 99, 4550, 7011]) {
      const s = niceScale(max);
      expect(s.ticks[0]).toBe(0);
      expect(s.ticks).toHaveLength(5);
      expect(s.max).toBeGreaterThan(max);
      expect(s.ticks[4]).toBe(s.max);
    }
    expect(niceScale(37).ticks).toEqual([0, 10, 20, 30, 40]);
  });
});

describe("sector series", () => {
  const sector = [
    { series: "Job vacancies - total / 58-63 IT and communications", period: "2020Q3", value: 4550 },
    { series: "Job vacancies - total / 62-63 IT and other information services", period: "2021Q3", value: 5264 },
    { series: "Job vacancies - total / 62-63 IT and other information services", period: "2020Q3", value: 3921 },
  ];
  it("picks NOGA 62-63 (IT services), sorted by period", () => {
    const s = sectorSeries(sector)!;
    expect(s.points.map((p) => p.period)).toEqual(["2020Q3", "2021Q3"]);
    expect(yearBefore(s.points, "2021Q3")?.value).toBe(3921);
    expect(yearBefore(s.points, "2020Q3")).toBeNull();
  });
  it("no data, no series", () => {
    expect(sectorSeries([])).toBeNull();
  });
});

describe("links from the data file", () => {
  it("only http(s) addresses become links", () => {
    expect(safeHttpUrl("https://www.job-room.ch/job-search/1")).toBe("https://www.job-room.ch/job-search/1");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
