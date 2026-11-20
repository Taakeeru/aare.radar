import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/site-chrome";
import { toLocale } from "@/i18n/routing";
import { ensureDb } from "@/lib/db";

/**
 * The public pages. They read the JSON data file, not the database, but opening
 * the database here (migrations run on open) keeps the CI recipe working:
 * Pandora's client CI loads one public page, then adds the demo admin.
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale));
  ensureDb();
  return <SiteChrome>{children}</SiteChrome>;
}
