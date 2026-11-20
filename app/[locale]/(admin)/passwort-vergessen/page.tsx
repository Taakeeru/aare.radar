import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { requestPasswordResetAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("forgot");
  return { title: t("title") };
}

const ERRORS = new Set(["invalid_email", "invalid_or_expired"]);

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("forgot");
  const error = sp.error && ERRORS.has(sp.error) ? sp.error : "";
  return (
    <>
      <Link href="/login">{t("back")}</Link>
      <h1>{t("title")}</h1>
      {sp.sent ? (
        <p role="status" className="lead">
          {t("sent")}
        </p>
      ) : (
        <>
          <p>{t("intro")}</p>
          <form action={requestPasswordResetAction} className="form" noValidate>
            <input type="hidden" name="locale" value={locale} />
            {error ? (
              <p className="form-error" role="alert" id="forgot-error">
                {t(error)}
              </p>
            ) : null}
            <div className="field">
              <label htmlFor="pw-email">{t("email")}</label>
              <input id="pw-email" name="email" type="email" autoComplete="username" required aria-describedby={error ? "forgot-error" : undefined} />
            </div>
            <div>
              <button type="submit" className="btn btn--primary">
                {t("submit")}
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
