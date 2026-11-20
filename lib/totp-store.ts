/**
 * Ported from the client template lib/totp-store.ts. This app has
 * no role matrix: the team's admin accounts (users.is_admin) are the ones
 * with a second step; the audit row goes through lib/admin-audit.ts.
 *
 * The database half of the second factor (G6): user_totp rows. Server only.
 * The arithmetic is lib/totp.ts; the session binding is lib/auth.ts
 * (signTotpProof / totpProofValid); the guard is lib/admin-guard.ts.
 *
 * FAILS CLOSED (this app, security review of PR #1; the template answers "not enrolled"):
 * a read that fails throws TotpUnavailableError. An admin with a second
 * factor must never be treated as one without, so the sign-in refuses with
 * its generic error (app/[locale]/(admin)/login/actions.ts) and the admin
 * guard keeps the area shut (lib/admin-guard.ts). The error is logged here,
 * without the account.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userTotp, users, type UserTotp } from "@/drizzle/schema";
import {
  consumeBackupCode,
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  looksLikeBackupCode,
  verifyTotp,
} from "@/lib/totp";
import { revokeSessions } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";

export class TotpUnavailableError extends Error {
  constructor() {
    super("second-factor state could not be read");
    this.name = "TotpUnavailableError";
  }
}

/** The account's row, or null when it has none. Throws TotpUnavailableError when the read fails. */
export function getTotp(userId: string): UserTotp | null {
  try {
    return (db.select().from(userTotp).where(eq(userTotp.userId, userId)).get() as UserTotp | undefined) ?? null;
  } catch (e) {
    console.error("[totp] read failed:", (e as Error)?.name);
    throw new TotpUnavailableError();
  }
}

export function isTotpEnabled(userId: string): boolean {
  return !!getTotp(userId)?.enabledAt;
}

function parseHashes(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Start (or restart) the FIRST enrolment: a new secret, not enabled. A row that
 * is already enabled is left alone: a new phone goes through startReenrolment
 * (needs a current code), a lost phone through an admin reset.
 */
export function startEnrolment(userId: string): { secret: string } | { error: "already_enabled" } {
  const existing = getTotp(userId);
  if (existing?.enabledAt) return { error: "already_enabled" };
  const secret = generateSecret();
  const now = new Date().toISOString();
  db.insert(userTotp)
    .values({ userId, secret, enabledAt: null, lastUsedStep: null, backupCodes: "[]", createdAt: now, pendingSecret: null })
    .onConflictDoUpdate({
      target: userTotp.userId,
      set: { secret, enabledAt: null, lastUsedStep: null, backupCodes: "[]", createdAt: now, pendingSecret: null },
    })
    .run();
  return { secret };
}

/**
 * Re-setup (new phone): needs a current code or a backup code of the LIVE
 * factor, then parks a fresh secret as `pending_secret`. The old secret and the
 * old backup codes stay active until enableTotp confirms the new one, so the
 * account is never without a second factor.
 */
export function startReenrolment(
  userId: string,
  typed: string,
  nowMs: number = Date.now(),
): { ok: true; secret: string } | { ok: false; error: "not_enabled" | "invalid_code" } {
  const row = getTotp(userId);
  if (!row?.enabledAt) return { ok: false, error: "not_enabled" };
  if (!checkSecondFactor(userId, typed, nowMs).ok) return { ok: false, error: "invalid_code" };
  const secret = generateSecret();
  db.update(userTotp).set({ pendingSecret: secret }).where(eq(userTotp.userId, userId)).run();
  return { ok: true, secret };
}

/** Drop a pending re-setup; the live factor is untouched. */
export function cancelReenrolment(userId: string): void {
  db.update(userTotp).set({ pendingSecret: null }).where(eq(userTotp.userId, userId)).run();
}

export type EnableResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: "not_started" | "already_enabled" | "invalid_code" };

/**
 * Verify one code against the pending secret; on success the factor is live
 * and the backup codes are returned ONCE. For a re-setup the pending secret
 * replaces the live one and the old backup codes are replaced by new ones.
 */
export function enableTotp(userId: string, code: string, nowMs: number = Date.now()): EnableResult {
  const row = getTotp(userId);
  if (!row) return { ok: false, error: "not_started" };
  if (row.enabledAt && !row.pendingSecret) return { ok: false, error: "already_enabled" };
  const target = row.enabledAt ? row.pendingSecret! : row.secret;
  const v = verifyTotp(target, code, { nowMs, lastUsedStep: null });
  if (!v.ok) return { ok: false, error: "invalid_code" };
  const codes = generateBackupCodes();
  db.update(userTotp)
    .set({
      secret: target,
      pendingSecret: null,
      // A re-setup (new phone) counts as a new factor: enabledAt moves, so
      // «enrolled since» (email-change proof, revert) sees the change.
      enabledAt: new Date(nowMs).toISOString(),
      lastUsedStep: v.step,
      backupCodes: JSON.stringify(codes.map(hashBackupCode)),
    })
    .where(eq(userTotp.userId, userId))
    .run();
  return { ok: true, backupCodes: codes };
}

export type CheckResult = { ok: true; via: "totp" | "backup"; backupCodesLeft: number } | { ok: false };

/**
 * The login step: a 6-digit code (replay-protected through last_used_step)
 * or a backup code (removed on use). Rate limiting is the caller's job.
 */
export function checkSecondFactor(userId: string, typed: string, nowMs: number = Date.now()): CheckResult {
  const row = getTotp(userId);
  if (!row?.enabledAt) return { ok: false };
  const hashes = parseHashes(row.backupCodes);
  if (looksLikeBackupCode(typed)) {
    const remaining = consumeBackupCode(hashes, typed);
    if (!remaining) return { ok: false };
    db.update(userTotp).set({ backupCodes: JSON.stringify(remaining) }).where(eq(userTotp.userId, userId)).run();
    return { ok: true, via: "backup", backupCodesLeft: remaining.length };
  }
  const v = verifyTotp(row.secret, typed, { nowMs, lastUsedStep: row.lastUsedStep });
  if (!v.ok) return { ok: false };
  db.update(userTotp).set({ lastUsedStep: v.step }).where(eq(userTotp.userId, userId)).run();
  return { ok: true, via: "totp", backupCodesLeft: hashes.length };
}

export type AdminResetResult = { ok: true } | { ok: false; error: "self_reset" | "user_not_found" | "not_enrolled" };

/**
 * Admin reset (lost phone, no backup codes): the person's row goes, so they
 * must enrol again at their next visit. An admin cannot reset their own factor
 * (that would be the "easy switch-off" through the back door). Audited as
 * reset_2fa. The caller checks the permission (users.manage).
 */
export function adminResetTotp(args: { actorId: string; targetUserId: string }): AdminResetResult {
  if (args.actorId === args.targetUserId) return { ok: false, error: "self_reset" };
  const target = db.select().from(users).where(eq(users.id, args.targetUserId)).get();
  if (!target) return { ok: false, error: "user_not_found" };
  const row = getTotp(args.targetUserId);
  if (!row) return { ok: false, error: "not_enrolled" };
  // The person signs in again and enrols afresh: a cookie that passed the old
  // second factor must not outlive it (session-gate-parity.test.ts).
  db.delete(userTotp).where(eq(userTotp.userId, args.targetUserId)).run();
  revokeSessions(args.targetUserId);
  logAdminAction({
    adminUserId: args.actorId,
    action: "reset_2fa",
    targetType: "user",
    targetId: args.targetUserId,
    detail: { targetEmail: target.email, targetName: target.name },
    before: { enabled: !!row.enabledAt },
    after: { enabled: false },
  });
  return { ok: true };
}

export function backupCodesLeft(userId: string): number {
  return parseHashes(getTotp(userId)?.backupCodes).length;
}

/** After a login: does this account have to pass the second step before the admin area opens? */
export function needsSecondFactor(user: { id: string; isAdmin?: boolean | null }): boolean {
  return !!user.isAdmin && isTotpEnabled(user.id);
}

/**
 * Remove the second factor when it was enrolled or changed at or after
 * `sinceIso` (inside the caller's transaction). The e-mail change revert uses
 * it: a factor added after a taken-over change is the taker's. Returns
 * whether a row went.
 */
export function dropTotpEnabledSinceInTx(userId: string, sinceIso: string): boolean {
  const row = getTotp(userId);
  if (!row || !sinceIso) return false;
  if (row.enabledAt && row.enabledAt < sinceIso) return false;
  db.delete(userTotp).where(eq(userTotp.userId, userId)).run();
  return true;
}
