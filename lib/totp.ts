// Security-reviewed code of Pandora's client template, kept verbatim.
/**
 * TOTP (RFC 6238) on HOTP (RFC 4226) with node:crypto only: no dependency.
 * Pure functions; the database half is lib/totp-store.ts.
 *
 *   - HMAC-SHA1, 30 s step, 6 digits (the authenticator-app default).
 *   - A code is accepted for the current step and one step either side
 *     (clock drift of a phone), never for a step at or below the last one
 *     that was accepted (replay).
 *   - Secrets are 20 random bytes, shown as base32 (what the apps read) and
 *     as an otpauth:// URI.
 *   - Backup codes: 8 codes of 10 characters, stored as sha256 hex, each
 *     usable once.
 *
 * Tested against the RFC 6238 appendix vectors (lib/__tests__/totp.test.ts).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of the current one. */
export const TOTP_WINDOW = 1;
export const BACKUP_CODE_COUNT = 8;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** HOTP (RFC 4226): the code for one counter value. Digits as a zero-padded string. */
export function hotp(secret: Uint8Array, counter: number, digits: number = TOTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  // Counter as a 64-bit big-endian integer; JS numbers are exact to 2^53.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac("sha1", Buffer.from(secret)).update(buf).digest();
  const at = (i: number): number => mac[i] ?? 0;
  const offset = at(mac.length - 1) & 0x0f;
  const binary = ((at(offset) & 0x7f) << 24) | ((at(offset + 1) & 0xff) << 16) | ((at(offset + 2) & 0xff) << 8) | (at(offset + 3) & 0xff);
  const code = binary % 10 ** digits;
  return String(code).padStart(digits, "0");
}

/** The step (counter) of an instant. */
export function totpStep(atMs: number, stepSeconds: number = TOTP_STEP_SECONDS): number {
  return Math.floor(atMs / 1000 / stepSeconds);
}

/** TOTP (RFC 6238): the code at an instant. */
export function totp(
  secret: Uint8Array,
  atMs: number,
  opts: { digits?: number; stepSeconds?: number } = {},
): string {
  return hotp(secret, totpStep(atMs, opts.stepSeconds), opts.digits);
}

export type TotpVerification = { ok: true; step: number } | { ok: false; reason: "format" | "mismatch" | "replay" };

/**
 * Check a typed code against a base32 secret. `lastUsedStep` is the step of
 * the last accepted code: that step and any earlier one is refused, so a code
 * seen once (over a shoulder, in a log) cannot be used again inside its window.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { nowMs: number; lastUsedStep?: number | null; window?: number },
): TotpVerification {
  const typed = code.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(typed)) return { ok: false, reason: "format" };
  const secret = base32Decode(secretBase32);
  const current = totpStep(opts.nowMs);
  const window = opts.window ?? TOTP_WINDOW;
  const last = opts.lastUsedStep ?? null;
  let replay = false;
  for (let d = -window; d <= window; d++) {
    const step = current + d;
    const expected = hotp(secret, step);
    if (safeEqual(expected, typed)) {
      if (last != null && step <= last) {
        replay = true;
        continue;
      }
      return { ok: true, step };
    }
  }
  return { ok: false, reason: replay ? "replay" : "mismatch" };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** A fresh 160-bit secret as base32 (32 characters). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Secret in groups of four, easier to type off a screen. */
export function formatSecret(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, "$1 ").trim();
}

/** The otpauth:// URI an authenticator app imports (as text or QR). */
export function otpauthUri(args: { secretBase32: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${args.issuer}:${args.account}`);
  const issuer = encodeURIComponent(args.issuer);
  return `otpauth://totp/${label}?secret=${args.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

// ── Backup codes ─────────────────────────────────────────────────────────────

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

/** Plain backup codes, shown once: "abcde-fghjk". */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let code = "";
    for (let j = 0; j < 10; j++) {
      code += CODE_ALPHABET[(bytes[j] ?? 0) % CODE_ALPHABET.length];
      if (j === 4) code += "-";
    }
    out.push(code);
  }
  return out;
}

export function normaliseBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(normaliseBackupCode(code)).digest("hex");
}

/**
 * Match a typed backup code against the stored hashes. Returns the remaining
 * hashes (the used one removed) or null when nothing matched.
 */
export function consumeBackupCode(hashes: readonly string[], typed: string): string[] | null {
  const h = hashBackupCode(typed);
  const idx = hashes.findIndex((x) => safeEqual(x, h));
  if (idx < 0) return null;
  return hashes.filter((_, i) => i !== idx);
}

/** Does the typed value look like a backup code rather than a 6-digit TOTP? */
export function looksLikeBackupCode(code: string): boolean {
  return normaliseBackupCode(code).length === 10;
}
