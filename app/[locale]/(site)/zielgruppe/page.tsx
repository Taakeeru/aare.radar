import type { Metadata } from "next";
import { PageIcon } from "@/components/page-icon";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LOCALE_TAGS, toLocale } from "@/i18n/routing";
import { BarList, type BarRow } from "@/components/bar-list";
import { Panel } from "@/components/panel";
import type { SourceRef } from "@/components/source-line";
import { PLANNED_SOURCES } from "@/lib/planned-sources";
import { loadRadar } from "@/lib/radar";
import { formatInt, outOf100, safeHttpUrl } from "@/lib/radar-view";
import { blocksFor, cantonFigures, formatMonth, statusFigures } from "@/lib/target-group";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("target");
  return { title: t("title") };
}

/**
 * Question D: who the participants are. With the SEM tables in the data file
 * (export `series.D`) it shows head counts, employment rates and cantons;
 * without them it says that data is coming.
 */
export default async function TargetGroupPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale));
  const t = await getTranslations("target");
  const q = await getTranslations("questions");
  const c = await getTranslations("common");
  const locale = toLocale((await params).locale);
  const result = loadRadar();
  const figures = result.ok ? statusFigures(result.data) : [];
  if (result.ok && figures.length > 0) {
    const data = result.data;
    const fmt = (n: number) => formatInt(n, locale);
    const month = (p: string) => formatMonth(p, LOCALE_TAGS[locale]);
    const ref = (id: string, sources: string[]): SourceRef => {
      const b = blocksFor(data, "D").find((x) => sources.includes(x.source));
      return { id, name: b?.name ?? id, url: safeHttpUrl(b?.url), updated: b?.updated ?? null };
    };
    const semWork = [ref("sem_erwerb", figures.map((f) => f.source))];
    const latest = figures.map((f) => f.period).sort().at(-1)!;
    const maxPersons = Math.max(1, ...figures.map((f) => f.persons));
    const peopleRows: BarRow[] = [...figures]
      .sort((a, b) => b.persons - a.persons)
      .map((f) => ({ key: f.status, label: t(`status.${f.status}`), fraction: f.persons / maxPersons, value: t("people.value", { count: fmt(f.persons) }) }));
    const largest = [...figures].sort((a, b) => b.persons - a.persons)[0]!;
    const rated = figures.filter((f) => f.employmentRate !== null).sort((a, b) => b.employmentRate! - a.employmentRate!);
    const workRows: BarRow[] = rated.map((f) => ({
      key: f.status,
      label: t(`status.${f.status}`),
      fraction: f.employmentRate!,
      value: t("work.value", { count: outOf100(f.employmentRate!) }),
    }));
    const cantons = cantonFigures(data);
    const maxCanton = Math.max(1, ...cantons.rows.map((r) => r.persons));
    const cantonRows: BarRow[] = cantons.rows.map((r) => ({ key: r.canton, label: r.canton, fraction: r.persons / maxCanton, value: t("people.value", { count: fmt(r.persons) }) }));
    return (
      <div className="page">
        <header className="page-head">
          <p className="eyebrow eyebrow--icon">
            <PageIcon name="target" />
            {q("D.title")}
          </p>
          <h1 className="page__title">{q("D.question")}</h1>
          <p className="page__lead">{t("leadData")}</p>
        </header>
        <div className="grid">
          <Panel
            id="d-people"
            title={t("people.title")}
            intro={t("people.intro", { month: month(latest) })}
            span={6}
            sources={semWork}
            meaning={t("people.meaning", { status: t(`status.${largest.status}`), count: fmt(largest.persons) })}
          >
            <BarList rows={peopleRows} label={t("people.title")} />
          </Panel>
          {workRows.length > 0 ? (
            <Panel
              id="d-work"
              title={t("work.title")}
              intro={t("work.intro", { month: month(latest) })}
              span={6}
              sources={semWork}
              meaning={
                rated.length > 1
                  ? t("work.meaning", {
                      high: t(`status.${rated[0]!.status}`),
                      highCount: outOf100(rated[0]!.employmentRate!),
                      low: t(`status.${rated.at(-1)!.status}`),
                      lowCount: outOf100(rated.at(-1)!.employmentRate!),
                    })
                  : undefined
              }
            >
              <BarList rows={workRows} label={t("work.title")} />
            </Panel>
          ) : null}
          {cantonRows.length > 0 && cantons.period ? (
            <Panel
              id="d-cantons"
              title={t("cantons.title")}
              intro={t("cantons.intro", { month: month(cantons.period), count: cantonRows.length })}
              span={12}
              sources={[ref("sem_asylprozess", ["sem_asylprozess"])]}
              meaning={t("cantons.meaning", { first: cantons.rows[0]!.canton, count: fmt(cantons.rows[0]!.persons) })}
            >
              <BarList rows={cantonRows} label={t("cantons.title")} />
            </Panel>
          ) : null}
          <section className="panel span-12" aria-labelledby="d-later">
            <h2 id="d-later" className="panel__title">
              {t("laterTitle")}
            </h2>
            <p>{t("later")}</p>
            <p className="note">{t("rule")}</p>
          </section>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow eyebrow--icon">
          <PageIcon name="target" />
            {q("D.title")}
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
