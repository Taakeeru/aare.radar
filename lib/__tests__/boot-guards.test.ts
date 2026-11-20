/**
 * Boot interlocks (lib/boot-guards.ts, the pattern of the template lib/boot-guards.ts):
 * the production production server refuses to start without the settings that
 * make the sign-in safe; Pandora's CI demo server (DEMO_INSTANCE=1) starts.
 */
import { describe, expect, it } from "vitest";
import { assertBootInterlocks, bootProblems, isProduction } from "@/lib/boot-guards";
import { read } from "./support/files";

const PROD = { APP_ENV: "production", AUTH_SECRET: "a".repeat(64), TRUST_PROXY: "true" };

describe("boot interlocks", () => {
  it("a correctly configured production server starts", () => {
    expect(bootProblems(PROD)).toEqual([]);
    expect(() => assertBootInterlocks(PROD)).not.toThrow();
  });
  it("production without TRUST_PROXY=true refuses (one shared rate-limit bucket otherwise)", () => {
    expect(() => assertBootInterlocks({ ...PROD, TRUST_PROXY: "" })).toThrow(/TRUST_PROXY=true/);
    expect(() => assertBootInterlocks({ ...PROD, TRUST_PROXY: "1" })).toThrow(/TRUST_PROXY=true/);
  });
  it("production without a long AUTH_SECRET refuses", () => {
    expect(() => assertBootInterlocks({ ...PROD, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });
  it("a secret under NEXT_PUBLIC_ refuses everywhere (it would be in the browser bundle)", () => {
    expect(bootProblems({ NEXT_PUBLIC_SMTP_PASS: "x" })).toHaveLength(1);
    expect(bootProblems({ NEXT_PUBLIC_AUTH_SECRET: "x", APP_ENV: "development" })).toHaveLength(1);
    expect(bootProblems({ NEXT_PUBLIC_APP_URL: "https://radar.gnamak.ch" })).toEqual([]);
  });
  it("Pandora's CI runs the production build as a demo instance: no production rules, demo admin allowed", () => {
    expect(isProduction({ APP_ENV: "production", DEMO_INSTANCE: "1" })).toBe(false);
    expect(bootProblems({ APP_ENV: "production", DEMO_INSTANCE: "1", AUTH_SECRET: "x".repeat(64) })).toEqual([]);
  });
  it("instrumentation.ts calls the interlocks at boot, not during next build", () => {
    const src = read("instrumentation.ts");
    expect(src).toMatch(/assertBootInterlocks\(process\.env\)/);
    expect(src).toMatch(/phase-production-build/);
  });
});
