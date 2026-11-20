import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { requireAdminOrRedirect } from "@/lib/admin-guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("reportsTitle") };
}

/**
 * Placeholder for the planned "Berichte" (email summaries per topic, managed
 * here). It stores and sends nothing yet; the page exists so the admin area
 * has its place ready (admin/areas.ts).
 */
export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdminOrRedirect(locale, `/${locale}/admin/berichte`);
  const t = await getTranslations("admin");
  return (
    <>
      <Link href="/admin">{t("back")}</Link>
      <h1 className="h-admin">{t("reportsTitle")}</h1>
      <p>{t("reportsIntro")}</p>
      <p className="notice">{t("reportsSoon")}</p>
    </>
  );
}
