import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarList, type BarRow } from "@/components/bar-list";
import { Panel } from "@/components/panel";
import { loadQuestionPage, QuestionPageHead, type QuestionSearchParams } from "@/components/question-page";
import { outOf100 } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const q = await getTranslations("questions");
  return { title: q("B.title") };
}

export default async function SkillsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: QuestionSearchParams }) {
  const ctx = await loadQuestionPage(params, searchParams);
  if (ctx.fail) return ctx.fail;
  const { t, c, role, jobroom } = ctx;
  const skills = role.skills.slice(0, 10);
  const skillRows: BarRow[] = skills.map((s) => ({
    key: s.skill,
    label: s.skill,
    fraction: s.share,
    value: c("ofHundred", { count: outOf100(s.share) }),
  }));

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
        </div>
      </section>
    </div>
  );
}
