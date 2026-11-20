import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { requireAdminOrRedirect } from "@/lib/admin-guard";
import { dataFilePath, loadRadar } from "@/lib/radar";
import { ageInDays, formatDate, formatDateTime, formatInt, freshness, safeHttpUrl, sectorSeries } from "@/lib/radar-view";
import { logoutAction } from "../login/actions";
import { ADMIN_AREAS } from "./areas";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

/**
 * The team's start page: the data status ("Datenstand") and the way to the
 * other areas. The guard runs on the server for this page (and for every page
 * and action under /admin): signed in, an admin, second factor passed when the
 * account has one.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const { user, totpMissing } = await requireAdminOrRedirect(locale, `/${locale}/admin`);
  const t = await getTranslations("admin");
  const rolesT = await getTranslations("roles");
  const result = loadRadar();
  const file = result.ok ? result.file : dataFilePath();
  const fileName = file.split("/").pop() ?? file;
  const level = (d: number | null) => freshness(d);

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

      <section className="panel" aria-labelledby="state-title">
        <h2 id="state-title" className="panel__title">
          {t("stateTitle")}
        </h2>
        <p className="panel__intro">{t("stateIntro")}</p>
        {!result.ok ? (
          <p className="form-error" role="alert">
            {t("dataError", { error: result.error })}
          </p>
        ) : (
          <>
            <dl className="facts facts--grid">
              <div>
                <dt>{t("generatedAt")}</dt>
                <dd>{formatDateTime(result.data.generated_at, locale)}</dd>
              </div>
              <div>
                <dt>{t("windowDays")}</dt>
                <dd>{t("windowValue", { days: result.data.window_days })}</dd>
              </div>
              <div>
                <dt>{t("file")}</dt>
                <dd>{fileName}</dd>
              </div>
            </dl>
            <p className="note">{t("cacheNote")}</p>

            <h3 className="panel__sub">{t("adsPerRole")}</h3>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t("role")}</th>
                    <th scope="col" className="num">
                      {t("adsCount")}
                    </th>
                    <th scope="col" className="num">
                      {t("weeks")}
                    </th>
                    <th scope="col" className="num">
                      {t("skills")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.roles.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{rolesT.has(r.id) ? rolesT(r.id) : r.label}</th>
                      <td className="num">{formatInt(r.ads, locale)}</td>
                      <td className="num">{r.weekly.length}</td>
                      <td className="num">{r.skills.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="panel__sub">{t("sourcesTitle")}</h3>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t("source")}</th>
                    <th scope="col">{t("updated")}</th>
                    <th scope="col">{t("age")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.sources.map((s) => {
                    const days = ageInDays(s.updated);
                    const f = level(days);
                    const url = safeHttpUrl(s.url);
                    return (
                      <tr key={s.id}>
                        <th scope="row">
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              {s.name}
                            </a>
                          ) : (
                            s.name
                          )}
                        </th>
                        <td>{s.updated ? formatDate(s.updated, locale) : t("unknown")}</td>
                        <td>
                          <span className={`tag tag--${f === "fresh" ? "healthy" : f === "aging" ? "warning" : f === "old" ? "critical" : "link"}`}>
                            <span className="tag__dot" aria-hidden="true" />
                            {days === null ? t("unknown") : `${t("ageDays", { days })}, ${t(f === "fresh" ? "fresh" : f === "aging" ? "aging" : "old")}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">{t("sourcesFromExport")}</p>

            <h3 className="panel__sub">{t("otherData")}</h3>
            <dl className="facts facts--grid">
              <div>
                <dt>{t("sectorPoints")}</dt>
                <dd>
                  {result.data.sector.length}
                  {(() => {
                    const s = sectorSeries(result.data.sector);
                    const last = s?.points[s.points.length - 1];
                    return last ? ` (${t("latestPeriod")}: ${last.period})` : "";
                  })()}
                </dd>
              </div>
              <div>
                <dt>{t("policyItems")}</dt>
                <dd>{result.data.policy.length}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

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
