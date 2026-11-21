import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BarChart, type ChartBar } from "@/components/bar-chart";
import { BarList, type BarRow } from "@/components/bar-list";
import { Donut, type Slice } from "@/components/donut";
import { PageIcon } from "@/components/page-icon";
import { Panel } from "@/components/panel";
import { toLocale } from "@/i18n/routing";
import { loadRadar } from "@/lib/radar";
import { cantonName, formatInt, outOf100, pickSources, safeHttpUrl } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("overview");
  return { title: t("title") };
}

const REQS = ["senior_experience", "degree_required", "german_required", "french_required"] as const;

/** «Overview» (Seckin, panel thread 58, 21.11.2026): six cards from his sketch, in the site's design, from our data. */
export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("overview");
  const d = await getTranslations("dash");
  const c = await getTranslations("common");
  const result = loadRadar();
  const it = result.ok ? result.data.it_market : undefined;
  const ov = it?.overview;
  if (!result.ok || !it || !ov) {
    return (
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <p>{c("noData")}</p>
      </div>
    );
  }
  const data = result.data;
  const fmt = (n: number) => formatInt(n, locale);
  const jobroom = pickSources(data, ["jobroom"]);
  const courseSrc = [{ id: "courses", name: d("teach.source"), url: "https://powercoders.org/programs/", updated: "2026-11-21" }];

  // 1 and 2: donuts, slices = share of the mentions among the six skills shown (an ad names several skills)
  const sk = (it.skills ?? []).slice(0, 6);
  const skillSlices: Slice[] = sk.map((s) => ({ key: s.skill, label: s.skill, value: s.count }));
  const es = ov.entry_skills.slice(0, 6);
  const teachSlices: Slice[] = es.map((s) => ({ key: s.skill, label: s.skill, value: s.count }));
  // 3: skills by number of ads (the window), bars
  const evo: ChartBar[] = (it.skills ?? []).slice(0, 5).map((s) => ({ key: s.skill, value: s.count, label: s.skill, description: s.skill }));
  // 4: entry requirements
  const reqRows: BarRow[] = REQS.map((k) => ({
    key: k,
    label: t(`req.${k}`),
    fraction: ov.requirements[k] ?? 0,
    value: c("ofHundred", { count: outOf100(ov.requirements[k] ?? 0) }),
  }));
  // 5: cantons
  const cantons = it.cantons.slice(0, 5);
  const cantonRows: BarRow[] = cantons.map((x) => ({ key: x.canton, label: cantonName(x.canton, locale), fraction: x.count / Math.max(1, cantons[0]!.count), value: c("ads", { count: x.count }) }));
  // 6: newest beginner ads
  const today = data.generated_at.slice(0, 10);
  const ago = (iso: string) => {
    const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000));
    return days === 0 ? t("today") : days === 1 ? t("yesterday") : t("daysAgo", { n: days });
  };

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow eyebrow--icon">
          <PageIcon name="overview" />
          {t("eyebrow")}
        </p>
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead", { ads: fmt(it.ads), entry: fmt(it.entry_ads ?? 0) })}</p>
      </header>
      <div className="grid">
        <Panel id="o-skills" title={t("skills.title")} intro={t("skills.intro")} span={4} sources={jobroom}>
          <span className="tag-chip">{t("skills.chip")}</span>
          <Donut slices={skillSlices} label={t("skills.title")} center="100%" />
        </Panel>
        <Panel id="o-teach" title={t("teach.title")} intro={t("teach.intro", { n: fmt(ov.entry_basis) })} span={4} sources={courseSrc.concat(jobroom)}>
          <span className="tag-chip">{t("teach.chip")}</span>
          <Donut slices={teachSlices} label={t("teach.title")} center="100%" />
          <p className="note">
            <a href={`/${locale}/faehigkeiten`}>{t("teach.link")}</a>
          </p>
        </Panel>
        <Panel id="o-evo" title={t("evo.title")} intro={t("evo.intro", { days: data.window_days })} span={4} sources={jobroom}>
          <span className="tag-chip">{t("evo.chip")}</span>
          <BarChart bars={evo} yTitle={t("evo.yAxis")} xTitle={t("evo.xAxis")} caption={t("evo.title")} showValues format={fmt} />
          <p className="note">{t("evo.note")}</p>
        </Panel>
        <Panel id="o-req" title={t("req.title")} intro={t("req.intro")} span={4} sources={jobroom}>
          <span className="tag-chip">{t("req.chip")}</span>
          <BarList rows={reqRows} label={t("req.title")} />
          <p className="note">{t("req.note")}</p>
        </Panel>
        <Panel id="o-where" title={t("where.title")} span={4} sources={jobroom}>
          <span className="tag-chip">{t("where.chip")}</span>
          <BarList rows={cantonRows} label={t("where.title")} />
        </Panel>
        <Panel id="o-newest" title={t("newest.title")} span={4} sources={jobroom}>
          <span className="tag-chip tag-chip--live">{t("newest.chip")}</span>
          <ul className="newest">
            {ov.newest_entry.map((a) => {
              const url = safeHttpUrl(a.url);
              return (
                <li key={a.url} className="newest__card">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="newest__title">
                      {a.title}
                    </a>
                  ) : (
                    <span className="newest__title">{a.title}</span>
                  )}
                  <span className="newest__meta">
                    {[a.company, a.city].filter(Boolean).join(", ")} · {ago(a.published)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
