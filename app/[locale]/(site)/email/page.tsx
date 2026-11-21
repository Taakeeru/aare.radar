import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { loadRadar } from "@/lib/radar";
import { formatDate, formatInt, safeHttpUrl } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("email");
  return { title: t("title") };
}

/**
 * Preview of the two-weekly summary email (21.11.2026): exactly what collector/digest.py v2 sends, from the
 * `digest` block of the data file. Beginner IT ads first, by field, soonest deadline first, at most 5 per field.
 */
export default async function EmailPreviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("email");
  const result = loadRadar();
  const d = result.ok ? result.data.digest : undefined;
  if (!d) {
    return (
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <p>{t("empty")}</p>
      </div>
    );
  }
  const fmt = (n: number) => formatInt(n, locale);
  const from = formatDate(d.from, locale);
  const to = formatDate(d.to, locale);
  const label = (f: { label_en: string; label_de: string }) => (locale === "de" ? f.label_de : f.label_en);
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
      </header>
      <article className="mail" aria-label={t("title")}>
        <dl className="mail__head">
          <dt>{t("fromLabel")}</dt>
          <dd>AareRadar</dd>
          <dt>{t("subjectLabel")}</dt>
          <dd>{t("subject", { n: fmt(d.entry_ads), from, to })}</dd>
        </dl>
        <div className="mail__body">
          <p>{t("intro", { from, to, total: fmt(d.ads), entry: fmt(d.entry_ads) })}</p>
          {d.fields.map((f) => (
            <section key={f.group} className="mail__field">
              <h2>{t("field", { label: label(f), n: fmt(f.ads), e: fmt(f.entry_ads) })}</h2>
              {f.items.length === 0 ? (
                <p>{t("none")}</p>
              ) : (
                <ul>
                  {f.items.map((i) => {
                    const url = safeHttpUrl(i.url);
                    const who = [i.company, i.city].filter(Boolean).join(", ");
                    return (
                      <li key={i.url}>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {i.title}
                          </a>
                        ) : (
                          i.title
                        )}
                        <br />
                        <span className="mail__meta">
                          {who} · {i.ends ? t("until", { date: formatDate(i.ends, locale) }) : t("noEnd")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {f.entry_ads > f.items.length ? <p className="mail__meta">{t("more", { k: fmt(f.entry_ads - f.items.length) })}</p> : null}
            </section>
          ))}
          <p className="mail__foot">{t("foot")}</p>
        </div>
      </article>
    </div>
  );
}
