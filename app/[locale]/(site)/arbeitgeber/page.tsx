import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarList, type BarRow } from "@/components/bar-list";
import { Panel } from "@/components/panel";
import { loadQuestionPage, QuestionPageHead, type QuestionSearchParams } from "@/components/question-page";
import { formatDate, outOf100, safeHttpUrl } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const q = await getTranslations("questions");
  return { title: q("C.title") };
}

export default async function EmployersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: QuestionSearchParams }) {
  const ctx = await loadQuestionPage(params, searchParams);
  if (ctx.fail) return ctx.fail;
  const { t, c, role, roleName, jobroom, locale } = ctx;
  const maxEmp = Math.max(1, ...role.employers.map((e) => e.ads));
  const employerRows: BarRow[] = role.employers.map((e) => ({ key: e.company, label: e.company, fraction: e.ads / maxEmp, value: c("ads", { count: e.ads }) }));
  const maxAg = Math.max(1, ...role.agencies.map((e) => e.ads));
  const agencyRows: BarRow[] = role.agencies.map((e) => ({ key: e.company, label: e.company, fraction: e.ads / maxAg, value: c("ads", { count: e.ads }) }));

  return (
    <div className="page">
      <QuestionPageHead ctx={ctx} letter="C" base="/arbeitgeber" />

      <section className="question-section" aria-labelledby="q-c">
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
