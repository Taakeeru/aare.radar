import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarList, type BarRow } from "@/components/bar-list";
import { Panel } from "@/components/panel";
import { loadQuestionPage, QuestionPageHead, type QuestionSearchParams } from "@/components/question-page";
import { COURSES_CHECKED, coursesFor, programsFor } from "@/lib/courses";
import { outOf100 } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const q = await getTranslations("questions");
  return { title: q("B.title") };
}

export default async function SkillsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: QuestionSearchParams }) {
  const ctx = await loadQuestionPage(params, searchParams);
  if (ctx.fail) return ctx.fail;
  const { t, c, role, jobroom } = ctx;
  const c0 = c;
  const skills = role.skills.slice(0, 10);
  const skillRows: BarRow[] = skills.map((s) => ({
    key: s.skill,
    label: s.skill,
    fraction: s.share,
    value: c("ofHundred", { count: outOf100(s.share) }),
  }));

  // What to teach next: the role's most asked skills that have course suggestions, most asked first (at most 6).
  const teach = skills.map((s) => ({ s, c: coursesFor(s.skill) })).filter((x) => x.c).slice(0, 6);
  const courseSource = [{ id: "courses", name: t("teach.source"), url: "https://powercoders.org/programs/", updated: COURSES_CHECKED }];

  return (
    <div className="page">
      <QuestionPageHead ctx={ctx} letter="B" base="/faehigkeiten" />

      <section className="question-section" aria-labelledby="q-b">
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
          {teach.length > 0 ? (
            <Panel id="p-teach" title={t("teach.title")} intro={t("teach.intro")} span={12} sources={courseSource}>
              <ul className="teach">
                {teach.map(({ s, c }) => (
                  <li key={s.skill} className="teach__row">
                    <p className="teach__skill">
                      <strong>{s.skill}</strong> <span className="teach__share">{c0("ofHundred", { count: outOf100(s.share) })}</span>
                    </p>
                    {programsFor(c!).length > 0 ? (
                      <p className="teach__pc">
                        {t("teach.atPowercoders")}{" "}
                        {programsFor(c!).map((p, i) => (
                          <span key={p.id}>
                            {i > 0 ? ", " : ""}
                            <a href={p.url} target="_blank" rel="noopener noreferrer">
                              {p.name}
                            </a>
                          </span>
                        ))}
                      </p>
                    ) : null}
                    <ul className="teach__courses">
                      {c!.courses.slice(0, 3).map((k) => (
                        <li key={k.url}>
                          <a href={k.url} target="_blank" rel="noopener noreferrer" className="course__title">
                            {k.title}
                          </a>{" "}
                          <span className="teach__meta">
                            {k.provider} · {t(`teach.cost.${k.cost === "free" ? "free" : k.cost === "free to audit" ? "audit" : "paid"}`)}
                            {k.certificate ? ` · ${t("teach.certificate")}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <p className="note">{t("teach.note")}</p>
            </Panel>
          ) : null}
        </div>
      </section>
    </div>
  );
}
