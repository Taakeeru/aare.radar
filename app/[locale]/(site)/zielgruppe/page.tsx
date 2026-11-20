import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { PLANNED_SOURCES } from "@/lib/planned-sources";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("target");
  return { title: t("title") };
}

/** Question D: who the participants are. v1 has no data for it, and says so. */
export default async function TargetGroupPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale));
  const t = await getTranslations("target");
  const q = await getTranslations("questions");
  const c = await getTranslations("common");
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">
          {c("sectionOf", { letter: "D" })}: {q("D.title")}
        </p>
        <h1 className="page__title">{q("D.question")}</h1>
        <p className="page__lead">{t("lead")}</p>
      </header>
      <section className="panel" aria-labelledby="d-status">
        <h2 id="d-status" className="panel__title">
          <span className="tag tag--warning">
            <span className="tag__dot" aria-hidden="true" />
            {t("statusTitle")}
          </span>
        </h2>
        <p>{t("statusText")}</p>
        <h3 className="panel__sub">{t("showTitle")}</h3>
        <ul className="plain">
          {(["status", "origin", "canton", "labour"] as const).map((k) => (
            <li key={k}>{t(`show.${k}`)}</li>
          ))}
        </ul>
        <h3 className="panel__sub">{t("plannedTitle")}</h3>
        <ul className="sources">
          {PLANNED_SOURCES.map((s) => (
            <li key={s.id} className="sources__item">
              <p className="sources__name">
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {t(`${s.id}.name`)}
                  <span className="sr-only"> ({c("opensNewTab")})</span>
                </a>
              </p>
              <p>{t(`${s.id}.what`)}</p>
            </li>
          ))}
        </ul>
        <p className="note">{t("rule")}</p>
      </section>
    </div>
  );
}
