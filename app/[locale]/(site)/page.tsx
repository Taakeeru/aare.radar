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
  formatDate,
  formatInt,
  hurdleLevel,
  outOf10,
  outOf100,
  percentChange,
  pickSources,
  parsePeriod,
  recentVersusBefore,
  roleById,
  safeHttpUrl,
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
  const itTop = (it?.occupations ?? []).slice(0, 12);
  const itJobRows: BarRow[] = itTop.map((o) => ({
    key: o.code,
    label: itLabel(o),
    fraction: o.ads / Math.max(1, itTop[0]!.ads),
    value: c("ads", { count: o.ads }),
  }));

  // B: skills
  const skills = role.skills.slice(0, 10);
  const skillRows: BarRow[] = skills.map((s) => ({
    key: s.skill,
    label: s.skill,
    fraction: s.share,
    value: c("ofHundred", { count: outOf100(s.share) }),
  }));

  // C: employers
  const maxEmp = Math.max(1, ...role.employers.map((e) => e.ads));
  const employerRows: BarRow[] = role.employers.map((e) => ({ key: e.company, label: e.company, fraction: e.ads / maxEmp, value: c("ads", { count: e.ads }) }));
  const maxAg = Math.max(1, ...role.agencies.map((e) => e.ads));
  const agencyRows: BarRow[] = role.agencies.map((e) => ({ key: e.company, label: e.company, fraction: e.ads / maxAg, value: c("ads", { count: e.ads }) }));

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
        <RoleSwitch roles={data.roles.map((r) => ({ id: r.id, label: roleName(r) }))} current={role.id} label={t("roleLabel")} />
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
                meaning={t("allIt.meaning", { roles: fmt(roleAds), group: itLabel(it.groups[0]!) })}
              >
                <p className="stat">
                  <span className="stat__n">{fmt(it.ads)}</span>
                  <span className="stat__c">{t("allIt.caption", { days: data.window_days, jobs: it.occupations.length })}</span>
                </p>
                <BarList rows={itGroupRows} label={t("allIt.groups")} />
              </Panel>
              <Panel
                id="p-allit-jobs"
                title={t("allIt.jobsTitle")}
                span={7}
                sources={jobroom}
                meaning={
                  itTop.length >= 3
                    ? t("allIt.jobsMeaning", { first: itLabel(itTop[0]!), second: itLabel(itTop[1]!), third: itLabel(itTop[2]!) })
                    : t("allIt.jobsMeaningShort")
                }
              >
                <BarList rows={itJobRows} label={t("allIt.jobsTitle")} />
                <p className="note">{t("allIt.note")}</p>
              </Panel>
            </>
          ) : null}
        </div>
      </section>

      <section id="faehigkeiten" className="question-section" aria-labelledby="q-b">
        <QuestionHead id="q-b" letter="B" title={q("B.title")} question={q("B.question")} label={label("B")} />
        <div className="grid">
          <Panel
            id="p-skills"
            title={t("skills.title")}
            intro={t("skills.intro")}
            span={12}
            sources={jobroom}
            meaning={
              skills.length >= 3
                ? t("skills.meaning", { first: skills[0]!.skill, second: skills[1]!.skill, third: skills[2]!.skill })
                : skills.length === 2
                  ? t("skills.meaningTwo", { first: skills[0]!.skill, second: skills[1]!.skill })
                  : skills.length === 1
                    ? t("skills.meaningOne", { first: skills[0]!.skill })
                    : c("noData")
            }
          >
            <BarList rows={skillRows} label={t("skills.title")} />
            <p className="note">{t("skills.basis")}</p>
          </Panel>
        </div>
      </section>

      <section id="arbeitgeber" className="question-section" aria-labelledby="q-c">
        <QuestionHead id="q-c" letter="C" title={q("C.title")} question={q("C.question")} label={label("C")} />
        <div className="grid">
          <Panel
            id="p-employers"
            title={t("employers.title")}
            intro={t("employers.intro", { role: roleName(role) })}
            span={6}
            sources={jobroom}
            meaning={
              role.employers.length > 1
                ? t("employers.meaning", { first: role.employers[0]!.company, count: role.employers[0]!.ads })
                : role.employers.length === 1
                  ? t("employers.meaningOne", { first: role.employers[0]!.company })
                  : t("employers.empty")
            }
          >
            {employerRows.length > 0 ? <BarList rows={employerRows} label={t("employers.title")} /> : <p>{t("employers.empty")}</p>}
          </Panel>

          <Panel id="p-agencies" title={t("agencies.title")} intro={t("agencies.intro")} span={6} sources={jobroom} meaning={t("agencies.sentence", { count: outOf100(role.agency_share) })}>
            {agencyRows.length > 0 ? <BarList rows={agencyRows} label={t("agencies.title")} /> : <p>{t("agencies.empty")}</p>}
          </Panel>

          <Panel id="p-examples" title={t("examples.title")} intro={t("examples.intro")} span={12} sources={jobroom} meaning={t("examples.meaning", { role: roleName(role) })}>
            {role.examples.length > 0 ? (
              <ul className="ads">
                {role.examples.map((e) => {
                  const url = safeHttpUrl(e.url);
                  return (
                    <li key={e.url} className="ads__item">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="ads__title">
                          {e.title}
                          <span className="sr-only"> ({c("opensNewTab")})</span>
                        </a>
                      ) : (
                        <span className="ads__title">{e.title}</span>
                      )}
                      <span className="ads__meta">{[e.company, e.city, e.published ? formatDate(e.published, locale) : ""].filter(Boolean).join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>{t("examples.empty")}</p>
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}
