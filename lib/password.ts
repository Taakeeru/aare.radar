// Security-reviewed code of Pandora's client template, kept verbatim.
/**
 * Password hashing for optional email+password login.
 *
 * Uses Node's built-in scrypt (no external dependency). Format stored in
 * user_passwords.password_hash is `salt:hash` (both hex). Verification is
 * timing-safe.
 *
 * This backs an ADMIN-SET credential flow: the admin sets a password for a
 * team member so they can log in with an email+password pair (handy for
 * onboarding a test group without per-person magic-link emails). Magic-link
 * login remains the primary, passwordless path and is unaffected.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  let hashBuf: Buffer;
  try {
    hashBuf = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  const testBuf = scryptSync(password, salt, KEYLEN);
  // timingSafeEqual throws if lengths differ — guard first.
  if (hashBuf.length !== testBuf.length) return false;
  return timingSafeEqual(hashBuf, testBuf);
}

/** Minimum password length we accept when an admin sets one. */
export const MIN_PASSWORD_LENGTH = 8;
