import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { VolunteerMap } from "@/components/volunteer-map";
import { toLocale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("volunteers");
  return { title: t("title") };
}

/** «Volunteers» concept (21.11.2026, Isabella): where IT experts who could teach at Powercoders are. FICTIONAL profiles. */
export default async function VolunteersPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale));
  const t = await getTranslations("volunteers");
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
        <p className="notice" role="note">
          <strong>{t("conceptTitle")}</strong> {t("concept")}
        </p>
      </header>
      <VolunteerMap />
    </div>
  );
}
