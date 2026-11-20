import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand";
import { LocaleSwitch } from "@/components/locale-switch";
import { Link } from "@/i18n/navigation";

/** Header with the one gradient rule, the page, and the footer. Used by every public page. */
export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const f = await getTranslations("footer");
  return (
    <>
      <header className="site-header">
        <div className="site-header__row wrap">
          <Link href="/" className="site-header__home" aria-label="Powercoders Job Radar">
            <Brand />
          </Link>
          <LocaleSwitch />
        </div>
        <div className="accent-rule" aria-hidden="true" />
      </header>
      <main id="inhalt" className="wrap main">
        {children}
      </main>
      <footer className="site-footer">
        <div className="wrap site-footer__row">
          <p>{f("note")}</p>
          <ul>
            <li>
              <Link href="/login">{f("login")}</Link>
            </li>
          </ul>
        </div>
      </footer>
    </>
  );
}
