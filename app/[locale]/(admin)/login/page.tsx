import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { guardTarget, requireAdmin } from "@/lib/admin-guard";
import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[]; loggedout?: string; changed?: string }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : "", `/${locale}/admin`);
  // Already in: go on. Ask the guard, not the cookie alone, so a refused state
  // (second factor unreadable, fail closed) shows this form instead of looping.
  const g = await requireAdmin();
  if (g.ok) redirect(next);
  if (g.reason === "totp") redirect(guardTarget(g, locale, next));
  const t = await getTranslations("login");
  return (
    <>
      <Link href="/">{t("back")}</Link>
      <h1>{t("title")}</h1>
      {sp.loggedout ? <p role="status">{t("loggedOut")}</p> : null}
      {sp.changed ? <p role="status">{t("passwordChanged")}</p> : null}
      <p>{t("intro")}</p>
      <LoginForm next={next} />
    </>
  );
}
