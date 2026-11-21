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
export default async function EmailPreviewPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ field?: string | string[] }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("email");
  const sp = await searchParams;
  const picked = new Set(typeof sp.field === "string" ? [sp.field] : (sp.field ?? []));
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
  // Each reader gets only the categories they chose (team, 21.11.); nothing ticked = all categories.
  const fields = picked.size > 0 ? d.fields.filter((f) => picked.has(f.group)) : d.fields;
  const entryTotal = fields.reduce((n, f) => n + f.entry_ads, 0);
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("lead")}</p>
      </header>
      <form className="mail-pick" method="get" action="">
        <fieldset>
          <legend>{t("pick")}</legend>
          {d.fields.map((f) => (
            <label key={f.group} className="mail-pick__opt">
              <input type="checkbox" name="field" value={f.group} defaultChecked={picked.has(f.group)} /> {label(f)}
            </label>
          ))}
          {(d.policy ?? []).length > 0 ? (
            <label className="mail-pick__opt">
              <input type="checkbox" name="field" value="policy" defaultChecked={picked.has("policy")} /> {t("policyCategory")}
            </label>
          ) : null}
        </fieldset>
        <button type="submit" className="btn btn--primary">
          {t("apply")}
        </button>
      </form>
      <article className="mail" aria-label={t("title")}>
        <dl className="mail__head">
          <dt>{t("fromLabel")}</dt>
          <dd>AareRadar</dd>
          <dt>{t("subjectLabel")}</dt>
          <dd>{t("subject", { n: fmt(entryTotal), from, to })}</dd>
        </dl>
        <div className="mail__body">
          <p>{t("intro", { from, to, entry: fmt(entryTotal) })}</p>
          {fields.map((f) => (
            <section key={f.group} className="mail__field">
              <h2>{t("field", { label: label(f), e: fmt(f.entry_ads) })}</h2>
              {(f.skills ?? []).length > 0 ? <p className="mail__skills">{t("skills", { list: (f.skills ?? []).join(", ") })}</p> : null}
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
          {(d.policy ?? []).length > 0 && (picked.size === 0 || picked.has("policy")) ? (
            <section className="mail__field">
              <h2>{t("policy", { days: d.policy_days ?? 30 })}</h2>
              <ul>
                {(d.policy ?? []).map((p) => {
                  const url = safeHttpUrl(p.url);
                  return (
                    <li key={`${p.source}-${p.title}`}>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="policy__title">
                          {p.title}
                        </a>
                      ) : (
                        <span className="policy__title">{p.title}</span>
                      )}
                      <br />
                      <span className="mail__meta">
                        {p.source}
                        {p.date ? ` · ${formatDate(p.date, locale)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mail__meta">{t("policyNote")}</p>
            </section>
          ) : null}
          <p className="mail__foot">{t("foot")}</p>
        </div>
      </article>
    </div>
  );
}
