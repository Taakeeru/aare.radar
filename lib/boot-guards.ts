/**
 * Boot-time interlocks, the pattern of the client template lib/boot-guards.ts
 *: called from instrumentation.ts register(); a violation crashes
 * the container before it serves a single request. Pure function of the env it
 * is handed, so the matrix is unit-testable without booting Next.
 *
 * Production = APP_ENV=production on a server that is not a demo instance
 * (Pandora's CI runs the production build with DEMO_INSTANCE=1 and a demo
 * admin; that combination is a test bench, not the production site).
 */
import { isTestSite } from "@/lib/site-env";

export type Env = Record<string, string | undefined>;

export function isProduction(env: Env): boolean {
  return (env.APP_ENV ?? "").trim() === "production" && env.DEMO_INSTANCE !== "1";
}

/** Every reason to refuse the boot; empty = fine. */
export function bootProblems(env: Env = process.env): string[] {
  const out: string[] = [];
  // Anything secret-looking under NEXT_PUBLIC_ is compiled into the browser bundle (the template: Payrexx keys).
  const exposed = Object.keys(env).filter(
    (k) => /^NEXT_PUBLIC_.*(SECRET|PASS|TOKEN|KEY|SMTP|AUTH)/i.test(k) && (env[k] ?? "").trim() !== "",
  );
  if (exposed.length > 0) {
    out.push(`Secret values must never be NEXT_PUBLIC_* (found: ${exposed.join(", ")}): they would be compiled into the browser bundle.`);
  }
  if (isProduction(env)) {
    if ((env.AUTH_SECRET ?? "").length < 32) out.push("AUTH_SECRET is missing or shorter than 32 characters (openssl rand -hex 32).");
    if (env.TRUST_PROXY !== "true") {
      out.push(
        "TRUST_PROXY=true is required in production (the site runs behind Caddy, which sets X-Real-IP). " +
          "Without it every visitor shares one sign-in rate-limit bucket.",
      );
    }
    if ((env.EMAIL_STUB ?? "") === "true") out.push("EMAIL_STUB=true must not be set in production.");
  }
  // The test environment never sends mail: no SMTP server may be configured there (the template staging rule).
  if (isTestSite(env) && ((env.SMTP_HOST ?? "").trim() !== "" || (env.SMTP_PASS ?? "").trim() !== "")) {
    out.push("SITE_ENV=test must not have SMTP_HOST or SMTP_PASS: the test environment never sends mail.");
  }
  return out;
}

export function assertBootInterlocks(env: Env = process.env): void {
  const problems = bootProblems(env);
  if (problems.length > 0) throw new Error(`Refusing to boot: ${problems.join(" ")}`);
}
