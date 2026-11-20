/**
 * The site's Content-Security-Policy (set per request in middleware.ts, with a
 * nonce, as in the client template). Everything comes from the site itself:
 * no script, style, font, image or frame from another origin. Links to the
 * sources are ordinary navigation and are not restricted by this policy.
 *
 *   - script-src: the nonce and 'strict-dynamic', never 'unsafe-inline' or
 *     'unsafe-eval' (not in development either);
 *   - style-src 'unsafe-inline': inline style ATTRIBUTES (the token variables on
 *     <html>, the bar lengths) cannot carry a nonce. No user input is ever
 *     written into a style attribute;
 *   - frame-ancestors 'none' (with X-Frame-Options DENY from next.config.ts),
 *     frame-src 'none', form-action 'self', base-uri 'self', object-src 'none'.
 *
 * Guard: lib/__tests__/security-headers.test.ts.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
