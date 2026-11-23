import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { BARRIER_KEYS, CACHE_MS, clearRadarCache, dataFilePath, loadRadar, parseRadar } from "@/lib/radar";
import { ROOT } from "./support/files";

const FIXTURE = path.join(ROOT, "fixtures", "radar.sample.json");
const text = () => fs.readFileSync(FIXTURE, "utf8");
const tmp = (name: string, body: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-test-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
};

beforeEach(() => clearRadarCache());

describe("the data contract (collector/export.py)", () => {
  it("the sample fixture parses", () => {
    const d = parseRadar(text());
    expect(d.roles.map((r) => r.id)).toEqual(["web", "support", "data"]);
    for (const r of d.roles) for (const k of BARRIER_KEYS) expect(typeof r.barriers[k]).toBe("number");
  });

  it("every key the export docstring names is in the fixture (types and docstring stay in step)", () => {
    const doc = fs.readFileSync(path.join(ROOT, "collector", "export.py"), "utf8").split('"""')[1]!;
    const d = JSON.parse(text());
    const role = d.roles[0];
    const roleBlock = doc.slice(doc.indexOf('"roles"'), doc.indexOf('"sector"'));
    const roleKeys = [...roleBlock.matchAll(/^\s*"(\w+)"/gm)].map((m) => m[1]!).filter((k) => !["roles"].includes(k));
    // keys that are nested objects' fields are listed inline in the docstring, so check only the top-level role keys
    const top = ["id", "label", "ads", "weekly", "skills", "barriers", "entry_level_share", "employers", "agencies", "agency_share", "cantons", "reporting_obligation_share", "examples"];
    for (const k of top) {
      expect(roleBlock, `docstring names ${k}`).toContain(`"${k}"`);
      expect(role, `fixture has ${k}`).toHaveProperty(k);
    }
    expect(roleKeys.length).toBeGreaterThan(5);
    for (const k of ["generated_at", "window_days", "sources", "roles", "sector", "policy"]) expect(d).toHaveProperty(k);
  });

  it("refuses a file that is not the contract, with a readable message", () => {
    expect(() => parseRadar("not json")).toThrow(/not valid JSON/);
    expect(() => parseRadar("[]")).toThrow(/contract/);
    const d = JSON.parse(text());
    delete d.roles[0].employers;
    expect(() => parseRadar(JSON.stringify(d))).toThrow(/roles/);
    const e = JSON.parse(text());
    e.sector[0].period = "2020-Q3";
    expect(() => parseRadar(JSON.stringify(e))).toThrow(/sector/);
  });
});

describe("monthly history and market totals", () => {
  it("a file without monthly and market still loads", () => {
    const d = JSON.parse(text());
    delete d.market;
    for (const r of d.roles) delete r.monthly;
    const out = parseRadar(JSON.stringify(d));
    expect(out.market).toBeUndefined();
    expect(out.roles[0]!.monthly).toBeUndefined();
  });

  it("the fixture carries 12 months per role and a market block", () => {
    const d = parseRadar(text());
    for (const r of d.roles) {
      expect(r.monthly).toHaveLength(12);
      expect(r.monthly!.filter((m) => m.partial)).toHaveLength(1);
    }
    expect(d.market!.monthly).toHaveLength(12);
    expect(d.market!.roles.map((r) => r.id)).toEqual(["support", "data", "web"]);
    expect(d.market!.ads).toBeGreaterThanOrEqual(Math.max(...d.roles.map((r) => r.ads)));
  });

  it("rejects a market with a non-number ads and a role with a wrong monthly shape", () => {
    const d = JSON.parse(text());
    d.market.ads = "630";
    expect(() => parseRadar(JSON.stringify(d))).toThrow(/market/);
    const e = JSON.parse(text());
    e.roles[0].monthly[0].new_ads = "5";
    expect(() => parseRadar(JSON.stringify(e))).toThrow(/roles/);
  });
});

describe("entry-level skills and monthly skill history", () => {
  it("a file without the new fields still validates", () => {
    const d = JSON.parse(text());
    for (const r of d.roles) {
      delete r.entry_ads;
      delete r.entry_skills;
      delete r.skills_monthly;
    }
    const out = parseRadar(JSON.stringify(d));
    expect(out.roles[0]!.entry_skills).toBeUndefined();
    expect(out.roles[0]!.skills_monthly).toBeUndefined();
  });

  it("the fixture carries both fields for every role, 12 months per series", () => {
    const d = parseRadar(text());
    for (const r of d.roles) {
      expect(typeof r.entry_ads).toBe("number");
      expect(r.entry_skills!.length).toBeGreaterThan(0);
      for (const s of r.skills_monthly!) expect(s.points).toHaveLength(12);
    }
  });

  it("refuses a bad month and a bad entry skill", () => {
    const d = JSON.parse(text());
    d.roles[0].skills_monthly[0].points[0].month = "2026-13";
    expect(() => parseRadar(JSON.stringify(d))).toThrow(/roles/);
    const e = JSON.parse(text());
    e.roles[0].entry_skills[0].count = "5";
    expect(() => parseRadar(JSON.stringify(e))).toThrow(/roles/);
  });
});

describe("loading and the 10 minute cache", () => {
  it("RADAR_DATA picks the file; the default is the sample fixture", () => {
    expect(dataFilePath({})).toBe(FIXTURE);
    expect(dataFilePath({ VERCEL: "1" })).toBe(path.join(process.cwd(), "snapshots/radar-latest.json"));
    expect(dataFilePath({ VERCEL: "1", RADAR_DATA: "/srv/radar.json" })).toBe("/srv/radar.json");
    expect(dataFilePath({ RADAR_DATA: "/srv/radar.json" })).toBe("/srv/radar.json");
    expect(dataFilePath({ RADAR_DATA: "data/x.json" })).toBe(path.join(process.cwd(), "data/x.json"));
  });

  it("reads once and serves the cache for 10 minutes, then reads again", () => {
    const file = tmp("a.json", text());
    const env = { RADAR_DATA: file };
    const first = loadRadar(1_000, env);
    expect(first.ok).toBe(true);
    const d = JSON.parse(text());
    d.roles[0].ads = 1;
    fs.writeFileSync(file, JSON.stringify(d));
    const cached = loadRadar(1_000 + CACHE_MS - 1, env);
    expect(cached.ok && cached.data.roles[0]!.ads).not.toBe(1);
    const fresh = loadRadar(1_000 + CACHE_MS + 1, env);
    expect(fresh.ok && fresh.data.roles[0]!.ads).toBe(1);
  });

  it("a missing or broken file is an error result, not an exception", () => {
    const r = loadRadar(1, { RADAR_DATA: path.join(ROOT, "nope.json") });
    expect(r.ok).toBe(false);
  });

  it("a file that breaks later does not blank the dashboard: the last good data stays", () => {
    const file = tmp("b.json", text());
    const env = { RADAR_DATA: file };
    expect(loadRadar(1, env).ok).toBe(true);
    fs.writeFileSync(file, "{ half written");
    expect(loadRadar(1 + CACHE_MS + 1, env).ok).toBe(true);
  });
});
