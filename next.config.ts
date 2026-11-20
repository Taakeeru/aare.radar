import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { DEFAULT_REFERRER_POLICY, tokenPageHeaderRoutes } from "./lib/referrer-policy";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Security headers on every response (the client template next.config.ts at
 * d0ef2c59). The CSP, with its per-request nonce, is set in middleware.ts.
 * HSTS is set here AND by the Caddy in front (the same value): the app does
 * not depend on the proxy for it.
 */
export const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: DEFAULT_REFERRER_POLICY },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // SQLite via better-sqlite3 needs the Node runtime and its native module.
  serverExternalPackages: ["better-sqlite3"],
  // Self-contained server bundle for the Docker image (Dockerfile, runner stage).
  output: "standalone",
  // The migration SQL files (lib/db.ts) are read at runtime: trace them into the bundle.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/migrations/**/*"],
  },
  images: {
    // The app shows no photos.
    unoptimized: true,
  },
  // Server actions keep Next's own Origin check (Origin must match Host or
  // X-Forwarded-Host). Never widen it with experimental.serverActions.allowedOrigins
  // (lib/__tests__/csrf.test.ts).
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Pages opened with a secret in the URL send only their origin as
      // Referer. After the site-wide entry, so these win (lib/referrer-policy.ts).
      ...tokenPageHeaderRoutes(),
    ];
  },
};

export default withNextIntl(nextConfig);
