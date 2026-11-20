import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { getUserFromSessionCookie, SESSION_COOKIE, TOTP_COOKIE, totpProofValid } from "@/lib/auth";
import { needsSecondFactor } from "@/lib/totp-store";
import { safeNextPath } from "@/lib/safe-next";
import { verifySecondFactorAction } from "./actions";

/**
 * /{locale}/auth/2fa?next=… — the code after the password (port of the template
 * app/[locale]/(auth)/auth/2fa/page.tsx). Shown only to a signed-in admin with
 * an enabled second factor whose session has not passed it yet.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("twofa");
  return { title: t("title") };
}

export default async function SecondFactorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : "", `/${locale}/admin`);
  const error = sp.error === "invalid_code" || sp.error === "rate_limited" ? sp.error : "";
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getUserFromSessionCookie(sessionValue);
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  if (!needsSecondFactor(user) || totpProofValid(sessionValue, cookieStore.get(TOTP_COOKIE)?.value)) redirect(next);
  const t = await getTranslations("twofa");
  return (
    <>
      <h1>{t("title")}</h1>
      <p className="muted">{t("intro", { email: user.email })}</p>
      <form action={verifySecondFactorAction} className="form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={next} />
        {error ? (
          <p className="form-error" role="alert" id="totp-error">
            {t(error)}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="totp-code">{t("code")}</label>
          <input
            id="totp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={16}
            aria-describedby={error ? "totp-error" : undefined}
          />
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
