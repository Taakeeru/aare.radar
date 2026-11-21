import type { ReactNode } from "react";
import { PageIcon } from "@/components/page-icon";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RoleSwitch } from "@/components/role-switch";
import { toLocale } from "@/i18n/routing";
import { loadRadar, type Radar, type RadarRole } from "@/lib/radar";
import { ageInDays, formatInt, pickSources, roleById } from "@/lib/radar-view";

export type QuestionSearchParams = Promise<{ role?: string | string[] }>;

/** Everything a question page needs: radar data, the chosen role, translators and formatters. */
export async function loadQuestionPage(params: Promise<{ locale: string }>, searchParams: QuestionSearchParams) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("dash");
  const q = await getTranslations("questions");
  const c = await getTranslations("common");
  const rolesT = await getTranslations("roles");
  const result = loadRadar();
  if (!result.ok) {
    return {
      fail: (
        <div className="page">
          <h1 className="page__title">{t("title")}</h1>
          <section className="panel" role="alert">
            <h2 className="panel__title">{t("unavailableTitle")}</h2>
            <p>{t("unavailableText")}</p>
          </section>
        </div>
      ),
    };
  }
  const data: Radar = result.data;
  const wanted = typeof sp.role === "string" ? sp.role : undefined;
  const role = roleById(data, wanted);
  if (!role) {
    return {
      fail: (
        <div className="page">
          <h1 className="page__title">{t("title")}</h1>
          <p>{c("noData")}</p>
        </div>
      ),
    };
  }
  const roleName = (r: Pick<RadarRole, "id" | "label">) => (rolesT.has(r.id) ? rolesT(r.id) : r.label);
  return {
    fail: null,
    locale,
    t,
    q,
    c,
    data,
    role,
    roleName,
    chosen: wanted !== undefined,
    fmt: (n: number) => formatInt(n, locale),
    jobroom: pickSources(data, ["jobroom"]),
    age: ageInDays(data.generated_at),
  };
}

type Loaded = Extract<Awaited<ReturnType<typeof loadQuestionPage>>, { fail: null }>;

/** Page head of a question page: the question title as h1, the question, the role switch on top of the section. */
export function QuestionPageHead({ ctx, letter, base }: { ctx: Loaded; letter: "A" | "B" | "C"; base: string }) {
  const { t, q, data, role, roleName, age, chosen } = ctx;
  return (
    <header className="page-head">
      <p className="eyebrow eyebrow--icon">
        <PageIcon name={letter === "B" ? "skills" : letter === "C" ? "employers" : "demand"} />
        {q(`${letter}.title`)}
      </p>
      <h1 className="page__title" id={`q-${letter.toLowerCase()}`}>
        {q(`${letter}.title`)}
      </h1>
      <p className="page__lead">{q(`${letter}.question`)}</p>
      <RoleSwitch base={base} roles={data.roles.map((r) => ({ id: r.id, label: roleName(r) }))} current={role.id} label={t("roleLabel")} placeholder={t("rolePlaceholder")} chosen={chosen} />
      {age !== null && age >= 3 ? <p className="notice">{t("dataStale", { days: age })}</p> : null}
    </header>
  );
}
