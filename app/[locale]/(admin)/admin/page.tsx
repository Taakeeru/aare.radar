import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { requireAdminOrRedirect } from "@/lib/admin-guard";
import { logoutAction } from "../login/actions";
import { ADMIN_AREAS } from "./areas";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

/**
 * The team's start page: the way to the other areas. The guard runs on the
 * server for this page (and for every page and action under /admin): signed in,
 * an admin, second factor passed when the account has one.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const { user, totpMissing } = await requireAdminOrRedirect(locale, `/${locale}/admin`);
  const t = await getTranslations("admin");
  return (
    <>
      <div className="admin-head">
        <h1 className="h-admin">{t("title")}</h1>
        <form action={logoutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn btn--outline">
            {t("logout")}
          </button>
        </form>
      </div>
      <p className="muted">{t("signedInAs", { email: user.email })}</p>
      {totpMissing ? (
        <p className="notice">
          {t("totpMissing")} <Link href="/admin/sicherheit">{t("security")}</Link>
        </p>
      ) : null}

      <section className="panel" aria-labelledby="areas-title">
        <h2 id="areas-title" className="panel__title">
          {t("areas")}
        </h2>
        <ul className="admin-links">
          {ADMIN_AREAS.map((a) => (
            <li key={a.href}>
              <Link href={a.href}>{t(a.label)}</Link>
            </li>
          ))}
          <li>
            <Link href="/">{t("toSite")}</Link>
          </li>
        </ul>
      </section>
    </>
  );
}
