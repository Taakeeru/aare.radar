import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { loadRadar } from "@/lib/radar";
import { formatDate, safeHttpUrl } from "@/lib/radar-view";
import { PLANNED_SOURCES } from "@/lib/planned-sources";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sources");
  return { title: t("title") };
}

const NOT_USED = ["linkedin", "jobsch", "adzuna"] as const;

/**
 * The sources page renders from the export's `sources` array: a source added to
 * the collector appears here without a change in the app. Texts for the known
 * ids are in messages (plain language, both languages); an unknown id shows the
 * export's own `what`.
 */
export default async function SourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("sources");
  const c = await getTranslations("common");
  const tt = await getTranslations("target");
  const result = loadRadar();
  const sources = result.ok ? result.data.sources : [];
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
      </header>

      <section className="panel" aria-labelledby="s-used">
        <h2 id="s-used" className="panel__title">
          {t("usedTitle")}
        </h2>
        {!result.ok ? <p role="alert">{t("noDate")}</p> : null}
        <ul className="sources">
          {sources.map((s) => {
            const url = safeHttpUrl(s.url);
            const gives = t.has(`${s.id}.gives`) ? t(`${s.id}.gives`) : s.what;
            const how = t.has(`${s.id}.how`) ? t(`${s.id}.how`) : t("generic.how");
            return (
              <li key={s.id} className="sources__item">
                <h3 className="sources__name">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {s.name}
                      <span className="sr-only"> ({c("opensNewTab")})</span>
                    </a>
                  ) : (
                    s.name
                  )}
                </h3>
                <dl className="facts">
                  <div>
                    <dt>{t("gives")}</dt>
                    <dd>{gives}</dd>
                  </div>
                  <div>
                    <dt>{t("how")}</dt>
                    <dd>{how}</dd>
                  </div>
                  <div>
                    <dt>{t("updatedLabel")}</dt>
                    <dd>{s.updated ? formatDate(s.updated, locale) : t("noDate")}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel" aria-labelledby="s-not">
        <h2 id="s-not" className="panel__title">
          {t("notUsedTitle")}
        </h2>
        <p>{t("notUsedLead")}</p>
        <ul className="sources">
          {NOT_USED.map((k) => (
            <li key={k} className="sources__item">
              <h3 className="sources__name">{t(`${k}.name`)}</h3>
              <p>{t(`${k}.why`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="s-planned">
        <h2 id="s-planned" className="panel__title">
          {t("planned")}
        </h2>
        <p>{t("plannedLead")}</p>
        <ul className="sources">
          {PLANNED_SOURCES.map((s) => (
            <li key={s.id} className="sources__item">
              <h3 className="sources__name">
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {tt(`${s.id}.name`)}
                  <span className="sr-only"> ({c("opensNewTab")})</span>
                </a>
              </h3>
              <p>{tt(`${s.id}.what`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="s-limits">
        <h2 id="s-limits" className="panel__title">
          {t("limitsTitle")}
        </h2>
        <ul className="plain">
          {(["one", "two", "three"] as const).map((k) => (
            <li key={k}>{t(`limits.${k}`)}</li>
          ))}
        </ul>
        <h3 className="panel__sub">{t("rules.title")}</h3>
        <ul className="plain">
          <li>{t("rules.one")}</li>
          <li>{t("rules.two")}</li>
        </ul>
      </section>
    </div>
  );
}
