import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SourceLine } from "@/components/source-line";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { loadRadar, type PolicyItem } from "@/lib/radar";
import { formatDate, pickSources, safeHttpUrl } from "@/lib/radar-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("policy");
  return { title: t("title") };
}

type Kind = "parliament" | "federal";
const kindOf = (p: PolicyItem): Kind => (/fedlex/i.test(p.source) ? "federal" : "parliament");

/** Question E: new parliament items and federal law, newest first, with the keyword that matched. */
export default async function PolicyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ source?: string | string[] }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("policy");
  const q = await getTranslations("questions");
  const c = await getTranslations("common");
  const activeFilter: Kind | "all" = sp.source === "parliament" || sp.source === "federal" ? sp.source : "all";
  const result = loadRadar();
  if (!result.ok) {
    const d = await getTranslations("dash");
    return (
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <p role="alert">{d("unavailableText")}</p>
      </div>
    );
  }
  const data = result.data;
  const all = [...data.policy].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const items = activeFilter === "all" ? all : all.filter((p) => kindOf(p) === activeFilter);
  const filters: { id: Kind | "all"; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "parliament", label: t("parliament") },
    { id: "federal", label: t("federal") },
  ];
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">
          {c("sectionOf", { letter: "E" })}: {q("E.title")}
        </p>
        <h1 className="page__title">{q("E.question")}</h1>
        <p className="page__lead">{t("lead")}</p>
      </header>
      <section className="panel" aria-labelledby="p-policy">
        <h2 id="p-policy" className="panel__title">
          {t("title")} <span className="panel__count">({t("count", { count: items.length })})</span>
        </h2>
        <nav aria-label={t("filterLabel")} className="roles">
          <ul>
            {filters.map((f) => (
              <li key={f.id}>
                <Link href={f.id === "all" ? "/politik" : `/politik?source=${f.id}`} className="roles__link" aria-current={f.id === activeFilter ? "true" : undefined}>
                  {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {items.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <ul className="policy">
            {items.map((p, i) => {
              const url = safeHttpUrl(p.url);
              return (
                <li key={`${p.url ?? p.title}-${i}`} className="policy__item">
                  <p className="policy__date">{formatDate(p.date, locale)}</p>
                  <div>
                    <p className="policy__title">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {p.title}
                          <span className="sr-only"> ({c("opensNewTab")})</span>
                        </a>
                      ) : (
                        p.title
                      )}
                    </p>
                    <p className="policy__tags">
                      <span className="tag tag--link">{t(kindOf(p))}</span>
                      {p.matched ? <span className="tag tag--link">{t("keyword", { word: p.matched })}</span> : null}
                    </p>
                    {p.status ? <p className="policy__status">{t("status", { status: p.status })}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="note">{t("titlesNote")}</p>
        <div className="meaning">
          <p className="meaning__label">{c("meaning")}</p>
          <p>{t("meaning")}</p>
        </div>
        <SourceLine sources={pickSources(data, ["curia", "fedlex"])} />
      </section>
    </div>
  );
}
