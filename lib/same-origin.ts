// Security-reviewed code of Pandora's client template, kept verbatim.
/**
 * The one same-origin check for API routes that take a cookie-authenticated
 * POST (uploads, the Rundmail, the Mailchimp import). Defence in depth: the
 * SameSite=Lax session cookie already keeps cross-site POSTs out.
 *
 * Compare the browser's Origin with the PUBLIC host. Behind Caddy
 * req.nextUrl.host is the container's own address (0.0.0.0:3000), never
 * a staging host of the client template, so a route that compared against that
 * alone refused every real request (a bug the client template had to fix). Allowed:
 * the host of NEXT_PUBLIC_APP_URL, the forwarded host Caddy sets, and the
 * request host (dev without a proxy). A cross-site page matches none of them.
 *
 * No Origin header: a non-browser caller; the cookie is the gate, so true.
 * An Origin that is not a URL: false.
 *
 * lib/__tests__/wiring.test.ts fails when a route under app/ reads the Origin
 * header itself instead of calling this.
 */

type RequestLike = {
  headers: { get(name: string): string | null };
  nextUrl: { host: string };
};

export function allowedOriginHosts(req: RequestLike): Set<string> {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").host);
  } catch {
    /* unset or invalid: the request-derived hosts below */
  }
  const fwd = req.headers.get("x-forwarded-host");
  if (fwd) allowed.add(fwd);
  allowed.add(req.nextUrl.host);
  allowed.delete("");
  return allowed;
}

export function isSameOrigin(req: RequestLike): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return allowedOriginHosts(req).has(originHost);
}
