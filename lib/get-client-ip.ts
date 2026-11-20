/**
 * lib/get-client-ip.ts — the client address for rate-limit keys. Ported from
 * the client template lib/get-client-ip.ts and tightened after
 * the security review of PR #1 (15.11.2026):
 *
 *   - Trust only what OUR proxy sets. Production runs behind the Caddy of this
 *     repo, whose site block carries CADDY_REAL_IP_SNIPPET below:
 *     `header_up X-Real-IP {remote_host}` REPLACES any X-Real-IP the client
 *     sent with the address Caddy itself saw. So with TRUST_PROXY=true the app
 *     reads X-Real-IP and nothing else.
 *   - Never X-Forwarded-For. The template fell back to its LEFT-MOST entry when X-Real-IP
 *     was missing; that entry is whatever the client wrote. Gone.
 *   - The value must be an IP address (node:net isIP), else it is not used.
 *   - No usable X-Real-IP, or TRUST_PROXY not "true": one shared key
 *     ("global"), and a log line saying why (at most once a minute), so the
 *     coarse limit is never silent.
 *
 * The boot guard (lib/boot-guards.ts) refuses to start production without
 * TRUST_PROXY=true; SECURITY.md has the Caddy snippet, and
 * lib/__tests__/get-client-ip.test.ts checks that both say the same.
 */
import { isIP } from "node:net";
import { headers } from "next/headers";

/** The key every request shares when the client address cannot be trusted. */
export const SHARED_CLIENT_KEY = "global";

/** The Caddy site block line that makes X-Real-IP trustworthy (overwrites any client value). */
export const CADDY_REAL_IP_DIRECTIVE = "header_up X-Real-IP {remote_host}";

/** The reverse_proxy block for the deploy config (deploy/Caddyfile, next PR) and SECURITY.md. */
export const CADDY_REAL_IP_SNIPPET = `reverse_proxy radar:3000 {
	${CADDY_REAL_IP_DIRECTIVE}
}`;

let lastWarning = 0;
function warnShared(reason: string): void {
  const now = Date.now();
  if (now - lastWarning < 60_000) return;
  lastWarning = now;
  console.warn(`[get-client-ip] ${reason}: all clients share one rate-limit bucket.`);
}

/** The pure decision, for tests: the rate-limit key for these request headers. */
export function clientKeyFrom(h: { get(name: string): string | null | undefined }, trustProxy: string | undefined): string {
  if (trustProxy !== "true") {
    warnShared("TRUST_PROXY is not true (per-client rate limiting off)");
    return SHARED_CLIENT_KEY;
  }
  const realIp = (h.get("x-real-ip") ?? "").trim();
  if (realIp && isIP(realIp) !== 0) return realIp;
  warnShared(realIp ? "X-Real-IP is not an IP address" : "X-Real-IP is missing (is the proxy setting it?)");
  return SHARED_CLIENT_KEY;
}

export async function getClientIp(): Promise<string> {
  return clientKeyFrom(await headers(), process.env.TRUST_PROXY);
}
