/**
 * Ported from the client template (lib/__tests__/rate-limit-production-selfhosted.test.ts
 *). Login must work on this deployment, which has no Redis.
 *
 * The template regression 2026-08-05: lib/rate-limit.ts threw in production whenever
 * Upstash was not configured; checkRateLimit is the first call in the login
 * path, so every login 500'd. This site never had the Redis backend (one
 * long-lived container), so the template's third case («still fails closed on
 * serverless») has no counterpart here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("rate limiting without Upstash", () => {
  it("does not throw in production on a self-hosted (non-serverless) deployment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { checkRateLimit } = await import("../rate-limit");
    await expect(checkRateLimit("test:selfhosted", 5, 60_000, true)).resolves.toBe(true);
  });

  it("still enforces the limit via the in-memory store", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { checkRateLimit } = await import("../rate-limit");
    const key = `test:enforce:${Math.random()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit(key, 3, 60_000, true));
    }
    // 3 allowed, the 4th refused — a real limiter, not a pass-through.
    expect(results).toEqual([true, true, true, false]);
  });
});
