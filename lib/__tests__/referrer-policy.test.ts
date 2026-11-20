/**
 * Ported from the client template lib/__tests__/referrer-policy.test.ts (at
 * d0ef2c59), with this app's one token page (the password reset). The template's scans for
 * mail-link builders and [token] route folders are reduced to the one link
 * builder this app has (lib/email.ts passwordResetUrl).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";

vi.mock("next-intl/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    default: () => (req: NextRequest) =>
      /^\/(?:de|it|fr|en)(?:\/|$)/.test(req.nextUrl.pathname)
        ? NextResponse.next()
        : NextResponse.redirect(new URL(`/de${req.nextUrl.pathname}${req.nextUrl.search}`, req.url), 307),
  };
});
vi.mock("next-intl/plugin", () => ({ default: () => (config: unknown) => config }));
import middleware from "@/middleware";
import nextConfig from "@/next.config";
import { DEFAULT_REFERRER_POLICY, TOKEN_PAGE_REFERRER_POLICY, TOKEN_URL_PAGES, logPath, referrerPolicyFor } from "@/lib/referrer-policy";
import { passwordResetUrl } from "@/lib/email";

const ORIGIN = "https://radar.gnamak.ch";
const policyOf = (url: string) => middleware(new NextRequest(`${ORIGIN}${url}`)).headers.get("referrer-policy");

const TOKEN_URLS = [
  "/de/auth/passwort-neu?t=tok",
  "/de/auth/passwort-neu?t=tok&error=mismatch",
  // Unprefixed mail links are redirected by next-intl; the redirect carries it too.
  "/auth/passwort-neu?t=tok",
  // Any page that is handed a t= or token= parameter.
  "/de/info?token=x",
  "/de?t=x",
];
const DEFAULT_URLS = ["/de", "/de/info", "/de/login", "/de/passwort-vergessen", "/de/admin"];

describe("middleware: token pages send only their origin", () => {
  for (const url of TOKEN_URLS) it(url, () => expect(policyOf(url)).toBe(TOKEN_PAGE_REFERRER_POLICY));

  it("the locale redirect of an unprefixed mail link carries it too", () => {
    const res = middleware(new NextRequest(`${ORIGIN}/auth/passwort-neu?t=tok`));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toContain("/de/auth/passwort-neu?t=tok");
    expect(res.headers.get("referrer-policy")).toBe(TOKEN_PAGE_REFERRER_POLICY);
  });

  it("a token page is strict-origin even without its token", () => {
    expect(policyOf("/de/auth/passwort-neu")).toBe(TOKEN_PAGE_REFERRER_POLICY);
  });
});

describe("middleware: everything else keeps the site policy", () => {
  for (const url of DEFAULT_URLS) it(url, () => expect(policyOf(url)).toBe(DEFAULT_REFERRER_POLICY));
});

describe("next.config.ts headers say the same as the middleware", () => {
  type HeaderRoute = { source: string; has?: Array<{ type: "query"; key: string }>; headers: Array<{ key: string; value: string }> };
  const routesPromise = (nextConfig.headers as () => Promise<HeaderRoute[]>)();
  async function configPolicy(url: string): Promise<string | undefined> {
    const u = new URL(url, ORIGIN);
    const query = Object.fromEntries(u.searchParams);
    let value: string | undefined;
    for (const route of await routesPromise) {
      const match = getPathMatch(route.source, { strict: true, removeUnnamedParams: true });
      if (match(u.pathname) === false) continue;
      if (route.has && !matchHas({ headers: {}, cookies: {} } as never, query, route.has as never)) continue;
      for (const h of route.headers) if (h.key.toLowerCase() === "referrer-policy") value = h.value;
    }
    return value;
  }
  for (const url of TOKEN_URLS) it(`token: ${url}`, async () => expect(await configPolicy(url)).toBe(TOKEN_PAGE_REFERRER_POLICY));
  for (const url of DEFAULT_URLS) it(`default: ${url}`, async () => expect(await configPolicy(url)).toBe(DEFAULT_REFERRER_POLICY));
});

describe("every token link lands on a listed page", () => {
  it("the reset mail's link", () => {
    const u = new URL(passwordResetUrl("tok", "de", ORIGIN));
    expect(referrerPolicyFor(u.pathname, u.searchParams)).toBe(TOKEN_PAGE_REFERRER_POLICY);
    expect(TOKEN_URL_PAGES).toContain("/auth/passwort-neu");
  });
  it("no page metadata sets no-referrer (it breaks the next page's forms)", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "app"));
    expect(files.filter((f) => /referrer:\s*["']no-referrer["']/.test(fs.readFileSync(f, "utf8")))).toEqual([]);
  });
});

describe("self-test: the guards say no", () => {
  it("referrerPolicyFor does not hand the token policy to a look-alike path", () => {
    expect(referrerPolicyFor("/de/auth/passwort-neux")).toBe(DEFAULT_REFERRER_POLICY);
    expect(referrerPolicyFor("/de/passwort-vergessen")).toBe(DEFAULT_REFERRER_POLICY);
    expect(referrerPolicyFor("/de/info", new URLSearchParams("t=x"))).toBe(TOKEN_PAGE_REFERRER_POLICY);
  });
});

describe("logPath masks a path token", () => {
  it("below a token page the rest is [token]", () => {
    expect(logPath("/de/auth/passwort-neu/abc")).toBe("/de/auth/passwort-neu/[token]");
  });
  it("other paths are unchanged", () => {
    expect(logPath("/de/info")).toBe("/de/info");
    expect(logPath("/de/auth/passwort-neu")).toBe("/de/auth/passwort-neu");
  });
});

describe("the Origin header is never rewritten", () => {
  const post = (url: string, origin: string) => middleware(new NextRequest(`${ORIGIN}${url}`, { method: "POST", headers: { origin } }));
  const forwarded = (res: Response) => {
    const listed = (res.headers.get("x-middleware-override-headers") ?? "").split(",").map((s) => s.trim());
    return listed.includes("origin") ? res.headers.get("x-middleware-request-origin") : "unchanged";
  };
  it("a null Origin on a token page is passed on as it came", () => {
    expect(["null", "unchanged"]).toContain(forwarded(post("/de/auth/passwort-neu?t=tok", "null")));
  });
  it("a real Origin is kept", () => {
    expect([ORIGIN, "unchanged"]).toContain(forwarded(post("/de/login", ORIGIN)));
  });
  it("token pages never use no-referrer", () => {
    expect(TOKEN_PAGE_REFERRER_POLICY).toBe("strict-origin");
    expect(fs.readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8")).not.toMatch(/delete\("origin"\)/);
  });
});
