/**
 * The admin-area guard. Server only. Ported from the client template
 * lib/admin-guard.ts, without the template's role matrix (this app has one
 * kind of staff: the team, users.is_admin).
 *
 * EVERY admin page, server action and admin route handler asks this, on the
 * server, before it reads or writes anything (middleware does not decide
 * access; lib/__tests__/admin-guard-coverage.test.ts holds every file under
 * app/[locale]/(admin)/admin to it):
 *
 *   const admin = await requireAdminOrRedirect(locale);        // pages, form actions
 *   const g = await requireAdmin(); if (!g.ok) return …;       // useActionState actions, routes
 *
 * It resolves the account through getUserFromSessionCookie (the one session
 * gate: signature, expiry, revocation) and, for an account with an enabled
 * second factor, checks the proof cookie that /auth/2fa sets.
 *
 * Mandatory second factor: with ADMIN_TOTP_REQUIRED on, an admin WITHOUT a
 * factor is sent to /admin/sicherheit to set it up (that page asks only for a
 * login, never for the second factor it is setting up, so the way in always
 * exists). OFF by default, as in the template: the owner picks the day it goes on.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/drizzle/schema";
import { getUserFromSessionCookie, SESSION_COOKIE, TOTP_COOKIE, totpProofValid } from "@/lib/auth";
import { isTotpEnabled } from "@/lib/totp-store";

export type AccessDecision = "ok" | "login" | "forbidden" | "totp" | "totp_setup";
export type AdminContext = { ok: true; user: User; totpMissing: boolean };
export type GuardFailure = { ok: false; reason: Exclude<AccessDecision, "ok">; user: User | null };
export type GuardResult = AdminContext | GuardFailure;

/** On only for an explicit "1", "true" or "on"; anything else, unset included, is off. */
export function adminTotpRequired(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.ADMIN_TOTP_REQUIRED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * The decision, pure (the template lib/roles.ts accessDecision for the one role).
 * `setupPage`: the request is for the set-up page itself, which an admin
 * without a factor must reach even when the factor is mandatory.
 */
export function accessDecision(
  user: { isAdmin: boolean } | null,
  totp: { enabled: boolean; verified: boolean; required?: boolean },
  opts: { setupPage?: boolean } = {},
): AccessDecision {
  if (!user) return "login";
  if (!user.isAdmin) return "forbidden";
  if (totp.enabled && !totp.verified) return "totp";
  if (!totp.enabled && totp.required && !opts.setupPage) return "totp_setup";
  return "ok";
}

export async function requireAdmin(opts: { setupPage?: boolean } = {}): Promise<GuardResult> {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(SESSION_COOKIE)?.value;
  const user = await getUserFromSessionCookie(sessionValue);
  if (!user) return { ok: false, reason: "login", user: null };
  let enabled: boolean;
  try {
    enabled = user.isAdmin && isTotpEnabled(user.id);
  } catch {
    // Fail closed: the second-factor state is unknown, so the area stays shut
    // (lib/totp-store.ts TotpUnavailableError). Treated like «not signed in».
    return { ok: false, reason: "login", user: null };
  }
  const verified = enabled && totpProofValid(sessionValue, cookieStore.get(TOTP_COOKIE)?.value);
  const decision = accessDecision(user, { enabled, verified, required: adminTotpRequired() }, opts);
  if (decision !== "ok") return { ok: false, reason: decision, user };
  return { ok: true, user, totpMissing: !enabled };
}

/**
 * Where a refused request goes. `next` is the admin path to come back to.
 * A signed-in account that is not an admin goes to the public start page,
 * never to a page that confirms the admin area exists.
 */
export function guardTarget(failure: GuardFailure, locale: string, next: string = `/${locale}/admin`): string {
  const nextParam = `?next=${encodeURIComponent(next)}`;
  if (failure.reason === "login") return `/${locale}/login${nextParam}`;
  if (failure.reason === "totp") return `/${locale}/auth/2fa${nextParam}`;
  if (failure.reason === "totp_setup") return `/${locale}/admin/sicherheit${nextParam}&required=1`;
  return `/${locale}`;
}

/** Pages and form actions: the admin context, or a redirect. */
export async function requireAdminOrRedirect(locale: string, next?: string, opts: { setupPage?: boolean } = {}): Promise<AdminContext> {
  const g = await requireAdmin(opts);
  if (!g.ok) redirect(guardTarget(g, locale, next));
  return g;
}
