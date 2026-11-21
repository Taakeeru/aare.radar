import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BarChart, type ChartBar } from "@/components/bar-chart";
import { BarList, type BarRow } from "@/components/bar-list";
import { Panel } from "@/components/panel";
import { RoleSwitch } from "@/components/role-switch";
import { toLocale } from "@/i18n/routing";
import { loadRadar, type Radar, type RadarRole } from "@/lib/radar";
import {
  ageInDays,
  cantonName,
  formatInt,
  hurdleLevel,
  outOf10,
  outOf100,
  percentChange,
  pickSources,
  parsePeriod,
  recentVersusBefore,
  roleById,
  sectorSeries,
  topCantonShare,
  weekNumber,
  weeklyPoints,
  yearBefore,
} from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dash");
  return { title: t("title") };
}

const HURDLES = ["german_required", "degree_required", "senior_experience", "french_required"] as const;

function QuestionHead({ id, letter, title, question, label }: { id: string; letter: string; title: string; question: string; label: string }) {
  return (
    <header className="question">
      <p className="question__letter">
        <span aria-hidden="true">{letter}</span>
        <span className="sr-only">{label}</span>
      </p>
      <div>
        <h2 id={id} className="question__title">
          {title}
        </h2>
        <p className="question__text">{question}</p>
      </div>
    </header>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("dash");
  const q = await getTranslations("questions");
  const c = await getTranslations("common");
  const rolesT = await getTranslations("roles");

  const result = loadRadar();
  if (!result.ok) {
    return (
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <section className="panel" role="alert">
          <h2 className="panel__title">{t("unavailableTitle")}</h2>
          <p>{t("unavailableText")}</p>
        </section>
      </div>
    );
  }
  const data: Radar = result.data;
  const wanted = typeof sp.role === "string" ? sp.role : undefined;
  const role = roleById(data, wanted);
  if (!role) {
    return (
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <p>{c("noData")}</p>
      </div>
    );
  }
  const roleName = (r: Pick<RadarRole, "id" | "label">) => (rolesT.has(r.id) ? rolesT(r.id) : r.label);
  const fmt = (n: number) => formatInt(n, locale);
  const jobroom = pickSources(data, ["jobroom"]);
  const bfs = pickSources(data, ["bfs"]);
  const age = ageInDays(data.generated_at);
  const label = (letter: string) => c("sectionOf", { letter });

  // A: demand
  const perWeek = Math.round(role.ads / (data.window_days / 7));
  const points = weeklyPoints(role, data.generated_at, data.window_days);
  const compare = recentVersusBefore(points);
  const trendBars: ChartBar[] = points.map((p) => ({
    key: p.week,
    value: p.newAds,
    label: `${weekNumber(p.week)}${p.partial ? "*" : ""}`,
    description: `${t("trend.week", { week: weekNumber(p.week) })}${p.partial ? "*" : ""}`,
    partial: p.partial,
  }));
  const hurdleRows: BarRow[] = [...HURDLES]
    .sort((a, b) => role.barriers[b] - role.barriers[a])
    .map((k) => {
      const share = role.barriers[k];
      const level = hurdleLevel(share);
      return {
        key: k,
        label: t(`barriers.${k}`, { count: outOf10(share) }),
        sentence: t(`barriers.${k}`, { count: outOf10(share) }),
        fraction: share,
        value: c("ofHundred", { count: outOf100(share) }),
        tone: level === "low" ? "healthy" : level === "medium" ? "warning" : "critical",
        tag: t(level === "low" ? "barriers.levelLow" : level === "medium" ? "barriers.levelMedium" : "barriers.levelHigh"),
      };
    });
  hurdleRows.push({
    key: "english_ok",
    label: "",
    sentence: t("barriers.english_ok", { count: outOf10(role.barriers.english_ok) }),
    fraction: role.barriers.english_ok,
    value: c("ofHundred", { count: outOf100(role.barriers.english_ok) }),
    tone: "link",
  });
  const topHurdle = [...HURDLES].sort((a, b) => role.barriers[b] - role.barriers[a])[0]!;
  const topHurdleShare = role.barriers[topHurdle];

  const cantons = role.cantons.slice(0, 6);
  const otherCantons = role.cantons.slice(6).map((x) => cantonName(x.canton, locale));
  const share3 = topCantonShare(role.cantons, 3);

  const sector = sectorSeries(data.sector);
  const latest = sector?.points[sector.points.length - 1];
  const before = sector && latest ? yearBefore(sector.points, latest.period) : null;
  const sectorBars: ChartBar[] = (sector?.points ?? []).map((p) => {
    const { year, quarter } = parsePeriod(p.period);
    return { key: p.period, value: p.value, label: quarter === 1 ? String(year) : "", description: `${year} Q${quarter}` };
  });

  // A: every IT ad (job-room occupation codes), not only the three roles
  const it = data.it_market && data.it_market.ads > 0 ? data.it_market : null;
  const itLabel = (x: { label_en: string; label_de: string }) => (locale === "de" ? x.label_de : x.label_en);
  const roleAds = data.roles.reduce((n, r) => n + r.ads, 0);
  const itGroupRows: BarRow[] = (it?.groups ?? []).map((g) => ({
    key: g.group,
    label: itLabel(g),
    fraction: g.ads / Math.max(1, it!.groups[0]!.ads),
    value: c("ads", { count: g.ads }),
  }));
  const itTop = (it?.occupations ?? []).slice(0, 3);
  // Entry level is what Powercoders looks for: IT occupations ranked by their beginner ads.
  const itEntry = [...(it?.occupations ?? [])].filter((o) => (o.entry_ads ?? 0) > 0).sort((a, b) => (b.entry_ads ?? 0) - (a.entry_ads ?? 0)).slice(0, 12);
  const itJobRows: BarRow[] = itEntry.map((o) => ({
    key: o.code,
    label: itLabel(o),
    fraction: (o.entry_ads ?? 0) / Math.max(1, itEntry[0]!.entry_ads ?? 0),
    value: t("allIt.entryOf", { entry: fmt(o.entry_ads ?? 0), ads: fmt(o.ads) }),
    tone: "healthy",
  }));

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
        <RoleSwitch base="/nachfrage" roles={data.roles.map((r) => ({ id: r.id, label: roleName(r) }))} current={role.id} label={t("roleLabel")} />
        {age !== null && age >= 3 ? <p className="notice">{t("dataStale", { days: age })}</p> : null}
      </header>

      <section id="nachfrage" className="question-section" aria-labelledby="q-a">
        <QuestionHead id="q-a" letter="A" title={q("A.title")} question={q("A.question")} label={label("A")} />
        <div className="grid">
          <Panel id="p-demand" title={t("demand.title")} span={4} sources={jobroom} meaning={t("demand.meaning", { role: roleName(role), days: data.window_days, perWeek: fmt(perWeek) })}>
            <p className="stat">
              <span className="stat__n">{fmt(role.ads)}</span>
              <span className="stat__c">{t("demand.caption", { days: data.window_days })}</span>
            </p>
          </Panel>

          <Panel
            id="p-trend"
            title={t("trend.title")}
            span={8}
            sources={jobroom}
            meaning={compare ? t("trend.meaning", { recent: fmt(compare.recent), before: fmt(compare.before) }) : t("trend.meaningShort")}
          >
            <BarChart bars={trendBars} yTitle={t("trend.yAxis")} xTitle={t("trend.xAxis")} caption={t("trend.title")} showValues format={fmt} />
            {points.some((p) => p.partial) ? <p className="note">{t("trend.partial")}</p> : null}
            <p className="note">{t("trend.caveat")}</p>
          </Panel>

          <Panel
            id="p-entry"
            title={t("entry.title")}
            intro={t("entry.intro")}
            span={4}
            sources={jobroom}
            meaning={role.entry_level_share > 0 ? t("entry.meaning") : t("entry.meaningNone")}
          >
            <BarList
              label={t("entry.title")}
              rows={[
                {
                  key: "entry",
                  label: t("entry.sentence", { count: outOf100(role.entry_level_share) }),
                  sentence: t("entry.sentence", { count: outOf100(role.entry_level_share) }),
                  fraction: role.entry_level_share,
                  value: c("ofHundred", { count: outOf100(role.entry_level_share) }),
                  tone: "healthy",
                  tag: role.entry_level_share > 0 ? t("entry.level") : undefined,
                },
              ]}
            />
          </Panel>

          <Panel
            id="p-barriers"
            title={t("barriers.title")}
            intro={t("barriers.intro")}
            span={8}
            sources={jobroom}
            meaning={topHurdleShare < 0.2 ? t("barriers.meaningNone") : t("barriers.meaning", { top: t(`barriers.short.${topHurdle}`) })}
          >
            <BarList rows={hurdleRows} label={t("barriers.title")} />
            <p className="note">{t("barriers.reporting", { count: outOf100(role.reporting_obligation_share) })}</p>
            <p className="note">{t("barriers.basis")}</p>
          </Panel>

          <Panel
            id="p-where"
            title={t("where.title")}
            span={5}
            sources={jobroom}
            meaning={
              cantons.length >= 3
                ? t("where.meaning", { first: cantonName(cantons[0]!.canton, locale), second: cantonName(cantons[1]!.canton, locale), third: cantonName(cantons[2]!.canton, locale), share: share3 })
                : cantons.length > 0
                  ? t("where.meaningOne", { first: cantonName(cantons[0]!.canton, locale), share: topCantonShare(role.cantons, 1) })
                  : t("where.empty")
            }
          >
            {cantons.length > 0 ? (
              <BarList
                label={t("where.title")}
                rows={cantons.map((x) => ({ key: x.canton, label: cantonName(x.canton, locale), fraction: x.count / cantons[0]!.count, value: c("ads", { count: x.count }) }))}
              />
            ) : (
              <p>{t("where.empty")}</p>
            )}
            {otherCantons.length > 0 ? <p className="note">{t("where.more", { list: otherCantons.join(", ") })}</p> : null}
          </Panel>

          <Panel
            id="p-sector"
            title={t("sector.title")}
            intro={t("sector.subtitle")}
            span={7}
            sources={bfs}
            meaning={
              latest
                ? before
                  ? (() => {
                      const pc = percentChange(latest.value, before.value);
                      const key = pc > 0 ? "meaningUp" : pc < 0 ? "meaningDown" : "meaningSame";
                      return `${t(`sector.${key}`, { before: fmt(before.value), percent: Math.abs(pc) })} ${t("sector.note")}`;
                    })()
                  : `${t("sector.meaningNoYear")} ${t("sector.note")}`
                : t("sector.empty")
            }
          >
            {latest ? (
              <>
                <p className="stat">
                  <span className="stat__n">{fmt(latest.value)}</span>
                  <span className="stat__c">{t("sector.latest", { quarter: parsePeriod(latest.period).quarter, year: parsePeriod(latest.period).year })}</span>
                </p>
                <BarChart bars={sectorBars} yTitle={t("sector.yAxis")} xTitle={t("sector.xAxis")} caption={t("sector.subtitle")} format={fmt} />
              </>
            ) : (
              <p>{t("sector.empty")}</p>
            )}
          </Panel>

          {it ? (
            <>
              <Panel
                id="p-allit"
                title={t("allIt.title")}
                intro={t("allIt.intro")}
                span={5}
                sources={jobroom}
                meaning={
                  itTop.length >= 3
                    ? t("allIt.meaning", { roles: fmt(roleAds), first: itLabel(itTop[0]!), second: itLabel(itTop[1]!), third: itLabel(itTop[2]!) })
                    : t("allIt.meaningShort", { roles: fmt(roleAds) })
                }
              >
                <p className="stat">
                  <span className="stat__n">{fmt(it.ads)}</span>
                  <span className="stat__c">{t("allIt.caption", { days: data.window_days, jobs: it.occupations.length })}</span>
                </p>
                {it.entry_ads !== undefined ? <p className="note">{t("allIt.entryTotal", { entry: fmt(it.entry_ads), ads: fmt(it.ads) })}</p> : null}
                <BarList rows={itGroupRows} label={t("allIt.groups")} />
              </Panel>
              <Panel
                id="p-allit-jobs"
                title={t("allIt.jobsTitle")}
                span={7}
                sources={jobroom}
                meaning={
                  itEntry.length >= 2
                    ? t("allIt.jobsMeaning", { first: itLabel(itEntry[0]!), firstN: fmt(itEntry[0]!.entry_ads ?? 0), second: itLabel(itEntry[1]!) })
                    : t("allIt.jobsMeaningShort")
                }
              >
                {itJobRows.length > 0 ? <BarList rows={itJobRows} label={t("allIt.jobsTitle")} /> : <p>{t("allIt.jobsEmpty")}</p>}
                <p className="note">{t("allIt.entryHow")}</p>
                <p className="note">{t("allIt.note")}</p>
              </Panel>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
