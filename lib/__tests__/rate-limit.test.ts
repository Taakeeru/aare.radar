/**
 * lib/__tests__/rate-limit.test.ts — ported from the client template
 * (lib/__tests__/rate-limit.test.ts): the in-memory cases, kept
 * as they are. The template's Upstash/circuit-breaker cases are not ported because the
 * Redis backend is not (see lib/rate-limit.ts). Added: failures-only counting
 * and the store cap with LRU eviction of under-limit entries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _clearRateLimitStore, checkRateLimit, isRateLimited, rateLimitHasKey, rateLimitStoreSize, recordFailure, resetRateLimit } from "../rate-limit";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows the first request", async () => {
    await resetRateLimit("test:1");
    expect(await checkRateLimit("test:1", 3, 60_000)).toBe(true);
  });

  it("allows requests up to the max", async () => {
    await resetRateLimit("test:2");
    expect(await checkRateLimit("test:2", 3, 60_000)).toBe(true);
    expect(await checkRateLimit("test:2", 3, 60_000)).toBe(true);
    expect(await checkRateLimit("test:2", 3, 60_000)).toBe(true);
  });

  it("blocks the request that exceeds the max", async () => {
    await resetRateLimit("test:3");
    await checkRateLimit("test:3", 3, 60_000);
    await checkRateLimit("test:3", 3, 60_000);
    await checkRateLimit("test:3", 3, 60_000);
    // 4th call should be blocked
    expect(await checkRateLimit("test:3", 3, 60_000)).toBe(false);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    await resetRateLimit("test:4");

    // Exhaust the limit
    await checkRateLimit("test:4", 2, 60_000);
    await checkRateLimit("test:4", 2, 60_000);
    expect(await checkRateLimit("test:4", 2, 60_000)).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again
    expect(await checkRateLimit("test:4", 2, 60_000)).toBe(true);
  });

  it("treats different keys independently", async () => {
    await resetRateLimit("test:a");
    await resetRateLimit("test:b");

    // Exhaust key a
    await checkRateLimit("test:a", 1, 60_000);
    expect(await checkRateLimit("test:a", 1, 60_000)).toBe(false);

    // Key b should still be allowed
    expect(await checkRateLimit("test:b", 1, 60_000)).toBe(true);
  });

  it("counts correctly with maxAttempts=1", async () => {
    await resetRateLimit("test:5");
    expect(await checkRateLimit("test:5", 1, 60_000)).toBe(true);
    expect(await checkRateLimit("test:5", 1, 60_000)).toBe(false);
  });
});

describe("failures-only counting (this app, security review of PR #1)", () => {
  beforeEach(() => _clearRateLimitStore());

  it("the check never creates an entry; only a failed attempt does", async () => {
    expect(await isRateLimited("f:fresh", 5)).toBe(false);
    expect(rateLimitHasKey("f:fresh")).toBe(false);
    expect(rateLimitStoreSize()).toBe(0);
    expect(await recordFailure("f:fresh", 2)).toBe(true);
    expect(await isRateLimited("f:fresh", 2)).toBe(false);
    await recordFailure("f:fresh", 2);
    expect(await isRateLimited("f:fresh", 2)).toBe(true);
  });

  it("a failure window expires", async () => {
    vi.useFakeTimers();
    await recordFailure("f:w", 1, 60_000);
    expect(await isRateLimited("f:w", 1)).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(await isRateLimited("f:w", 1)).toBe(false);
    expect(rateLimitHasKey("f:w")).toBe(false);
  });
});

describe("store cap (addition of this app, revised)", () => {
  beforeEach(() => _clearRateLimitStore());

  it("full: evicts the least recently used entry UNDER its limit, never a blocking one", async () => {
    const cap = 3;
    await recordFailure("cap:blocked", 1, 60_000, cap); // at its limit: blocking
    await recordFailure("cap:a", 5, 60_000, cap);
    await recordFailure("cap:b", 5, 60_000, cap);
    expect(rateLimitStoreSize()).toBe(3);
    // A flood of new keys …
    for (let i = 0; i < 20; i++) expect(await recordFailure(`cap:flood${i}`, 5, 60_000, cap)).toBe(true);
    // … pushed out under-limit counters, but the blocking entry stays and still blocks.
    expect(rateLimitHasKey("cap:a")).toBe(false);
    expect(rateLimitHasKey("cap:blocked")).toBe(true);
    expect(await isRateLimited("cap:blocked", 1, cap)).toBe(true);
    expect(rateLimitStoreSize()).toBeLessThanOrEqual(cap);
  });

  it("purges expired entries before evicting live ones", async () => {
    vi.useFakeTimers();
    await recordFailure("cap:old", 5, 1_000, 2);
    await recordFailure("cap:live", 5, 60_000, 2);
    vi.advanceTimersByTime(2_000);
    await recordFailure("cap:new", 5, 60_000, 2);
    expect(rateLimitHasKey("cap:old")).toBe(false);
    expect(rateLimitHasKey("cap:live")).toBe(true);
  });

  it("refuses a new key only when every entry is at its limit, and logs it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await recordFailure("cap:x", 1, 60_000, 2);
    await recordFailure("cap:y", 1, 60_000, 2);
    expect(await isRateLimited("cap:new", 5, 2)).toBe(true);
    expect(await recordFailure("cap:new", 5, 60_000, 2)).toBe(false);
    expect(err).toHaveBeenCalled();
    // A key that already has an entry keeps counting.
    expect(await isRateLimited("cap:x", 1, 2)).toBe(true);
    err.mockRestore();
  });

  it("the template's counter makes room the same way", async () => {
    await checkRateLimit("cap:c1", 1, 60_000, false, 2); // now at its limit
    await checkRateLimit("cap:c2", 5, 60_000, false, 2);
    expect(await checkRateLimit("cap:c3", 5, 60_000, false, 2)).toBe(true);
    expect(rateLimitHasKey("cap:c2")).toBe(false);
    expect(rateLimitHasKey("cap:c1")).toBe(true);
  });
});
