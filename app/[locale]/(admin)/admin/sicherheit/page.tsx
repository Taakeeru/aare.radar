import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { requireAdminOrRedirect } from "@/lib/admin-guard";
import { backupCodesLeft, getTotp } from "@/lib/totp-store";
import { formatSecret, otpauthUri } from "@/lib/totp";
import { cancelReenrolmentAction, startEnrolmentAction, startReenrolmentAction } from "./actions";
import { EnableTotpForm } from "./enable-form";
import { QrCode } from "./qr-code";

/**
 * /{locale}/admin/sicherheit — the team member's second factor (port of the template
 * app/[locale]/profile/sicherheit/page.tsx). Asks the admin guard with
 * `setupPage`: an admin without a factor always reaches it, also when the
 * factor is mandatory (ADMIN_TOTP_REQUIRED), so the way in always exists.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("security");
  return { title: t("title") };
}

export default async function SecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ required?: string; warn?: string; error?: string }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const { user } = await requireAdminOrRedirect(locale, `/${locale}/admin/sicherheit`, { setupPage: true });
  const sp = await searchParams;
  const t = await getTranslations("security");
  const copy = Object.fromEntries(
    ["codeLabel", "enable", "enableReset", "enabledTitle", "backupIntro", "backupOnce", "err_invalid_code", "err_rate_limited", "err_not_started", "err_not_allowed"].map((k) => [k, t(k)]),
  );
  const row = getTotp(user.id);
  const enabled = !!row?.enabledAt;
  const pendingSecret = enabled ? row?.pendingSecret : row?.secret;
  const error = sp.error === "invalid_code" || sp.error === "rate_limited" ? sp.error : "";

  return (
    <>
      <Link href="/admin">{t("back")}</Link>
      <h1 className="h-admin">{t("title")}</h1>
      {sp.required && !enabled ? <p className="notice">{t("required")}</p> : null}
      {sp.warn === "backup_low" ? <p className="notice">{t("backupLow")}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {t(`err_${error}`)}
        </p>
      ) : null}
      <p>{enabled ? t("statusOn") : t("statusOff")}</p>
      {enabled ? <p className="muted">{t("backupLeft", { count: backupCodesLeft(user.id) })}</p> : null}

      {pendingSecret ? (
        <section className="prose" aria-label={t("start")}>
          <p>{t("scan")}</p>
          <QrCode value={otpauthUri({ secretBase32: pendingSecret, account: user.email, issuer: "AareRadar" })} label={t("qrLabel")} />
          <p>
            {t("secretLabel")}: <span className="secret">{formatSecret(pendingSecret)}</span>
          </p>
          <EnableTotpForm
            copy={copy}
            reenrol={enabled}
            cancel={enabled ? { action: cancelReenrolmentAction, label: t("cancel"), locale } : undefined}
          />
        </section>
      ) : enabled ? (
        <section className="prose" aria-labelledby="reenrol-title">
          <h2 id="reenrol-title">{t("reenrolTitle")}</h2>
          <p>{t("reenrolIntro")}</p>
          <form action={startReenrolmentAction} className="form">
            <input type="hidden" name="locale" value={locale} />
            <div className="field">
              <label htmlFor="reenrol-code">{t("codeLabel")}</label>
              <input id="reenrol-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={16} />
            </div>
            <div>
              <button type="submit" className="btn btn--outline">
                {t("reenrolStart")}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <form action={startEnrolmentAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn btn--primary">
            {t("start")}
          </button>
        </form>
      )}
    </>
  );
}
