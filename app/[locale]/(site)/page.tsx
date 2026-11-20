import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: { absolute: t("title") } };
}

const QUESTIONS = ["A", "B", "C", "D", "E"] as const;

/** The stub home page: the name, one line, and the five questions as a plain list. No data, no links. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(toLocale((await params).locale));
  const t = await getTranslations("home");
  const q = await getTranslations("questions");
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
      </header>
      <ul className="question-section" aria-label={t("questions")}>
        {QUESTIONS.map((letter) => (
          <li key={letter} className="question">
            <p className="question__letter">{letter}</p>
            <p className="question__title">{q(letter)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
