/**
 * lib/auth.ts (ported from the template lib/auth.ts) on an in-memory
 * database: the session cookie, revocation (sign-out, new password), the
 * reset link (peek vs. consume, single use, purpose), constant scrypt work,
 * demo accounts, and the cookie flags. The parts follow the template's
 * lib/__tests__/auth.test.ts and session-gate-parity.test.ts.
 */
import { scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/password", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/password")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});
vi.mock("@/lib/db", async () => (await import("./support/test-db")).makeTestDbModule());

import { sqlite } from "@/lib/db";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import {
  checkCredentials,
  consumeMagicLink,
  DUMMY_PASSWORD_HASH,
  getUserFromSessionCookie,
  mintPasswordResetToken,
  peekMagicLink,
  revokeSessions,
  SESSION_TTL_MS,
  sessionCookieOptions,
  setPasswordAndRevokeSessions,
  signSession,
  signTotpProof,
  totpProofValid,
  verifySession,
} from "@/lib/auth";
import { insertUser } from "./support/test-db";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "s".repeat(48));
  vi.stubEnv("DEMO_INSTANCE", "");
  sqlite.exec("DELETE FROM magic_link_tokens; DELETE FROM session_revocations; DELETE FROM user_passwords; DELETE FROM admin_audit_log; DELETE FROM users;");
  insertUser(sqlite, { id: "u-admin", email: "board@example.org" });
  insertUser(sqlite, { id: "u-member", email: "member@example.org", isAdmin: false });
  setPasswordAndRevokeSessions("u-admin", hashPassword("richtig-1234"));
  // Start each case without the revocation stamp that setting the password wrote.
  sqlite.exec("DELETE FROM session_revocations;");
  vi.mocked(verifyPassword).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("password (the template lib/password.ts)", () => {
  it("hash and verify; the template's minimum length", () => {
    const h = hashPassword("geheim-123");
    expect(verifyPassword("geheim-123", h)).toBe(true);
    expect(verifyPassword("falsch", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
  it("accepts the salt:hash Pandora's CI writes (scrypt over the salt's hex text, 64 bytes)", () => {
    const salt = "00112233445566778899aabbccddeeff";
    expect(verifyPassword("ci-password", `${salt}:${scryptSync("ci-password", salt, 64).toString("hex")}`)).toBe(true);
  });
});

describe("session cookie", () => {
  it("round trip; a changed user id, signature or expiry is refused", async () => {
    const { value } = signSession("u-admin");
    expect((await getUserFromSessionCookie(value))?.id).toBe("u-admin");
    const [, exp, sig] = value.split(".");
    expect(verifySession(`u-member.${exp}.${sig}`)).toBeNull();
    expect(verifySession(`u-admin.${Number(exp) + 1}.${sig}`)).toBeNull();
    expect(verifySession("nonsense")).toBeNull();
    expect(await getUserFromSessionCookie(undefined)).toBeNull();
  });
  it("expires after the lifetime (7 days)", async () => {
    const { value } = signSession("u-admin", Date.now() - SESSION_TTL_MS - 1000);
    expect(await getUserFromSessionCookie(value)).toBeNull();
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
  it("a cookie issued before sign-out is refused after it (revokeSessions)", async () => {
    const { value } = signSession("u-admin", Date.now() - 1000);
    expect(await getUserFromSessionCookie(value)).not.toBeNull();
    revokeSessions("u-admin");
    expect(await getUserFromSessionCookie(value)).toBeNull();
    // The next sign-in is fine.
    const fresh = signSession("u-admin", Date.now() + 5);
    expect((await getUserFromSessionCookie(fresh.value, Date.now() + 10))?.id).toBe("u-admin");
  });
  it("a new password ends every earlier session and every open reset link, in one step", async () => {
    const { value } = signSession("u-admin", Date.now() - 1000);
    const token = mintPasswordResetToken("u-admin");
    expect(await getUserFromSessionCookie(value)).not.toBeNull();
    setPasswordAndRevokeSessions("u-admin", hashPassword("neu-und-richtig-5678"));
    expect(await getUserFromSessionCookie(value)).toBeNull();
    expect(await peekMagicLink(token)).toBeNull();
    expect(checkCredentials("board@example.org", "neu-und-richtig-5678")?.id).toBe("u-admin");
  });
  it("the cookie flags: HttpOnly, SameSite=Lax, path /, Secure in production", () => {
    const at = new Date(Date.now() + 1000);
    expect(sessionCookieOptions(at)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions(at).secure).toBe(true);
  });
  it("the second-factor proof belongs to ONE session", () => {
    const a = signSession("u-admin").value;
    const b = signSession("u-admin", Date.now() + 1).value;
    const proof = signTotpProof(a)!;
    expect(totpProofValid(a, proof.value)).toBe(true);
    expect(totpProofValid(b, proof.value)).toBe(false);
    expect(totpProofValid(a, "00")).toBe(false);
  });
});

describe("reset links", () => {
  it("peek does not spend; consume spends once; only the newest link works", async () => {
    const first = mintPasswordResetToken("u-admin");
    const second = mintPasswordResetToken("u-admin");
    expect(await peekMagicLink(first)).toBeNull();
    expect((await peekMagicLink(second))?.user.id).toBe("u-admin");
    expect((await peekMagicLink(second))?.user.id).toBe("u-admin");
    expect((await consumeMagicLink(second))?.user.id).toBe("u-admin");
    expect(await consumeMagicLink(second)).toBeNull();
  });
  it("an expired link is dead; only its hash is stored", async () => {
    const token = mintPasswordResetToken("u-admin", -1000);
    expect(await peekMagicLink(token)).toBeNull();
    const stored = sqlite.prepare("SELECT token_hash FROM magic_link_tokens").all() as { token_hash: string }[];
    expect(stored.every((r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
  });
});

describe("credentials never tell who has an account (security review of PR #1)", () => {
  it("unknown address, non-admin, no password, wrong password: all null, all one scrypt check", () => {
    for (const [email, pw] of [
      ["nobody@example.org", "x"],
      ["member@example.org", "x"],
      ["board@example.org", "falsch"],
    ] as const) {
      vi.mocked(verifyPassword).mockClear();
      expect(checkCredentials(email, pw)).toBeNull();
      expect(verifyPassword).toHaveBeenCalledTimes(1);
    }
    vi.mocked(verifyPassword).mockClear();
    checkCredentials("nobody@example.org", "whatever");
    expect(verifyPassword).toHaveBeenCalledWith("whatever", DUMMY_PASSWORD_HASH);
    expect(checkCredentials("BOARD@example.org ", "richtig-1234")?.id).toBe("u-admin");
  });
  it("the dummy hash is well formed and matches nothing ordinary", () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword("", DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe("demo credentials exist only on a demo instance", () => {
  beforeEach(() => {
    insertUser(sqlite, { id: "demo-admin", email: "cto-demo@demo.invalid" });
    setPasswordAndRevokeSessions("demo-admin", hashPassword("demo-password-1"));
  });
  it("production refuses the demo admin's password and cookie", async () => {
    const cookie = signSession("demo-admin", Date.now() + 5).value;
    expect(checkCredentials("cto-demo@demo.invalid", "demo-password-1")).toBeNull();
    expect(await getUserFromSessionCookie(cookie, Date.now() + 10)).toBeNull();
  });
  it("a demo instance (DEMO_INSTANCE=1, Pandora's CI) accepts it", async () => {
    vi.stubEnv("DEMO_INSTANCE", "1");
    expect(checkCredentials("cto-demo@demo.invalid", "demo-password-1")?.id).toBe("demo-admin");
  });
});
