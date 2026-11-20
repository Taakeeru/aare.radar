/**
 * The admin guard (lib/admin-guard.ts), ported cases of the client template
 * lib/__tests__/r7-admin-totp-required.test.ts for this app's one
 * role, plus the coverage rule: EVERY page and server action under
 * app/[locale]/(admin)/admin asks the guard on the server.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; isAdmin: boolean; email: string },
  totpEnabled: false,
  totpReadFails: false,
  proofValid: false,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "x" }) }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getUserFromSessionCookie: async () => state.user,
  SESSION_COOKIE: "s",
  TOTP_COOKIE: "t",
  totpProofValid: () => state.proofValid,
}));
vi.mock("@/lib/totp-store", () => ({
  isTotpEnabled: () => {
    if (state.totpReadFails) throw new Error("TotpUnavailableError");
    return state.totpEnabled;
  },
}));

import { accessDecision, adminTotpRequired, guardTarget, requireAdmin } from "@/lib/admin-guard";

const ROOT = process.cwd();
const admin = { id: "a1", isAdmin: true, email: "a@example.org" };

beforeEach(() => {
  state.user = admin;
  state.totpEnabled = false;
  state.totpReadFails = false;
  state.proofValid = false;
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("the switch (the template r7)", () => {
  it("is off unless set to 1, true or on", () => {
    expect(adminTotpRequired({})).toBe(false);
    for (const v of ["", "0", "false", "off", "no", "yes please"]) expect(adminTotpRequired({ ADMIN_TOTP_REQUIRED: v }), v).toBe(false);
    for (const v of ["1", "true", "on", " TRUE "]) expect(adminTotpRequired({ ADMIN_TOTP_REQUIRED: v }), v).toBe(true);
  });
});

describe("accessDecision", () => {
  it("nobody signed in: login; a non-admin: forbidden", () => {
    expect(accessDecision(null, { enabled: false, verified: false })).toBe("login");
    expect(accessDecision({ isAdmin: false }, { enabled: false, verified: false, required: true })).toBe("forbidden");
  });
  it("off: an admin without a factor is in", () => {
    expect(accessDecision(admin, { enabled: false, verified: false })).toBe("ok");
  });
  it("an enabled factor must be passed in this session", () => {
    expect(accessDecision(admin, { enabled: true, verified: false })).toBe("totp");
    expect(accessDecision(admin, { enabled: true, verified: true })).toBe("ok");
  });
  it("on: an admin without a factor goes to the set-up, except on the set-up page itself", () => {
    expect(accessDecision(admin, { enabled: false, verified: false, required: true })).toBe("totp_setup");
    expect(accessDecision(admin, { enabled: false, verified: false, required: true }, { setupPage: true })).toBe("ok");
    expect(accessDecision(admin, { enabled: true, verified: false, required: true }, { setupPage: true })).toBe("totp");
  });
});

describe("requireAdmin end to end", () => {
  it("fails CLOSED when the second-factor state cannot be read (security review of PR #1)", async () => {
    state.totpReadFails = true;
    const g = await requireAdmin();
    expect(g.ok).toBe(false);
    expect(!g.ok && g.reason).toBe("login");
    const s2 = await requireAdmin({ setupPage: true });
    expect(s2.ok).toBe(false);
  });
  it("default: in, with the «not set up» flag", async () => {
    const g = await requireAdmin();
    expect(g.ok && g.totpMissing).toBe(true);
  });
  it("signed out → the sign-in with the way back; a non-admin → the public start page", async () => {
    state.user = null;
    const g = await requireAdmin();
    expect(!g.ok && guardTarget(g, "de", "/de/admin/protokoll")).toBe("/de/login?next=%2Fde%2Fadmin%2Fprotokoll");
    state.user = { ...admin, isAdmin: false };
    const h = await requireAdmin();
    expect(!h.ok && guardTarget(h, "de")).toBe("/de");
  });
  it("an enabled factor not passed → /auth/2fa; switch on without a factor → the set-up page", async () => {
    state.totpEnabled = true;
    const g = await requireAdmin();
    expect(!g.ok && guardTarget(g, "de")).toBe("/de/auth/2fa?next=%2Fde%2Fadmin");
    state.totpEnabled = false;
    vi.stubEnv("ADMIN_TOTP_REQUIRED", "1");
    const h = await requireAdmin();
    expect(!h.ok && guardTarget(h, "de")).toBe("/de/admin/sicherheit?next=%2Fde%2Fadmin&required=1");
  });
});

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

describe("every admin page and admin action checks the session on the server", () => {
  const adminDir = join(ROOT, "app", "[locale]", "(admin)", "admin");
  const all = files(adminDir);

  it("finds the admin pages (sanity)", () => {
    expect(all.map(rel)).toEqual(expect.arrayContaining(["app/[locale]/(admin)/admin/page.tsx", "app/[locale]/(admin)/admin/sicherheit/actions.ts"]));
  });

  it("each page.tsx calls requireAdminOrRedirect before it renders", () => {
    const bad = all.filter((f) => f.endsWith("page.tsx") && !/await requireAdminOrRedirect\(/.test(readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });

  it("each exported server action calls the guard first", () => {
    const bad: string[] = [];
    for (const f of all.filter((x) => /^\s*["']use server["']/m.test(readFileSync(x, "utf8")))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
        const body = m[2]!;
        const guard = body.search(/requireAdmin(OrRedirect)?\(/);
        const work = body.search(/\b(db\.|sqlite\.|start\w*\(|enable\w*\(|cancel\w*\(|logAdminAction\()/);
        if (guard < 0 || (work >= 0 && work < guard)) bad.push(`${rel(f)} ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("middleware does not decide access (no session check there to rely on)", () => {
    expect(readFileSync(join(ROOT, "middleware.ts"), "utf8")).not.toMatch(/getUserFromSessionCookie|SESSION_COOKIE/);
  });
});
