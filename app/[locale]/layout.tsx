import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { DesignSwitcher } from "@/components/design-switcher";
import { BACKGROUNDS, DESIGN_DEFAULT, designStyle, tokenStyle } from "@/lib/design-tokens";
import { SITE_ICONS, SITE_URL } from "@/lib/site-meta";
import { isTestSite } from "@/lib/site-env";

// Pages read the data file (lib/radar.ts, cached for 10 minutes on the server) and the
// session: render on request, never at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("siteName"), template: `%s | ${t("siteName")}` },
    description: t("description"),
    icons: SITE_ICONS,
    manifest: "/manifest.webmanifest",
    // A test deployment (SITE_ENV=test) is never indexed.
    ...(isTestSite() ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: BACKGROUNDS[DESIGN_DEFAULT.bg]!.colors.root,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta" });
  return (
    <html
      lang={locale}
      style={{ ...tokenStyle(), ...designStyle(DESIGN_DEFAULT) } as React.CSSProperties}
      data-mark={DESIGN_DEFAULT.mark}
      data-light={String(BACKGROUNDS[DESIGN_DEFAULT.bg]!.light)}
    >
      <head>
        {/* Self-hosted faces for the design options; a face downloads only when it is chosen. */}
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body>
        <a className="skip-link" href="#inhalt">
          {t("skip")}
        </a>
        {isTestSite() ? (
          <p className="test-banner" data-testid="test-banner">
            {t("testBanner")}
          </p>
        ) : null}
        <NextIntlClientProvider>
          {children}
          <DesignSwitcher />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
