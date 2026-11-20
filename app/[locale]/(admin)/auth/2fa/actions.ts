"use server";

/**
 * The second login step. Ported from the client template
 * app/[locale]/(auth)/auth/2fa/actions.ts. The account is
 * already signed in (session cookie); what is missing is the proof cookie that
 * lib/admin-guard.ts asks for. A right 6-digit code or backup code sets it,
 * bound to this session. Failed codes are rate limited per account and per
 * address (failures only). A second-factor read error throws (fail closed).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { toLocale } from "@/i18n/routing";
import { getUserFromSessionCookie, SESSION_COOKIE, TOTP_COOKIE, sessionCookieOptions, signTotpProof } from "@/lib/auth";
import { isRateLimited, recordFailure } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { checkSecondFactor, needsSecondFactor } from "@/lib/totp-store";
import { safeNextPath } from "@/lib/safe-next";
import { logAdminAction } from "@/lib/admin-audit";

export async function verifySecondFactorAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const next = safeNextPath(formData.get("next"), `/${locale}/admin`);
  const q = `?next=${encodeURIComponent(next)}`;

  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getUserFromSessionCookie(sessionValue);
  if (!user) redirect(`/${locale}/login${q}`);
  if (!needsSecondFactor(user)) redirect(next);

  const ip = await getClientIp();
  const userKey = `totp:user:${user.id}`;
  const ipKey = `totp:ip:${ip}`;
  if ((await isRateLimited(userKey, 5)) || (await isRateLimited(ipKey, 20))) redirect(`/${locale}/auth/2fa${q}&error=rate_limited`);

  const code = String(formData.get("code") ?? "").trim().slice(0, 32);
  const result = checkSecondFactor(user.id, code);
  if (!result.ok) {
    await Promise.all([recordFailure(userKey, 5), recordFailure(ipKey, 20)]);
    redirect(`/${locale}/auth/2fa${q}&error=invalid_code`);
  }

  const proof = signTotpProof(sessionValue);
  if (!proof) redirect(`/${locale}/login${q}`);
  cookieStore.set(TOTP_COOKIE, proof.value, sessionCookieOptions(proof.expiresAt));
  if (result.via === "backup") {
    logAdminAction({ adminUserId: user.id, action: "backup_code_used", targetType: "user", targetId: user.id, detail: { left: result.backupCodesLeft } });
  }

  if (result.via === "backup" && result.backupCodesLeft <= 2) {
    redirect(`/${locale}/admin/sicherheit?warn=backup_low`);
  }
  redirect(next);
}
