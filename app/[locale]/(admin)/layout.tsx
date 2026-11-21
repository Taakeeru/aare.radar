import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Brand } from "@/components/brand";
import { LocaleSwitch } from "@/components/locale-switch";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The team's area (app frame): the sign-in steps and /admin. Same wordmark and language picker, no public navigation. */
export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <>
      <header className="site-header site-header--app">
        <div className="site-header__row wrap">
          <Link href="/" className="site-header__home" aria-label="AareRadar">
            <Brand />
          </Link>
          <LocaleSwitch />
        </div>
        <div className="accent-rule" aria-hidden="true" />
      </header>
      <main id="inhalt" className="wrap main app-frame">
        {children}
      </main>
    </>
  );
}
