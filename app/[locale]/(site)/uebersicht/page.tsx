import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BarList, type BarRow } from "@/components/bar-list";
import { CantonMap } from "@/components/canton-map";
import { HomeView } from "@/components/home-view";
import { Donut, type Slice } from "@/components/donut";
import { LineChart, type Line } from "@/components/line-chart";
import { SkillCompanies } from "@/components/skill-companies";
import { PageIcon } from "@/components/page-icon";
import { Panel } from "@/components/panel";
import { RoleSwitch } from "@/components/role-switch";
import type { SourceRef } from "@/components/source-line";
import { toLocale } from "@/i18n/routing";
import { loadRadar } from "@/lib/radar";
import { cantonName, formatInt, outOf100, pickSources, safeHttpUrl } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("overview");
  return { title: t("title") };
}

const REQS = ["senior_experience", "degree_required", "german_required", "french_required"] as const;

/** «Overview» (Seckin, panel thread 58, 21.11.2026): six cards from his sketch, in the site's design, from our data. */
export default async function OverviewPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ role?: string | string[] }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("overview");
  const d = await getTranslations("dash");
  const rolesT = await getTranslations("roles");
  const sp = await searchParams;
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
  const today0 = data.generated_at.slice(0, 10);
  const courseSrc: SourceRef[] = [{ id: "courses", name: d("teach.source"), url: "https://powercoders.org/programs/", updated: "2026-11-21" }];

  // The dashboard follows the role chosen above, with the same numbers as Demand, Skills and Employers
  // (Seckin, thread 61); «all» = every IT ad (job-room IT occupation codes).
  const wanted = typeof sp.role === "string" ? sp.role : "all";
  const role = data.roles.find((r) => r.id === wanted) ?? null;
  const roleName = (r: { id: string; label: string }) => (rolesT.has(r.id) ? rolesT(r.id) : r.label);
  // Isabella (thread 67): until a role is chosen, the Dashboard shows the start page with the drop-down on top;
  // choosing a role (or «All IT jobs») shows the charts.
  if (typeof sp.role !== "string") {
    // Isabella (thread 69): the title first, the drop-down «Choose an IT job» to its right, leading to the charts
    return (
      <HomeView
        params={params}
        searchParams={Promise.resolve({})}
        pick={<RoleSwitch base="/uebersicht" roles={data.roles.map((r) => ({ id: r.id, label: roleName(r) }))} current="all" label={d("pickJob")} all={t("allJobs")} placeholder={d("rolePlaceholder")} chosen={false} />}
      />
    );
  }
  const skillsAll = role ? role.skills : (it.skills ?? []);
  const entrySkills = role ? (role.entry_skills ?? []) : ov.entry_skills;
  const entryBasis = role ? (role.entry_ads ?? 0) : ov.entry_basis;
  const req: Record<string, number> = role ? (role.barriers as unknown as Record<string, number>) : ov.requirements;
  const cantonList = role ? role.cantons : it.cantons;
  const newest = role
    ? role.examples.slice(0, 4).map((e) => ({ title: e.title, company: e.company, city: e.city, published: e.published ?? today0, url: e.url }))
    : ov.newest_entry;
  const totalAds = role ? role.ads : it.ads;
  const totalEntry = role ? (role.entry_ads ?? Math.round(role.entry_level_share * role.ads)) : (it.entry_ads ?? 0);

  // 1 and 2: donuts, slices = share of the mentions among the six skills shown (an ad names several skills)
  const skillSlices: Slice[] = skillsAll.slice(0, 6).map((s) => ({ key: s.skill, label: s.skill, value: s.count }));
  const es = entrySkills.slice(0, 6);
  const teachSlices: Slice[] = es.map((s) => ({ key: s.skill, label: s.skill, value: s.count }));
  // 3: evolution as lines (Seckin): monthly ads per skill, from the first month with data (job-room keeps 60 days)
  const series = ((role ? role.skills_monthly : it.skills_monthly) ?? []).slice(0, 5);
  const firstIdx = Math.max(0, Math.min(...series.map((x) => { const i = x.points.findIndex((p) => p.count > 0); return i < 0 ? 99 : i; })));
  const months = (series[0]?.points ?? []).slice(firstIdx).map((p) => {
    const [yy, mm] = p.month.split("-");
    return new Intl.DateTimeFormat(locale === "de" ? "de-CH" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(Number(yy), Number(mm) - 1, 1)));
  });
  const lines: Line[] = series.map((x) => ({ key: x.skill, label: x.skill, points: x.points.slice(firstIdx).map((p) => ({ x: p.month, y: p.count })) }));
  // 4: entry requirements
  const reqRows: BarRow[] = REQS.map((k) => ({
    key: k,
    label: t(`req.${k}`),
    fraction: req[k] ?? 0,
    value: c("ofHundred", { count: outOf100(req[k] ?? 0) }),
  }));
  // 4b: requirement details (Isabella, thread 65): language level per language, degree type, years of experience
  const rd = role ? role.requirements_detail : it.requirements_detail;
  const pct = (f: number) => c("ofHundred", { count: outOf100(f) });
  const langRows: BarRow[] = rd
    ? (["de", "en", "fr"] as const).flatMap((lang) =>
        Object.entries(rd.languages[lang] ?? {})
          .filter(([, f]) => (f ?? 0) > 0)
          .map(([lv, f]) => ({ key: `${lang}-${lv}`, label: t("req.langLevel", { lang: t(`req.lang.${lang}`), level: lv }), fraction: f ?? 0, value: pct(f ?? 0) })),
      )
        .sort((a, b) => b.fraction - a.fraction)
        .slice(0, 6)
    : [];
  const degreeRows: BarRow[] = rd ? (["vocational", "bachelor", "master", "phd"] as const).map((k) => ({ key: k, label: t(`req.degree.${k}`), fraction: rd.degrees[k] ?? 0, value: pct(rd.degrees[k] ?? 0) })) : [];
  const expRows: BarRow[] = rd ? (["1", "2", "3-4", "5+"] as const).map((k) => ({ key: k, label: t(`req.years.${k}`), fraction: rd.experience[k] ?? 0, value: pct(rd.experience[k] ?? 0) })) : [];
  // 5: cantons
  const cantons = cantonList.slice(0, 5);
  const cantonRows: BarRow[] = cantons.map((x) => ({ key: x.canton, label: cantonName(x.canton, locale), fraction: x.count / Math.max(1, cantons[0]!.count), value: c("ads", { count: x.count }) }));
  // 6: newest ads
  const ago = (iso: string) => {
    const days = Math.max(0, Math.round((Date.parse(`${today0}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000));
    return days === 0 ? t("today") : days === 1 ? t("yesterday") : t("daysAgo", { n: days });
  };

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow eyebrow--icon">
          <PageIcon name="overview" />
          {t("eyebrow")}
        </p>
        <h1 className="page__title">{role ? `${t("title")}: ${roleName(role)}` : t("title")}</h1>
        <p className="page__lead">{t("lead", { ads: fmt(totalAds), entry: fmt(totalEntry) })}</p>
        <RoleSwitch base="/uebersicht" roles={data.roles.map((r) => ({ id: r.id, label: roleName(r) }))} current={role ? role.id : "all"} label={d("roleLabel")} all={t("allJobs")} placeholder={d("rolePlaceholder")} chosen={typeof sp.role === "string"} />
      </header>
      <div className="grid">
        <Panel id="o-skills" title={t("skills.title")} intro={role ? t("skills.introRole") : t("skills.intro")} span={6} sources={jobroom}>
          <SkillCompanies
            slices={skillSlices}
            companies={(role ? role.skill_companies : it.skill_companies) ?? {}}
            label={t("skills.title")}
            pick={t("skills.pick")}
            adsWord={t("skills.adsWord")}
            none={t("skills.noCompanies")}
          />
        </Panel>
        <Panel id="o-teach" title={t("teach.title")} intro={t("teach.intro", { n: fmt(entryBasis) })} span={6} sources={jobroom}>
          {teachSlices.length > 0 ? <Donut slices={teachSlices} label={t("teach.title")} center="100%" size="large" unit={t("skills.adsWord")} /> : <p>{c("noData")}</p>}
          <p className="teach-cta">
            <a className="btn btn--primary" href={`/${locale}/faehigkeiten${role ? `?role=${role.id}` : ""}`}>
              {t("teach.link")} ›
            </a>
          </p>
        </Panel>
        <Panel id="o-evo" title={t("evo.title")} intro={role ? t("evo.introLineRole") : t("evo.introLine")} span={12} sources={jobroom}>
          {lines.length > 0 ? <LineChart lines={lines} xLabels={months} label={t("evo.title")} format={fmt} /> : <p>{c("noData")}</p>}
          <p className="note">{t("evo.noteLine")}</p>
        </Panel>
        <Panel id="o-req" title={t("req.title")} intro={role ? t("req.introRole") : t("req.intro")} span={12} sources={jobroom}>
          <div className="reqd">
            <div>
              <h3 className="reqd__h">{t("req.summary")}</h3>
              <BarList rows={reqRows} label={t("req.summary")} />
            </div>
            {rd && rd.basis > 0 ? (
              <>
                <div>
                  <h3 className="reqd__h">{t("req.languages")}</h3>
                  <BarList rows={langRows} label={t("req.languages")} />
                </div>
                <div>
                  <h3 className="reqd__h">{t("req.degrees")}</h3>
                  <BarList rows={degreeRows} label={t("req.degrees")} />
                </div>
                <div>
                  <h3 className="reqd__h">{t("req.experience")}</h3>
                  <BarList rows={expRows} label={t("req.experience")} />
                </div>
              </>
            ) : null}
          </div>
          <p className="note">{rd && rd.basis > 0 ? t("req.noteDetail", { n: fmt(rd.basis) }) : t("req.note")}</p>
        </Panel>
        <Panel id="o-where" title={t("where.title")} span={4} sources={jobroom}>
          <CantonMap cantons={cantonList} label={t("where.mapLabel")} name={(code) => cantonName(code, locale)} />
          <BarList rows={cantonRows} label={t("where.title")} />
        </Panel>
        <Panel id="o-newest" title={role ? t("newest.titleRole") : t("newest.title")} span={4} sources={jobroom}>
          <ul className="newest">
            {newest.map((a) => {
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
