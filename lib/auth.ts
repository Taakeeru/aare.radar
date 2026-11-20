/**
 * Sessions, password reset tokens and the second-factor proof. Ported from
 * the client template lib/auth.ts, without the template's member parts
 * (magic-link login, invitations, guest accounts, e-mail change, early access,
 * the Daten-Check gate).
 *
 * What is the same as the template:
 *   - the session cookie is `${userId}.${expiresAt}.${hmac}` with
 *     HMAC-SHA256(AUTH_SECRET); the issue time is the expiry minus the fixed
 *     lifetime and is covered by the signature;
 *   - a cookie issued before the account's `session_revocations.revoked_before`
 *     is refused on every request (getUserFromSessionCookie is the one gate);
 *     sign-out, a new password and an admin 2FA reset write that stamp;
 *   - mailed reset links: random 32-byte token, only its SHA-256 stored,
 *     single use (BEGIN IMMEDIATE), 30 minutes, purpose `password_reset`;
 *     the reset page only peeks, the form POST consumes;
 *   - setPasswordAndRevokeSessions is THE way a password is written: one
 *     transaction with the end of every session and every open reset link;
 *   - the TOTP proof cookie is an HMAC over THIS session, so a new sign-in
 *     asks for the code again;
 *   - cookie options: HttpOnly, Secure in production, SameSite=Lax, path /.
 *
 * What is different, and why:
 *   - lifetime 7 days, not sliding (the template: 180 days with a refresh endpoint, for
 *     members). This cookie only opens the team's admin area;
 *   - checkCredentials always does one scrypt check, against a fixed dummy hash
 *     when the address has no admin password (security review of PR #1: the template's
 *     password login returns early for an unknown address);
 *   - an @demo.invalid account (Pandora's CI demo admin) is refused unless the
 *     server runs as a demo instance (DEMO_INSTANCE=1).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { magicLinkTokens, sessionRevocations, userPasswords, users, type User } from "@/drizzle/schema";
import { verifyPassword } from "@/lib/password";
import { logError } from "@/lib/log-redact";

// ── Constants ────────────────────────────────────────────────────────────────

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "radar_session";
export const TOTP_COOKIE = "radar_totp";
/** The template's default lifetime of a mailed link (lib/link-validity.ts). */
export const RESET_LINK_TTL_MS = 30 * 60 * 1000;

export type MagicLinkPurpose = "password_reset";
export const PASSWORD_RESET_PURPOSES: MagicLinkPurpose[] = ["password_reset"];

/**
 * A fixed scrypt `salt:hash` (the format of lib/password.ts) that no password
 * matches in practice. Checked when the address has no admin password, so a
 * sign-in costs the same scrypt work either way.
 */
export const DUMMY_PASSWORD_HASH =
  "c0ffee00c0ffee00c0ffee00c0ffee00:b6cc016a0be0015abc57c02cf3d99cf5e3a8265417c5e875c28ef87c0d3757ea0abe2e382df5a03fcaaa8d07652a84dc6ac3b9c20dba2172db52365b0c613a9b";

export const DEMO_DOMAIN = "demo.invalid";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET env var missing or too short (need 32+ chars). " +
        "Generate with: openssl rand -hex 32",
    );
  }
  return s;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function isDemoInstance(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_INSTANCE === "1";
}

/** Pandora's demo/CI accounts live at the reserved demo.invalid domain; only a demo instance accepts them. */
export function isDemoAccountEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
}

// ── Credentials ──────────────────────────────────────────────────────────────

/**
 * The admin with this e-mail and password, or null. Never says why: an unknown
 * address, a non-admin, a missing password and a wrong password all answer
 * null, and all cost one scrypt check.
 */
export function checkCredentials(email: string, password: string): User | null {
  const normalized = email.trim().toLowerCase();
  let user: User | undefined;
  let stored: string | undefined;
  try {
    user = db.select().from(users).where(sql`lower(${users.email}) = ${normalized}`).get();
    if (user?.isAdmin && (isDemoInstance() || !isDemoAccountEmail(user.email))) {
      stored = db.select().from(userPasswords).where(eq(userPasswords.userId, user.id)).get()?.passwordHash;
    }
  } catch (e) {
    console.error("[auth] password login lookup failed:", logError(e));
  }
  if (!user || !stored) {
    verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  return verifyPassword(password, stored) ? user : null;
}

// ── Password reset links ─────────────────────────────────────────────────────

/**
 * Mint a password-reset token for an EXISTING user. Never creates an account:
 * "forgot password" for an address we do not know does nothing (the caller
 * shows the same "check your email" page). Earlier unused reset tokens of the
 * same user are retired first, so only the newest mail works.
 */
export function mintPasswordResetToken(userId: string, ttlMs: number = RESET_LINK_TTL_MS): string {
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  db.update(magicLinkTokens)
    .set({ usedAt: now })
    .where(and(eq(magicLinkTokens.userId, userId), eq(magicLinkTokens.purpose, "password_reset"), isNull(magicLinkTokens.usedAt)))
    .run();
  db.insert(magicLinkTokens)
    .values({
      tokenHash: sha256(token),
      userId,
      purpose: "password_reset",
      payload: null,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      createdAt: now,
    })
    .run();
  return token;
}

/**
 * Look a token up WITHOUT consuming it (the reset PAGE calls this on open, so
 * a link fetched by a mail scanner stays valid for the person it was sent to).
 */
export async function peekMagicLink(
  token: string,
  purposes: MagicLinkPurpose[] = PASSWORD_RESET_PURPOSES,
): Promise<{ user: User; purpose: MagicLinkPurpose } | null> {
  const now = new Date().toISOString();
  const row = db
    .select()
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.tokenHash, sha256(token)), gt(magicLinkTokens.expiresAt, now), isNull(magicLinkTokens.usedAt)))
    .get();
  if (!row || !purposes.includes(row.purpose)) return null;
  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  return user ? { user, purpose: row.purpose } : null;
}

/**
 * Spend a token. Single use: the SELECT and the UPDATE run inside BEGIN
 * IMMEDIATE, so two concurrent requests cannot both pass the unused check.
 */
export async function consumeMagicLink(
  token: string,
  purposes: MagicLinkPurpose[] = PASSWORD_RESET_PURPOSES,
): Promise<{ user: User; purpose: MagicLinkPurpose } | null> {
  const tokenHash = sha256(token);
  const now = new Date().toISOString();
  let user: User | undefined;
  let purpose: MagicLinkPurpose | undefined;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .select()
      .from(magicLinkTokens)
      .where(and(eq(magicLinkTokens.tokenHash, tokenHash), gt(magicLinkTokens.expiresAt, now), isNull(magicLinkTokens.usedAt)))
      .get();
    if (row && purposes.includes(row.purpose)) {
      db.update(magicLinkTokens).set({ usedAt: now }).where(eq(magicLinkTokens.tokenHash, tokenHash)).run();
      user = db.select().from(users).where(eq(users.id, row.userId)).get();
      purpose = row.purpose;
    }
    sqlite.exec("COMMIT");
  } catch (e) {
    sqlite.exec("ROLLBACK");
    throw e;
  }
  return user && purpose ? { user, purpose } : null;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Stamp the last sign-in. Never fatal. */
export function recordLogin(userId: string, at: Date = new Date()): void {
  try {
    db.update(users).set({ lastLoginAt: at.toISOString() }).where(eq(users.id, userId)).run();
  } catch (e) {
    console.error("[auth] last login stamp failed:", (e as Error)?.name ?? "error");
  }
}

/** A signed session cookie value: `${userId}.${expiresAt}.${sig}`. */
export function signSession(userId: string, now: number = Date.now()): { value: string; expiresAt: Date } {
  recordLogin(userId, new Date(now));
  const payload = `${userId}.${now + SESSION_TTL_MS}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return { value: `${payload}.${sig}`, expiresAt: new Date(now + SESSION_TTL_MS) };
}

/** Who a cookie belongs to and when it was issued; null if forged, malformed or expired. */
function readSession(cookieValue: string, now: number = Date.now()): { userId: string; issuedAt: number } | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, sig] = parts as [string, string, string];
  const expectedSig = createHmac("sha256", getSecret()).update(`${userId}.${expiresAtStr}`).digest("hex");
  // Constant-time compare to prevent signature-leak timing attacks.
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (Number.isNaN(expiresAt) || expiresAt < now) return null;
  return { userId, issuedAt: expiresAt - SESSION_TTL_MS };
}

/**
 * Signature and expiry ONLY; does not know about revoked sessions. Code that
 * decides whether someone is signed in goes through getUserFromSessionCookie
 * (lib/__tests__/session-gate-parity.test.ts).
 */
export function verifySession(cookieValue: string): string | null {
  return readSession(cookieValue)?.userId ?? null;
}

/** The one set of options for the session and proof cookies. */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: expiresAt,
    path: "/",
  };
}

type CookieJar = {
  set(name: string, value: string, opts?: Record<string, unknown>): unknown;
};

export function setSessionCookie(jar: CookieJar, userId: string): void {
  const session = signSession(userId);
  jar.set(SESSION_COOKIE, session.value, sessionCookieOptions(session.expiresAt));
}

/**
 * End every session of this account, on every device. Cookies issued before
 * this moment stop working; one issued afterwards (the next sign-in) is fine.
 */
export function revokeSessions(userId: string, at: Date = new Date()): void {
  const revokedBefore = at.toISOString();
  db.insert(sessionRevocations)
    .values({ userId, revokedBefore })
    .onConflictDoUpdate({ target: sessionRevocations.userId, set: { revokedBefore } })
    .run();
}

/**
 * THE way a password is written: one transaction with the new hash, the end
 * of every session the account has, and the end of every open reset link.
 */
export function setPasswordAndRevokeSessions(userId: string, passwordHash: string): void {
  const now = new Date();
  const nowIso = now.toISOString();
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    db.insert(userPasswords)
      .values({ userId, passwordHash, updatedAt: nowIso })
      .onConflictDoUpdate({ target: userPasswords.userId, set: { passwordHash, updatedAt: nowIso } })
      .run();
    revokeSessions(userId, now);
    db.update(magicLinkTokens)
      .set({ usedAt: nowIso })
      .where(and(eq(magicLinkTokens.userId, userId), isNull(magicLinkTokens.usedAt)))
      .run();
    sqlite.exec("COMMIT");
  } catch (e) {
    sqlite.exec("ROLLBACK");
    throw e;
  }
}

/**
 * The account a session cookie belongs to, or null: forged, expired, revoked
 * (issued before the account's revocation stamp), or the account is gone. If
 * the lookup itself fails, «cannot tell» answers null, never «signed in».
 */
export async function getUserFromSessionCookie(cookieValue: string | undefined, now: number = Date.now()): Promise<User | null> {
  if (!cookieValue) return null;
  try {
    const session = readSession(cookieValue, now);
    if (!session) return null;
    const revocation = db.select().from(sessionRevocations).where(eq(sessionRevocations.userId, session.userId)).get();
    if (revocation && session.issuedAt < Date.parse(revocation.revokedBefore)) return null;
    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) return null;
    if (isDemoAccountEmail(user.email) && !isDemoInstance()) return null;
    return user;
  } catch (err) {
    console.error("[auth] Failed to resolve session:", logError(err));
    return null;
  }
}

// ── Second-factor proof ──────────────────────────────────────────────────────
//
// Passing the TOTP step is recorded in a second cookie, bound to THIS session
// cookie: an HMAC over the session payload, so it proves nothing for any other
// session, and a new sign-in starts without proof.

function totpProofFor(session: { userId: string; issuedAt: number }): string {
  const payload = `totp-ok.${session.userId}.${session.issuedAt + SESSION_TTL_MS}`;
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function signTotpProof(sessionCookieValue: string | undefined): { value: string; expiresAt: Date } | null {
  if (!sessionCookieValue) return null;
  const session = readSession(sessionCookieValue);
  if (!session) return null;
  return { value: totpProofFor(session), expiresAt: new Date(session.issuedAt + SESSION_TTL_MS) };
}

export function totpProofValid(sessionCookieValue: string | undefined, proofValue: string | undefined): boolean {
  if (!sessionCookieValue || !proofValue) return false;
  const session = readSession(sessionCookieValue);
  if (!session) return false;
  const a = Buffer.from(proofValue, "hex");
  const b = Buffer.from(totpProofFor(session), "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
