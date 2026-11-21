import { getTranslations } from "next-intl/server";
import { SourceLine, type SourceRef } from "@/components/source-line";

/**
 * One block of the dashboard: a heading, its content, a short "what this
 * means" line in plain language, and the source line.
 */
/**
 * «What this means» only on the most important charts, at most two per page (team, Isabella, 21.11.2026: «do not
 * put it in every single one»). Every other panel keeps its title, intro and source line. Guard:
 * lib/__tests__/meaning-limit.test.ts.
 */
export const KEEP_MEANING_BY_PAGE: Record<string, string[]> = {
  start: ["p-glance-bfs", "p-glance-entry"],
  job: ["p-job-open", "p-job-skills"],
  demand: ["p-demand", "p-allit-jobs"],
  skills: ["p-skills"],
  employers: ["p-employers"],
  target: ["d-people", "d-work"],
};
const KEEP_MEANING = new Set(Object.values(KEEP_MEANING_BY_PAGE).flat());

export async function Panel({
  id,
  title,
  intro,
  meaning,
  sources,
  span,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  meaning?: string;
  sources: SourceRef[];
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  children: React.ReactNode;
}) {
  const t = await getTranslations("common");
  return (
    <section className={`panel span-${span ?? 12}`} aria-labelledby={id}>
      <h3 id={id} className="panel__title">
        {title}
      </h3>
      {intro ? <p className="panel__intro">{intro}</p> : null}
      <div className="panel__body">{children}</div>
      {meaning && KEEP_MEANING.has(id) ? (
        <div className="meaning">
          <p className="meaning__label">{t("meaning")}</p>
          <p>{meaning}</p>
        </div>
      ) : null}
      <SourceLine sources={sources} />
    </section>
  );
}
