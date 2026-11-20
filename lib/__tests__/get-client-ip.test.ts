/**
 * lib/get-client-ip.ts. Started from the client template
 * lib/__tests__/get-client-ip.test.ts; the template's cases that read
 * X-Forwarded-For are reversed: after the security review of PR #1 the app
 * trusts X-Real-IP only, which our Caddy overwrites (CADDY_REAL_IP_SNIPPET).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { headers } from "next/headers";
import { CADDY_REAL_IP_DIRECTIVE, CADDY_REAL_IP_SNIPPET, SHARED_CLIENT_KEY, clientKeyFrom, getClientIp } from "@/lib/get-client-ip";

const H = (m: Record<string, string>) => new Headers(m);

/**
 * What our Caddy does with a request (reverse_proxy + CADDY_REAL_IP_DIRECTIVE):
 * X-Real-IP is SET to the address Caddy saw, replacing anything the client
 * sent; X-Forwarded-For gets that address appended.
 */
function throughCaddy(clientHeaders: Record<string, string>, remoteHost: string): Headers {
  const h = new Headers(clientHeaders);
  h.set("x-real-ip", remoteHost);
  const xff = h.get("x-forwarded-for");
  h.set("x-forwarded-for", xff ? `${xff}, ${remoteHost}` : remoteHost);
  return h;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe("clientKeyFrom", () => {
  it("TRUST_PROXY=true: the X-Real-IP our proxy set", () => {
    expect(clientKeyFrom(H({ "x-real-ip": "203.0.113.42" }), "true")).toBe("203.0.113.42");
    expect(clientKeyFrom(H({ "x-real-ip": " 2001:db8::1 " }), "true")).toBe("2001:db8::1");
  });

  it("never X-Forwarded-For, not even as a fallback", () => {
    expect(clientKeyFrom(H({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }), "true")).toBe(SHARED_CLIENT_KEY);
  });

  it("a value that is not an IP is not used, and the fallback is logged", () => {
    for (const v of ["abc", "1.2.3.4, 5.6.7.8", "999.1.1.1", "<script>"]) {
      expect(clientKeyFrom(H({ "x-real-ip": v }), "true"), v).toBe(SHARED_CLIENT_KEY);
    }
  });

  it("TRUST_PROXY unset or anything but «true»: one shared key, whatever the headers say (the template's secure default)", () => {
    for (const t of [undefined, "", "false", "1", "TRUE"]) {
      expect(clientKeyFrom(H({ "x-real-ip": "203.0.113.42", "x-forwarded-for": "203.0.113.42" }), t)).toBe(SHARED_CLIENT_KEY);
    }
  });

  it("the shared-key fallback is logged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * 60_000);
    clientKeyFrom(H({}), "true");
    expect(warn).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("a client's spoofed headers do not change its key once our Caddy forwarded the request", () => {
  const REAL = "203.0.113.9";
  const spoofs: Array<Record<string, string>> = [
    {},
    { "x-real-ip": "10.9.9.9" },
    { "x-forwarded-for": "1.1.1.1" },
    { "x-real-ip": "8.8.8.8", "x-forwarded-for": "8.8.4.4, 9.9.9.9" },
    { "x-real-ip": "garbage" },
  ];
  for (const s of spoofs) {
    it(JSON.stringify(s), () => {
      expect(clientKeyFrom(throughCaddy(s, REAL), "true")).toBe(REAL);
    });
  }
});

describe("getClientIp reads the request headers", () => {
  it("TRUST_PROXY=true", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    vi.mocked(headers).mockResolvedValue(throughCaddy({ "x-real-ip": "6.6.6.6" }, "203.0.113.5") as never);
    expect(await getClientIp()).toBe("203.0.113.5");
  });
  it("unset", async () => {
    vi.stubEnv("TRUST_PROXY", "");
    vi.mocked(headers).mockResolvedValue(H({ "x-real-ip": "203.0.113.5" }) as never);
    expect(await getClientIp()).toBe(SHARED_CLIENT_KEY);
  });
});

describe("the Caddy config says the same as the app", () => {
  it("the snippet overwrites X-Real-IP with the address Caddy saw", () => {
    expect(CADDY_REAL_IP_SNIPPET).toContain(CADDY_REAL_IP_DIRECTIVE);
    expect(CADDY_REAL_IP_DIRECTIVE).toBe("header_up X-Real-IP {remote_host}");
  });
  it("SECURITY.md ships the same snippet", () => {
    expect(readFileSync(join(process.cwd(), "SECURITY.md"), "utf8")).toContain(CADDY_REAL_IP_SNIPPET);
  });
  it("the app never reads X-Forwarded-For", () => {
    const src = readFileSync(join(process.cwd(), "lib", "get-client-ip.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(src).not.toMatch(/x-forwarded-for/i);
  });
});
