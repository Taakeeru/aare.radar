import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/site-chrome";
import { toLocale } from "@/i18n/routing";

/**
 * The public pages. They read the JSON data file, not the database, but opening
 * the database here (migrations run on open) keeps the CI recipe working:
 * Pandora's client CI loads one public page, then adds the demo admin.
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale));
  // The public pages read the JSON file. Opening SQLite here keeps the old CI
  // recipe (load a page, then add the demo admin). On Vercel the native module
  // or the disk can fail; that must not blank the dashboard.
  try {
    const { ensureDb } = await import("@/lib/db");
    ensureDb();
  } catch (e) {
    console.error("[db] could not load the database module:", e instanceof Error ? e.message : "unknown error");
  }
  return <SiteChrome>{children}</SiteChrome>;
}
