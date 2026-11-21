/**
 * The bearer token of GET /api/digest-config (app/api/digest-config/route.ts), server only.
 * DIGEST_CONFIG_TOKEN on the site server; the sender on the other server sends the same value.
 * Shorter than MIN_TOKEN_LENGTH counts as unset (the API then answers 404): openssl rand -hex 32.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_TOKEN_LENGTH = 32;

export function configuredDigestToken(env: Record<string, string | undefined> = process.env): string | null {
  const t = (env.DIGEST_CONFIG_TOKEN ?? "").trim();
  return t.length >= MIN_TOKEN_LENGTH ? t : null;
}

/** Constant time: both sides are hashed to 32 bytes first, so the compare does not depend on where or how long they differ. */
export function tokenMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** The token of an `Authorization: Bearer <token>` header, or "" (capped, so a huge header costs nothing). */
export function bearerToken(header: string | null | undefined): string {
  const m = /^Bearer[ \t]+(\S{1,512})[ \t]*$/i.exec(header ?? "");
  return m ? m[1]! : "";
}
