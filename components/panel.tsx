import { getTranslations } from "next-intl/server";
import { SourceLine, type SourceRef } from "@/components/source-line";

/**
 * One block of the dashboard: a heading, its content, a short "what this
 * means" line in plain language, and the source line.
 */
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
      {meaning ? (
        <div className="meaning">
          <p className="meaning__label">{t("meaning")}</p>
          <p>{meaning}</p>
        </div>
      ) : null}
      <SourceLine sources={sources} />
    </section>
  );
}
