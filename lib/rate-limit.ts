/**
 * lib/rate-limit.ts — rate limiter, ported from the client template
 * (lib/rate-limit.ts).
 *
 * Keyed on an arbitrary string (e.g. IP, email, or composite). Two ways to count:
 *
 *   - `checkRateLimit(key, max, windowMs)`: the template's API, unchanged: counts EVERY
 *     call in a fixed window and answers false once `max` calls were made
 *     (requests that are expensive or send mail whether they succeed or not:
 *     the reset request, the reset page);
 *   - `isRateLimited(key, max)` + `recordFailure(key, max, windowMs)`: count
 *     FAILURES only (sign-in, second-factor code). The check never creates an
 *     entry; only a failed attempt does (security review of PR #1, 15.11.2026),
 *     so a flood of correct or never-tried keys leaves no trace in the store.
 *
 * What is NOT ported: the template's Upstash Redis backend and its circuit breaker. The template
 * keeps them for a possible serverless host; this site runs as ONE long-lived
 * container (like the template in production), where the template itself serves every request from
 * the in-memory store below.
 *
 * Store cap (addition of this app, revised after review): the template's Map grows until the
 * hourly cleanup. Here, when a NEW key needs room and the store is full:
 *   1. expired entries are purged;
 *   2. then the least-recently-used entries that are UNDER their limit are
 *      evicted (losing one costs at most a few counted attempts);
 *   3. an entry that is currently blocking (at its limit) is NEVER evicted, so
 *      a flood cannot unblock an attacker's key;
 *   4. only when every entry is at its limit is the new key refused (logged).
 * An unauthenticated flood therefore cannot lock everyone out: it can only
 * push out other under-limit counters.
 */

interface Entry {
  count: number;
  /** The limit this key is counted against: an entry at it is blocking and never evicted. */
  max: number;
  resetAt: number;
}

export const MAX_RATE_LIMIT_KEYS = 50_000;

/** Map order = least recently used first (every touch re-inserts the key). */
const memoryStore = new Map<string, Entry>();
let lastFullWarning = 0;

function purgeExpired(now: number): void {
  for (const [k, v] of memoryStore.entries()) {
    if (v.resetAt < now) memoryStore.delete(k);
  }
}

function touch(key: string, entry: Entry): void {
  memoryStore.delete(key);
  memoryStore.set(key, entry);
}

function warnFull(now: number): void {
  if (now - lastFullWarning > 60_000) {
    lastFullWarning = now;
    console.error(`[rate-limit] store full of blocking entries (${memoryStore.size} keys): refusing new keys until some expire.`);
  }
}

/**
 * Make room for one new key. True when there is room (after purging expired
 * entries and evicting least-recently-used under-limit entries).
 */
function makeRoom(now: number, maxKeys: number): boolean {
  if (memoryStore.size < maxKeys) return true;
  purgeExpired(now);
  if (memoryStore.size < maxKeys) return true;
  for (const [k, v] of memoryStore) {
    if (v.count < v.max) {
      memoryStore.delete(k);
      if (memoryStore.size < maxKeys) return true;
    }
  }
  warnFull(now);
  return false;
}

/** Is the store full of entries that are all at their limit (no room can be made)? Read-only. */
function saturated(now: number, maxKeys: number): boolean {
  if (memoryStore.size < maxKeys) return false;
  let live = 0;
  for (const v of memoryStore.values()) {
    if (v.resetAt < now) return false;
    if (v.count < v.max) return false;
    live++;
  }
  return live >= maxKeys;
}

function liveEntry(key: string, now: number): Entry | undefined {
  const e = memoryStore.get(key);
  if (e && e.resetAt < now) {
    memoryStore.delete(key);
    return undefined;
  }
  return e;
}

/**
 * The template's counter: counts every call. true = allowed (counted), false = blocked
 * (limit reached, or no room for a new key because every entry is blocking).
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
  _isAuthOperation = false,
  maxKeys: number = MAX_RATE_LIMIT_KEYS,
): Promise<boolean> {
  const now = Date.now();
  const entry = liveEntry(key, now);
  if (!entry) {
    if (!makeRoom(now, maxKeys)) return false;
    memoryStore.set(key, { count: 1, max: maxAttempts, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    touch(key, entry);
    return false;
  }
  entry.count++;
  entry.max = maxAttempts;
  touch(key, entry);
  return true;
}

/**
 * Failures-only check: is this key at its limit? Never creates an entry. A key
 * with no entry is refused only when the store is saturated (every entry at its
 * limit), because its failure could not be counted.
 */
export async function isRateLimited(key: string, maxFailures: number, maxKeys: number = MAX_RATE_LIMIT_KEYS): Promise<boolean> {
  const now = Date.now();
  const entry = liveEntry(key, now);
  if (entry) return entry.count >= maxFailures;
  if (saturated(now, maxKeys)) {
    warnFull(now);
    return true;
  }
  return false;
}

/** Count one failed attempt. false only when it could not be stored (every entry blocking; logged). */
export async function recordFailure(
  key: string,
  maxFailures: number,
  windowMs = 15 * 60 * 1000,
  maxKeys: number = MAX_RATE_LIMIT_KEYS,
): Promise<boolean> {
  const now = Date.now();
  const entry = liveEntry(key, now);
  if (entry) {
    entry.count++;
    entry.max = maxFailures;
    touch(key, entry);
    return true;
  }
  if (!makeRoom(now, maxKeys)) return false;
  memoryStore.set(key, { count: 1, max: maxFailures, resetAt: now + windowMs });
  return true;
}

/**
 * Reset the counter for a key — useful in tests.
 */
export async function resetRateLimit(key: string): Promise<void> {
  memoryStore.delete(key);
}

/** Number of keys held (tests and monitoring). */
export function rateLimitStoreSize(): number {
  return memoryStore.size;
}

/** Empty the store (tests only). */
export function _clearRateLimitStore(): void {
  memoryStore.clear();
}

/** Whether a key has an entry (tests). */
export function rateLimitHasKey(key: string): boolean {
  return memoryStore.has(key);
}

/**
 * Periodically purge expired entries from memory store.
 */
let cleanupScheduled = false;

export function scheduleCleanup(intervalMs = 60 * 60 * 1000): void {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => purgeExpired(Date.now()), intervalMs).unref();
}

// Auto-start cleanup in non-test environments.
if (process.env.NODE_ENV !== "test") {
  scheduleCleanup();
}
