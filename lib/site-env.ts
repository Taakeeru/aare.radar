/**
 * A test deployment: SITE_ENV=test, set ONLY by a test compose file, never by
 * the production one. It changes three things in the app: a «Testumgebung» band
 * on every page, noindex in the page metadata, and a boot guard that refuses
 * mail credentials (a test site must never write to real people).
 */
export type Env = Record<string, string | undefined>;

export function isTestSite(env: Env = process.env): boolean {
  return (env.SITE_ENV ?? "").trim() === "test";
}
