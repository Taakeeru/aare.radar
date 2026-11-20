"use server";

/**
 * «Passwort vergessen» and «Neues Passwort». Ported from the client template
 * app/[locale]/(auth)/passwort-vergessen/actions.ts. This is the
 * ONLY way a password is set: nobody types a password for someone else (a new
 * team member gets an account without a password and uses this page).
 *
 * Request: always the same «check your email» page, whether or not the
 * address has an account and whether or not a rate limit was hit, and the
 * same TIME: nothing that depends on the address happens before the response
 * (the lookup and the mail run in `after`). Do not move the lookup back up.
 *
 * Set: input is validated BEFORE the token is consumed (a typo keeps the link
 * valid); consuming is atomic and restricted to password_reset tokens; saving
 * ends every session and every open link of the account in one transaction
 * (setPasswordAndRevokeSessions). The person is not signed in here: they sign
 * in with the new password, which proves it works.
 */
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { consumeMagicLink, isDemoAccountEmail, isDemoInstance, mintPasswordResetToken, PASSWORD_RESET_PURPOSES, setPasswordAndRevokeSessions } from "@/lib/auth";
import { sendPasswordChangedNotice, sendPasswordReset } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { db } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { logAdminAction } from "@/lib/admin-audit";
import { toLocale, type Locale } from "@/i18n/routing";
import { logError } from "@/lib/log-redact";

export async function requestPasswordResetAction(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const sentUrl = `/${locale}/passwort-vergessen?sent=1`;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/${locale}/passwort-vergessen?error=invalid_email`);
  }

  const ip = await getClientIp();
  const [ipAllowed, emailAllowed] = await Promise.all([
    checkRateLimit(`pwreset:ip:${ip}`, 5, 15 * 60 * 1000, true),
    checkRateLimit(`pwreset:email:${email}`, 3, 15 * 60 * 1000, true),
  ]);
  if (!ipAllowed || !emailAllowed) redirect(sentUrl);

  after(() => deliverPasswordReset(email, locale));
  redirect(sentUrl);
}

/** The part that depends on who asked. Runs after the response; never throws. */
export async function deliverPasswordReset(email: string, locale: Locale): Promise<void> {
  try {
    const user = db.select().from(users).where(sql`lower(${users.email}) = ${email}`).get();
    if (!user || !user.isAdmin) return;
    if (isDemoAccountEmail(user.email) && !isDemoInstance()) return;
    const token = mintPasswordResetToken(user.id);
    const sent = await sendPasswordReset({ to: user.email, token, locale });
    if (!sent.ok) console.error("[auth] password-reset mail not sent:", sent.error);
  } catch (e) {
    console.error("[auth] password-reset request failed:", logError(e));
  }
}

export async function resetPasswordAction(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const token = String(formData.get("t") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("password_repeat") ?? "");
  const back = (error: string) => `/${locale}/auth/passwort-neu?t=${encodeURIComponent(token)}&error=${error}`;

  if (!token) redirect(`/${locale}/passwort-vergessen?error=invalid_or_expired`);

  const ip = await getClientIp();
  if (!(await checkRateLimit(`pwreset:set:${ip}`, 10, 15 * 60 * 1000, true))) redirect(back("rate_limited"));

  if (password.length < MIN_PASSWORD_LENGTH) redirect(back("too_short"));
  if (password.length > 1024) redirect(back("too_long"));
  if (password !== repeat) redirect(back("mismatch"));

  const link = await consumeMagicLink(token, PASSWORD_RESET_PURPOSES);
  if (!link) redirect(`/${locale}/passwort-vergessen?error=invalid_or_expired`);

  setPasswordAndRevokeSessions(link.user.id, hashPassword(password));
  logAdminAction({ adminUserId: link.user.id, action: "password_reset", targetType: "user", targetId: link.user.id, detail: { via: "reset_link" } });

  const to = link.user.email;
  after(async () => {
    try {
      await sendPasswordChangedNotice({ to, locale });
    } catch (e) {
      console.error("[auth] password-changed notice failed:", logError(e));
    }
  });

  // The template adds the address to this URL to pre-fill the form; this app leaves it out
  // (no e-mail address in a URL, so none in a proxy log).
  redirect(`/${locale}/login?changed=1`);
}
