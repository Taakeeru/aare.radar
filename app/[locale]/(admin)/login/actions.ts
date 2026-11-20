"use server";

/**
 * Team sign-in and sign-out. Ported from the client template
 * app/[locale]/(auth)/login/actions.ts loginWithPasswordAction
 * and app/[locale]/profile/actions.ts logoutEverywhereAction:
 *
 *   - rate limits 10 failures per address and 5 per e-mail in 15 minutes
 *     (the template's numbers; this app counts failures only), both must pass; a block gets
 *     its own message so a person who mistyped five times is not told «wrong
 *     password» forever;
 *   - the second-factor state is read before the cookie is set and fails
 *     closed (lib/totp-store.ts);
 *   - one generic message for every other failure: never whether the e-mail
 *     exists, is an admin, or the password was wrong (checkCredentials also
 *     costs the same scrypt work every time);
 *   - an account with a second factor goes to /auth/2fa before the admin opens;
 *   - `next` only ever a path on this site (lib/safe-next.ts);
 *   - sign-out ends EVERY session of the account (the template «auf allen Geräten
 *     abmelden»): a copied cookie stops working too.
 *
 * Origin: Next checks the Origin of every server action against the host
 * (lib/__tests__/csrf.test.ts keeps that check on).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkCredentials, getUserFromSessionCookie, revokeSessions, SESSION_COOKIE, setSessionCookie, TOTP_COOKIE } from "@/lib/auth";
import { isRateLimited, recordFailure } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { needsSecondFactor } from "@/lib/totp-store";
import { safeNextPath } from "@/lib/safe-next";
import { logAdminAction } from "@/lib/admin-audit";
import { toLocale } from "@/i18n/routing";

/** `email` comes back so the field keeps it: React resets a form after its action runs. */
export type LoginState = { error: "" | "invalid_login" | "too_many_attempts"; email: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(formData.get("password") ?? "");
  const locale = toLocale(formData.get("locale"));
  const next = safeNextPath(formData.get("next"), `/${locale}/admin`);

  if (!email || !password || password.length > 1024) return { error: "invalid_login", email };

  const ip = await getClientIp();
  const ipKey = `pw:ip:${ip}`;
  const emailKey = `pw:email:${email}`;
  // Failures only (lib/rate-limit.ts): the check creates no entry, a failed attempt does.
  if ((await isRateLimited(ipKey, 10)) || (await isRateLimited(emailKey, 5))) return { error: "too_many_attempts", email };

  const user = checkCredentials(email, password);
  if (!user) {
    await Promise.all([recordFailure(ipKey, 10), recordFailure(emailKey, 5)]);
    return { error: "invalid_login", email };
  }

  // The second-factor state is read BEFORE any cookie is set. If it cannot be
  // read, the sign-in is refused with the same generic message (fail closed:
  // an admin with a factor must never get in without it).
  let secondStep: boolean;
  try {
    secondStep = needsSecondFactor(user);
  } catch {
    return { error: "invalid_login", email };
  }

  const cookieStore = await cookies();
  setSessionCookie(cookieStore, user.id);
  cookieStore.delete(TOTP_COOKIE);
  logAdminAction({ adminUserId: user.id, action: "login", targetType: "user", targetId: user.id });

  if (secondStep) redirect(`/${locale}/auth/2fa?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  const cookieStore = await cookies();
  const user = await getUserFromSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  if (user) {
    revokeSessions(user.id);
    logAdminAction({ adminUserId: user.id, action: "logout", targetType: "user", targetId: user.id });
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(TOTP_COOKIE);
  redirect(`/${locale}/login?loggedout=1`);
}
