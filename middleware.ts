import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { contentSecurityPolicy } from "@/lib/csp";
import { logPath, referrerPolicyFor } from "@/lib/referrer-policy";
import { logError, logStack } from "@/lib/log-redact";

/**
 * Locale routing, the per-request CSP nonce, the Referrer-Policy and the
 * admin/auth no-index and no-store headers. Structure ported from the client
 * template's middleware.ts, without its CORS preflight, data-check path header
 * and host pages.
 *
 * Middleware never decides who may see an admin page: every admin page and
 * action checks the session on the server (lib/admin-guard.ts).
 */
const intlMiddleware = createMiddleware(routing);

/** Pages of the team's area and the sign-in steps: never indexed, never cached. */
const PRIVATE_PATH = /^\/(?:de|it|fr|en)\/(?:admin|login|auth|passwort-vergessen)(?:\/|$)/;

export default function middleware(request: NextRequest) {
  try {
    return handleMiddleware(request);
  } catch (err) {
    console.error("[middleware] Unhandled error:", {
      message: logError(err),
      stack: logStack(err),
      path: logPath(request.nextUrl.pathname),
      method: request.method,
      timestamp: new Date().toISOString(),
    });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

function handleMiddleware(request: NextRequest) {
  // 1. The nonce goes on the REQUEST headers (x-nonce and the CSP itself), so
  //    Next stamps it on its own inline scripts while rendering.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // 2. next-intl: / → /de. A redirect from a path WITHOUT a locale prefix is
  //    permanent (308), except «/», whose target may depend on the visitor
  //    once more languages are on (the template round 13, B24).
  const intlResponse = intlMiddleware(new NextRequest(request, { headers: requestHeaders }));
  let response = intlResponse ?? NextResponse.next({ request: { headers: requestHeaders } });
  if (response.status === 307) {
    const location = response.headers.get("Location");
    const srcPath = request.nextUrl.pathname;
    const srcHasLocale = routing.locales.some((l) => srcPath === `/${l}` || srcPath.startsWith(`/${l}/`));
    if (location && !srcHasLocale && srcPath !== "/") response = NextResponse.redirect(location, { status: 308 });
  }

  // 3. Headers on every page response.
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", referrerPolicyFor(request.nextUrl.pathname, request.nextUrl.searchParams));
  if (PRIVATE_PATH.test(request.nextUrl.pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension
  // (favicon.ico, /fotos/*.jpg). This app has no path-token pages (the template lists its
  // dotted «/einladung/<payload>.<sig>» pages here too); the reset token is a
  // query parameter, which this entry covers.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
