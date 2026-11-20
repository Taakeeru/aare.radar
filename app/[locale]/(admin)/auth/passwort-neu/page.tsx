import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { peekMagicLink, PASSWORD_RESET_PURPOSES } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { resetPasswordAction } from "@/app/[locale]/(admin)/passwort-vergessen/actions";

/**
 * /{locale}/auth/passwort-neu?t=<token> — choose a new password (port of the template
 * app/[locale]/(auth)/auth/passwort-neu/page.tsx). Opening the page consumes
 * NOTHING (peekMagicLink): mail scanners fetch every link in a mail. The token
 * is spent by resetPasswordAction, a form POST. The page sends only its origin
 * as Referer (lib/referrer-policy.ts), so the token does not travel on.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newPassword");
  return { title: t("title") };
}

const ERRORS = new Set(["too_short", "too_long", "mismatch", "rate_limited"]);

export default async function NewPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string | string[]; error?: string | string[] }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const error = typeof sp.error === "string" && ERRORS.has(sp.error) ? sp.error : "";

  const ip = await getClientIp();
  if (!(await checkRateLimit(`verify:ip:${ip}`, 30, 60 * 1000))) redirect(`/${locale}/login`);
  if (!token) redirect(`/${locale}/passwort-vergessen?error=invalid_or_expired`);
  const link = await peekMagicLink(token, PASSWORD_RESET_PURPOSES);
  if (!link) redirect(`/${locale}/passwort-vergessen?error=invalid_or_expired`);

  const t = await getTranslations("newPassword");
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{t("intro", { email: link.user.email, min: MIN_PASSWORD_LENGTH })}</p>
      <form action={resetPasswordAction} className="form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="t" value={token} />
        {error ? (
          <p className="form-error" role="alert" id="newpw-error">
            {t(error)}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="new-password">{t("password")}</label>
          <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={1024} aria-describedby={error ? "newpw-error" : undefined} />
        </div>
        <div className="field">
          <label htmlFor="new-password-repeat">{t("repeat")}</label>
          <input id="new-password-repeat" name="password_repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={1024} />
        </div>
        <div>
          <button type="submit" className="btn btn--primary">
            {t("submit")}
          </button>
        </div>
      </form>
    </>
  );
}
