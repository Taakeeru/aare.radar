import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BarChart, type ChartBar } from "@/components/bar-chart";
import { BarList, type BarRow } from "@/components/bar-list";
import { JobSelect } from "@/components/job-select";
import { Panel } from "@/components/panel";
import { toLocale } from "@/i18n/routing";
import { loadRadar, type CompanyCount, type ItDetail, type SkillShare } from "@/lib/radar";
import { formatInt, nextQuarterEstimate, outOf100, parsePeriod, percentChange, pickSources, sectorSeries, yearBefore } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("title") };
}

/**
 * The start page (21.11.2026, Isabella's brief): the Swiss IT job market at a glance, and a list of every IT job.
 * No job chosen: the market (federal statistics with an estimate for the next quarter, all IT ads, the jobs most
 * open to beginners, skills, companies). A job chosen (?job=<code>): its open ads, weekly demand, required skills
 * (most asked first) and the companies hiring. The three-role view lives on /nachfrage.
 */
export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ job?: string | string[] }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("home");
  const d = await getTranslations("dash");
  const c = await getTranslations("common");
  const result = loadRadar();
  if (!result.ok || !result.data.it_market) {
    return (
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <section className="panel" role="alert">
          <h2 className="panel__title">{d("unavailableTitle")}</h2>
          <p>{d("unavailableText")}</p>
        </section>
      </div>
    );
  }
  const data = result.data;
  const it = data.it_market!;
  const fmt = (n: number) => formatInt(n, locale);
  const jobroom = pickSources(data, ["jobroom"]);
  const bfs = pickSources(data, ["bfs"]);
  const name = (x: { label_en: string; label_de: string }) => (locale === "de" ? x.label_de : x.label_en);
  const jobs = [...it.occupations].sort((a, b) => name(a).localeCompare(name(b), locale));
  const wanted = typeof sp.job === "string" ? sp.job : "";
  const job = it.occupations.find((o) => o.code === wanted) ?? null;

  const skillRows = (s: SkillShare[] | undefined): BarRow[] =>
    (s ?? []).slice(0, 10).map((x) => ({ key: x.skill, label: x.skill, fraction: x.share, value: c("ofHundred", { count: outOf100(x.share) }) }));
  const companyRows = (e: CompanyCount[] | undefined): BarRow[] => {
    const max = Math.max(1, ...(e ?? []).map((x) => x.ads));
    return (e ?? []).map((x) => ({ key: x.company, label: x.company, fraction: x.ads / max, value: c("ads", { count: x.ads }) }));
  };
  const weekBars = (w: ItDetail["weekly"]): ChartBar[] => {
    const last = (w ?? []).slice(-9);
    return last.map((p, i) => ({
      key: p.week,
      value: p.new_ads,
      label: `W${p.week.slice(-2)}`,
      description: p.week,
      partial: i === last.length - 1,
    }));
  };

  const header = (
    <header className="page-head">
      <h1 className="page__title">{job ? name(job) : t("title")}</h1>
      <p className="page__lead">{job ? t("jobLead", { days: data.window_days }) : t("lead")}</p>
      <JobSelect jobs={jobs.map((j) => ({ code: j.code, label: `${name(j)} (${fmt(j.ads)})` }))} current={job?.code ?? ""} label={t("pick")} all={t("all")} show={t("show")} />
    </header>
  );

  if (job) {
    const entry = job.entry_ads ?? 0;
    const skills = job.skills ?? [];
    const employers = job.employers ?? [];
    const bars = weekBars(job.weekly);
    return (
      <div className="page">
        {header}
        <div className="grid">
          <Panel id="p-job-open" title={t("open.title")} span={4} sources={jobroom} meaning={t("open.meaning", { entry: fmt(entry), ads: fmt(job.ads) })}>
            <p className="stat">
              <span className="stat__n">{fmt(job.ads)}</span>
              <span className="stat__c">{t("open.caption", { days: data.window_days })}</span>
            </p>
            <p className="note">{t("open.entry", { entry: fmt(entry) })}</p>
          </Panel>
          <Panel id="p-job-trend" title={t("trend.title")} span={8} sources={jobroom} meaning={t("trend.meaning")}>
            {bars.length > 0 ? <BarChart bars={bars} yTitle={t("trend.yAxis")} xTitle={t("trend.xAxis")} caption={t("trend.title")} showValues format={fmt} /> : <p>{c("noData")}</p>}
            <p className="note">{t("trend.caveat")}</p>
          </Panel>
          <Panel
            id="p-job-skills"
            title={t("skills.title")}
            intro={t("skills.intro")}
            span={7}
            sources={jobroom}
            meaning={skills.length >= 3 ? t("skills.meaning", { first: skills[0]!.skill, second: skills[1]!.skill, third: skills[2]!.skill }) : t("skills.meaningShort")}
          >
            {skills.length > 0 ? <BarList rows={skillRows(skills)} label={t("skills.title")} /> : <p>{c("noData")}</p>}
            <p className="note">{t("skills.basis", { n: fmt(job.skills_basis ?? 0) })}</p>
          </Panel>
          <Panel id="p-job-employers" title={t("employers.title")} span={5} sources={jobroom} meaning={employers.length > 0 ? t("employers.meaning", { first: employers[0]!.company }) : t("employers.none")}>
            {employers.length > 0 ? <BarList rows={companyRows(employers)} label={t("employers.title")} /> : <p>{t("employers.none")}</p>}
            {(job.entry_employers ?? []).length > 0 ? (
              <p className="note company-names">{t("employers.entry", { list: (job.entry_employers ?? []).map((e) => e.company).join(", ") })}</p>
            ) : null}
          </Panel>
        </div>
      </div>
    );
  }

  // The market at a glance
  const sector = sectorSeries(data.sector);
  const latest = sector?.points[sector.points.length - 1];
  const before = sector && latest ? yearBefore(sector.points, latest.period) : null;
  const estimate = sector ? nextQuarterEstimate(sector.points) : null;
  const sectorBars: ChartBar[] = [
    ...(sector?.points ?? []).map((p) => {
      const { year, quarter } = parsePeriod(p.period);
      return { key: p.period, value: p.value, label: quarter === 1 ? String(year) : "", description: `${year} Q${quarter}` };
    }),
    ...(estimate
      ? [{ key: `est-${estimate.period}`, value: estimate.value, label: "", description: `${parsePeriod(estimate.period).year} Q${parsePeriod(estimate.period).quarter} (${t("glance.estimateWord")})`, partial: true }]
      : []),
  ];
  const entryJobs = [...it.occupations].filter((o) => (o.entry_ads ?? 0) > 0).sort((a, b) => (b.entry_ads ?? 0) - (a.entry_ads ?? 0)).slice(0, 8);
  const entryRows: BarRow[] = entryJobs.map((o) => ({
    key: o.code,
    label: name(o),
    fraction: (o.entry_ads ?? 0) / Math.max(1, entryJobs[0]!.entry_ads ?? 0),
    value: d("allIt.entryOf", { entry: fmt(o.entry_ads ?? 0), ads: fmt(o.ads) }),
    tone: "healthy",
  }));
  const skills = it.skills ?? [];
  const employers = it.employers ?? [];
  return (
    <div className="page">
      {header}
      <div className="grid">
        <Panel
          id="p-glance-bfs"
          title={t("glance.title")}
          intro={t("glance.intro")}
          span={8}
          sources={bfs}
          meaning={
            latest
              ? `${before ? t("glance.meaning", { now: fmt(latest.value), before: fmt(before.value), percent: percentChange(latest.value, before.value) }) : ""} ${estimate ? t("glance.estimate", { value: fmt(estimate.value), quarter: parsePeriod(estimate.period).quarter, year: parsePeriod(estimate.period).year }) : ""}`.trim()
              : d("sector.empty")
          }
        >
          {latest ? (
            <>
              <p className="stat">
                <span className="stat__n">{fmt(latest.value)}</span>
                <span className="stat__c">{d("sector.latest", { quarter: parsePeriod(latest.period).quarter, year: parsePeriod(latest.period).year })}</span>
              </p>
              <BarChart bars={sectorBars} yTitle={d("sector.yAxis")} xTitle={d("sector.xAxis")} caption={t("glance.title")} format={fmt} />
              {estimate ? <p className="note">{t("glance.estimateHow")}</p> : null}
            </>
          ) : (
            <p>{d("sector.empty")}</p>
          )}
        </Panel>
        <Panel id="p-glance-ads" title={t("ads.title")} span={4} sources={jobroom} meaning={t("ads.meaning", { entry: fmt(it.entry_ads ?? 0), ads: fmt(it.ads) })}>
          <p className="stat">
            <span className="stat__n">{fmt(it.ads)}</span>
            <span className="stat__c">{d("allIt.caption", { days: data.window_days, jobs: it.occupations.length })}</span>
          </p>
          <p className="stat">
            <span className="stat__n">{fmt(it.entry_ads ?? 0)}</span>
            <span className="stat__c">{t("ads.entryCaption")}</span>
          </p>
        </Panel>
        <Panel
          id="p-glance-entry"
          title={d("allIt.jobsTitle")}
          span={6}
          sources={jobroom}
          meaning={entryJobs.length >= 2 ? d("allIt.jobsMeaning", { first: name(entryJobs[0]!), firstN: fmt(entryJobs[0]!.entry_ads ?? 0), second: name(entryJobs[1]!) }) : d("allIt.jobsMeaningShort")}
        >
          {entryRows.length > 0 ? <BarList rows={entryRows} label={d("allIt.jobsTitle")} /> : <p>{d("allIt.jobsEmpty")}</p>}
          <p className="note">{d("allIt.entryHow")}</p>
        </Panel>
        <Panel
          id="p-glance-skills"
          title={t("skills.titleAll")}
          intro={t("skills.intro")}
          span={6}
          sources={jobroom}
          meaning={skills.length >= 3 ? t("skills.meaningAll", { first: skills[0]!.skill, second: skills[1]!.skill, third: skills[2]!.skill }) : t("skills.meaningShort")}
        >
          {skills.length > 0 ? <BarList rows={skillRows(skills)} label={t("skills.titleAll")} /> : <p>{c("noData")}</p>}
          <p className="note">{t("skills.basis", { n: fmt(it.skills_basis ?? 0) })}</p>
        </Panel>
        <Panel id="p-glance-employers" title={t("employers.titleAll")} span={12} sources={jobroom} meaning={employers.length > 0 ? t("employers.meaning", { first: employers[0]!.company }) : t("employers.none")}>
          {employers.length > 0 ? <BarList rows={companyRows(employers)} label={t("employers.titleAll")} /> : <p>{t("employers.none")}</p>}
          {(it.entry_employers ?? []).length > 0 ? <p className="note company-names">{t("employers.entry", { list: (it.entry_employers ?? []).map((e) => e.company).join(", ") })}</p> : null}
        </Panel>
      </div>
    </div>
  );
}
