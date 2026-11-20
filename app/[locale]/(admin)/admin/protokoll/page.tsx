import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LOCALE_TAGS, toLocale } from "@/i18n/routing";
import { requireAdminOrRedirect } from "@/lib/admin-guard";
import { recentAuditRows } from "@/lib/admin-audit";

/**
 * /{locale}/admin/protokoll — the admin audit log, newest first (the idea of
 * The template app/[locale]/admin/audit/page.tsx, for this app's one log). Read-only.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("protocol");
  return { title: t("title") };
}

export default async function ProtocolPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdminOrRedirect(locale, `/${locale}/admin/protokoll`);
  const t = await getTranslations("protocol");
  const a = await getTranslations("admin");
  const rows = recentAuditRows();
  const when = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });
  return (
    <>
      <Link href="/admin">{a("title")}</Link>
      <h1 className="h-admin">{t("title")}</h1>
      <p>{t("intro")}</p>
      {rows.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <div className="audit-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th scope="col">{t("when")}</th>
                <th scope="col">{t("who")}</th>
                <th scope="col">{t("what")}</th>
                <th scope="col">{t("target")}</th>
                <th scope="col">{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label={t("when")}>{when.format(new Date(r.createdAt))}</td>
                  <td data-label={t("who")}>{r.adminEmail}</td>
                  <td data-label={t("what")}>{r.action}</td>
                  <td data-label={t("target")}>
                    {r.targetType} {r.targetId}
                  </td>
                  <td data-label={t("details")}>{[r.detail, r.change].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
