/**
 * Security headers and CSRF (security pass of PR #1). The headers come from
 * the app itself (the client template next.config.ts / middleware.ts pattern):
 * next.config.ts on every response, the CSP with a nonce from middleware.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
import nextConfig, { securityHeaders } from "@/next.config";
import { contentSecurityPolicy } from "@/lib/csp";
import { read } from "./support/files";

const ORIGIN = "https://radar.gnamak.ch";
const get = (url: string) => middleware(new NextRequest(`${ORIGIN}${url}`));
const header = (k: string) => securityHeaders.find((h) => h.key === k)?.value;

describe("headers on every response (next.config.ts)", () => {
  it("frame, sniffing, referrer, permissions, HSTS, opener", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("Permissions-Policy")).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(header("Strict-Transport-Security")).toMatch(/max-age=\d{8}/);
    expect(header("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });
  it("apply to every path", async () => {
    const routes = await (nextConfig.headers as () => Promise<Array<{ source: string; headers: unknown }>>)();
    expect(routes[0]).toEqual({ source: "/(.*)", headers: securityHeaders });
  });
  it("no X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("Content-Security-Policy (middleware.ts, per request)", () => {
  it("is on every page response, with a fresh nonce, without unsafe-eval or inline scripts", () => {
    const a = get("/de").headers.get("content-security-policy")!;
    const b = get("/de").headers.get("content-security-policy")!;
    expect(a).not.toBe(b);
    const script = a.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'$/);
    expect(a).not.toContain("unsafe-eval");
    expect(script).not.toContain("unsafe-inline");
    expect(a).toContain("frame-ancestors 'none'");
    expect(a).toContain("form-action 'self'");
    expect(a).toContain("base-uri 'self'");
    expect(a).toContain("object-src 'none'");
  });
  it("the source never adds unsafe-eval, not even for development", () => {
    expect(read("lib/csp.ts").replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy("n")).not.toContain("unsafe-eval");
  });
});

describe("admin and sign-in pages", () => {
  for (const p of ["/de/admin", "/de/admin/sicherheit", "/de/login", "/de/auth/2fa", "/de/auth/passwort-neu?t=x", "/de/passwort-vergessen"]) {
    it(`${p}: not indexed, not cached`, () => {
      const res = get(p);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    });
  }
  it("public pages are not marked", () => {
    expect(get("/de/info").headers.get("x-robots-tag")).toBeNull();
  });
});

describe("CSRF: Next's own Origin check on server actions stays on", () => {
  it("next.config.ts never widens serverActions.allowedOrigins", () => {
    expect(JSON.stringify(nextConfig)).not.toContain("allowedOrigins");
    expect(read("next.config.ts")).not.toMatch(/allowedOrigins\s*:/);
  });
  it("every state change is a server action or a route that calls isSameOrigin (route-origin-ratchet.test.ts)", () => {
    // Forms post to server actions: Next compares Origin with Host / X-Forwarded-Host
    // and refuses a mismatch before the action runs.
    expect(read("app/[locale]/(admin)/login/actions.ts")).toMatch(/^"use server";/);
    expect(read("app/[locale]/(admin)/passwort-vergessen/actions.ts")).toMatch(/^"use server";/);
  });
  it("the session cookie is SameSite=Lax, so a cross-site POST does not carry it either", () => {
    expect(read("lib/auth.ts")).toMatch(/sameSite: "lax" as const/);
  });
});

describe("no secret in a URL", () => {
  it("no redirect carries a password, a session or a reset token it did not receive in the link", () => {
    for (const f of ["app/[locale]/(admin)/login/actions.ts", "app/[locale]/(admin)/auth/2fa/actions.ts", "app/[locale]/(admin)/passwort-vergessen/actions.ts"]) {
      for (const m of read(f).matchAll(/redirect\(([^;]+)\);/g)) {
        // No credential or address as a query parameter, and none interpolated into the target.
        expect(m[1], `${f}: ${m[1]}`).not.toMatch(/[?&](password|session|cookie|email|proof|code)=/i);
        expect(m[1], `${f}: ${m[1]}`).not.toMatch(/\$\{\s*(password|repeat|email|sessionValue|proof|code)\b/);
      }
    }
  });
});
