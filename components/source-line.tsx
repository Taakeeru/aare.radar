import { getLocale, getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { formatDate } from "@/lib/radar-view";

export type SourceRef = { id: string; name: string; url: string | null; updated: string | null };

/**
 * "Quelle: <name, linked>, Stand <date>" right under the number, chart or list
 * it belongs to (owner rule: every figure names its source WITH a link and the
 * date of the last update next to it, not only on the sources page).
 */
export async function SourceLine({ sources }: { sources: SourceRef[] }) {
  const t = await getTranslations("common");
  const locale = toLocale(await getLocale());
  return (
    <p className="source">
      {sources.map((s, i) => (
        <span key={s.id} className="source__item">
          {i === 0 ? `${t("source")}: ` : ""}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.name}
              <span className="sr-only"> ({t("opensNewTab")})</span>
            </a>
          ) : (
            s.name
          )}
          {", "}
          {s.updated ? t("asOf", { date: formatDate(s.updated, locale) }) : t("noDate")}
          {i < sources.length - 1 ? "; " : ""}
        </span>
      ))}
    </p>
  );
}
