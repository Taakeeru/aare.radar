"use server";

/**
 * Enrolment of the second factor. Ported from the client template
 * app/[locale]/profile/sicherheit/actions.ts. Start (a fresh
 * secret, not yet active), enable (one right code switches it on and returns
 * the eight backup codes ONCE), re-setup (a current code or backup code parks
 * a NEW secret; the old one stays live until the new one is confirmed) and
 * cancel. There is no switch-off: a lost phone is an admin reset.
 *
 * Every action asks the admin guard first (setupPage: an admin without a
 * factor reaches this even when the factor is mandatory).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toLocale } from "@/i18n/routing";
import { SESSION_COOKIE, TOTP_COOKIE, sessionCookieOptions, signTotpProof } from "@/lib/auth";
import { requireAdmin, requireAdminOrRedirect } from "@/lib/admin-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { cancelReenrolment, enableTotp, startEnrolment, startReenrolment } from "@/lib/totp-store";
import { logAdminAction } from "@/lib/admin-audit";

export type EnableState =
  | { status: "idle" }
  | { status: "error"; error: "invalid_code" | "rate_limited" | "not_started" | "not_allowed" }
  | { status: "enabled"; backupCodes: string[] };

const PAGE = (locale: string) => `/${locale}/admin/sicherheit`;

export async function startEnrolmentAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const { user } = await requireAdminOrRedirect(locale, PAGE(locale), { setupPage: true });
  if (!(await checkRateLimit(`totp:start:${user.id}`, 5, 15 * 60 * 1000))) redirect(`${PAGE(locale)}?error=rate_limited`);
  startEnrolment(user.id);
  redirect(PAGE(locale));
}

export async function enableTotpAction(_prev: EnableState, formData: FormData): Promise<EnableState> {
  const g = await requireAdmin({ setupPage: true });
  if (!g.ok) return { status: "error", error: "not_allowed" };
  if (!(await checkRateLimit(`totp:enable:${g.user.id}`, 5, 15 * 60 * 1000, true))) return { status: "error", error: "rate_limited" };
  const res = enableTotp(g.user.id, String(formData.get("code") ?? "").slice(0, 32));
  if (!res.ok) return { status: "error", error: res.error === "invalid_code" ? "invalid_code" : "not_started" };
  logAdminAction({ adminUserId: g.user.id, action: "enable_2fa", targetType: "user", targetId: g.user.id });
  // This session has just proven the factor: no second prompt right away.
  const cookieStore = await cookies();
  const proof = signTotpProof(cookieStore.get(SESSION_COOKIE)?.value);
  if (proof) cookieStore.set(TOTP_COOKIE, proof.value, sessionCookieOptions(proof.expiresAt));
  return { status: "enabled", backupCodes: res.backupCodes };
}

export async function startReenrolmentAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const { user } = await requireAdminOrRedirect(locale, PAGE(locale), { setupPage: true });
  if (!(await checkRateLimit(`totp:reenrol:${user.id}`, 5, 15 * 60 * 1000, true))) redirect(`${PAGE(locale)}?error=rate_limited`);
  const res = startReenrolment(user.id, String(formData.get("code") ?? "").slice(0, 32));
  if (!res.ok) redirect(`${PAGE(locale)}?error=invalid_code`);
  redirect(PAGE(locale));
}

export async function cancelReenrolmentAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const { user } = await requireAdminOrRedirect(locale, PAGE(locale), { setupPage: true });
  cancelReenrolment(user.id);
  redirect(PAGE(locale));
}
