/**
 * Which pages send only their origin as Referer. Ported from the client
 * template's lib/referrer-policy.ts, with this app's one token page.
 *
 * A page whose URL carries a secret (the password reset `/auth/passwort-neu?t=`)
 * would otherwise put that URL into the Referer of every request it makes: its
 * scripts, its styles, the POST of its own button. A proxy that logs request
 * headers would then log the token. With `strict-origin` the browser sends only
 * the origin from those pages: no path, no query, so no token.
 *
 * NOT `no-referrer`: a document's policy survives client-side navigation, and
 * under `no-referrer` a form POST of the NEXT page carries `Origin: null`, which
 * Next's server-action check rejects as a cross-site request.
 *
 * Two layers set the header, from this one list: middleware.ts and
 * next.config.ts (`tokenPageHeaderRoutes()`), so neither layer's order decides
 * the answer.
 */

export const TOKEN_PAGE_REFERRER_POLICY = "strict-origin";
export const DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin";

/**
 * Pages that are opened with a secret in the URL, without the locale prefix.
 * A listed page also covers everything below it (`/einladung/<token>`).
 * lib/__tests__/referrer-policy.test.ts fails when a link builder or a
 * `[token]` route lands on a page that is not listed here.
 */
export const TOKEN_URL_PAGES = ["/auth/passwort-neu"] as const;

/** Query parameters that carry a secret anywhere on the site. */
export const SECRET_QUERY_PARAMS = ["t", "token"] as const;

const LOCALE_PREFIX = /^\/(?:de|it|fr|en)(?=\/|$)/;

/** The Referrer-Policy a response for this URL must carry. */
export function referrerPolicyFor(pathname: string, searchParams?: URLSearchParams): string {
  const path = pathname.replace(LOCALE_PREFIX, "").replace(/\/+$/, "") || "/";
  if (TOKEN_URL_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return TOKEN_PAGE_REFERRER_POLICY;
  if (searchParams && SECRET_QUERY_PARAMS.some((k) => searchParams.has(k))) return TOKEN_PAGE_REFERRER_POLICY;
  return DEFAULT_REFERRER_POLICY;
}

/**
 * A pathname that is safe to log: below a token page the rest is replaced by
 * «[token]» , because a path
 * token is as much a secret as `?t=`.
 */
export function logPath(pathname: string): string {
  const prefix = pathname.match(LOCALE_PREFIX)?.[0] ?? "";
  const path = pathname.slice(prefix.length);
  for (const page of TOKEN_URL_PAGES) {
    if (path.startsWith(`${page}/`) && path.length > page.length + 1) return `${prefix}${page}/[token]`;
  }
  return pathname;
}

/**
 * The same answer as next.config.ts `headers()` entries, for the listed pages
 * (with and without a locale prefix) and for any URL with a secret query
 * parameter. They must come AFTER the site-wide entry: Next applies the header
 * entries in order and the later one wins.
 */
export function tokenPageHeaderRoutes(): Array<{
  source: string;
  has?: Array<{ type: "query"; key: string }>;
  headers: Array<{ key: string; value: string }>;
}> {
  const headers = [{ key: "Referrer-Policy", value: TOKEN_PAGE_REFERRER_POLICY }];
  const routes: Array<{
    source: string;
    has?: Array<{ type: "query"; key: string }>;
    headers: Array<{ key: string; value: string }>;
  }> = [];
  for (const page of TOKEN_URL_PAGES) {
    routes.push({ source: `${page}/:rest*`, headers });
    routes.push({ source: `/:locale(de|it|fr|en)${page}/:rest*`, headers });
  }
  for (const key of SECRET_QUERY_PARAMS) {
    routes.push({ source: "/:path*", has: [{ type: "query", key }], headers });
  }
  return routes;
}
