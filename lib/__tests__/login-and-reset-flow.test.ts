/**
 * The sign-in, sign-out and password-reset actions end to end on an in-memory
 * database (the idea of the template app/[locale]/(auth)/passwort-vergessen/__tests__/
 * password-reset-flow.test.ts and login-journey.test.ts,).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const store = new Map<string, { value: string; opts?: Record<string, unknown> }>();
  return {
    store,
    api: {
      get: (n: string) => (store.has(n) ? { value: store.get(n)!.value } : undefined),
      set: (n: string, value: string, opts?: Record<string, unknown>) => void store.set(n, { value, opts }),
      delete: (n: string) => void store.delete(n),
    },
  };
});
const mails = vi.hoisted(() => ({ reset: [] as Array<{ to: string; token: string }>, changed: [] as string[] }));

vi.mock("next/headers", () => ({
  cookies: async () => jar.api,
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: async (fn: () => unknown) => fn() }));
vi.mock("@/lib/email", () => ({
  sendPasswordReset: async (a: { to: string; token: string }) => {
    mails.reset.push(a);
    return { ok: true };
  },
  sendPasswordChangedNotice: async (a: { to: string }) => {
    mails.changed.push(a.to);
    return { ok: true };
  },
}));
vi.mock("@/lib/db", async () => (await import("./support/test-db")).makeTestDbModule());

import { sqlite } from "@/lib/db";
import { getUserFromSessionCookie, SESSION_COOKIE, setPasswordAndRevokeSessions } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { rateLimitHasKey, resetRateLimit } from "@/lib/rate-limit";
import { loginAction, logoutAction } from "@/app/[locale]/(admin)/login/actions";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/[locale]/(admin)/passwort-vergessen/actions";
import { insertUser } from "./support/test-db";

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { to?: string }).to ?? `threw ${(e as Error).message}`;
  }
  return "no redirect";
}
function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const login = (email: string, password: string) => loginAction({ error: "", email: "" }, form({ email, password, locale: "de" }));

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", "s".repeat(48));
  jar.store.clear();
  mails.reset.length = 0;
  mails.changed.length = 0;
  sqlite.exec("DELETE FROM magic_link_tokens; DELETE FROM session_revocations; DELETE FROM user_passwords; DELETE FROM admin_audit_log; DELETE FROM user_totp; DELETE FROM users;");
  insertUser(sqlite, { id: "u-admin", email: "board@example.org" });
  insertUser(sqlite, { id: "u-member", email: "member@example.org", isAdmin: false });
  setPasswordAndRevokeSessions("u-admin", hashPassword("richtig-1234"));
  sqlite.exec("DELETE FROM session_revocations;");
  for (const k of ["pw:ip:global", "pw:email:board@example.org", "pw:email:nobody@example.org", "pw:email:member@example.org", "pwreset:ip:global", "pwreset:email:board@example.org", "pwreset:email:nobody@example.org", "pwreset:set:global"]) await resetRateLimit(k);
});
afterEach(() => vi.unstubAllEnvs());

describe("sign-in", () => {
  it("one message for an unknown address, a non-admin and a wrong password", async () => {
    expect(await login("nobody@example.org", "x")).toEqual({ error: "invalid_login", email: "nobody@example.org" });
    expect(await login("member@example.org", "x")).toEqual({ error: "invalid_login", email: "member@example.org" });
    expect(await login("board@example.org", "falsch")).toEqual({ error: "invalid_login", email: "board@example.org" });
    expect(jar.store.has(SESSION_COOKIE)).toBe(false);
  });

  it("the right password sets a HttpOnly, SameSite=Lax session cookie and opens the admin", async () => {
    expect(await redirectOf(login("board@example.org", "richtig-1234"))).toBe("/de/admin");
    const c = jar.store.get(SESSION_COOKIE)!;
    expect(c.opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect((await getUserFromSessionCookie(c.value))?.id).toBe("u-admin");
    // Failures only: a successful sign-in leaves no rate-limit entry.
    expect(rateLimitHasKey("pw:email:board@example.org")).toBe(false);
    expect(rateLimitHasKey("pw:ip:global")).toBe(false);
  });

  it("fails CLOSED when the second-factor state cannot be read: generic error, no cookie", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlite.exec("ALTER TABLE user_totp RENAME TO user_totp_unreadable;");
    try {
      expect(await login("board@example.org", "richtig-1234")).toEqual({ error: "invalid_login", email: "board@example.org" });
      expect(jar.store.has(SESSION_COOKIE)).toBe(false);
    } finally {
      sqlite.exec("ALTER TABLE user_totp_unreadable RENAME TO user_totp;");
      err.mockRestore();
    }
    expect(await redirectOf(login("board@example.org", "richtig-1234"))).toBe("/de/admin");
  });

  it("five failures for one address block it (the template: 5 per e-mail, 10 per client in 15 min)", async () => {
    for (let i = 0; i < 4; i++) await login("board@example.org", "falsch");
    expect((await login("board@example.org", "falsch")).error).toBe("invalid_login");
    expect((await login("board@example.org", "richtig-1234")).error).toBe("too_many_attempts");
  });

  it("a foreign `next` is ignored", async () => {
    const r = await redirectOf(loginAction({ error: "", email: "" }, form({ email: "board@example.org", password: "richtig-1234", locale: "de", next: "//evil.example/x" })));
    expect(r).toBe("/de/admin");
  });

  it("sign-out ends the session everywhere: the old cookie no longer opens anything", async () => {
    await redirectOf(login("board@example.org", "richtig-1234"));
    const old = jar.store.get(SESSION_COOKIE)!.value;
    await new Promise((r) => setTimeout(r, 5));
    expect(await redirectOf(logoutAction(form({ locale: "de" })))).toBe("/de/login?loggedout=1");
    expect(jar.store.has(SESSION_COOKIE)).toBe(false);
    expect(await getUserFromSessionCookie(old)).toBeNull();
    const log = sqlite.prepare("SELECT action FROM admin_audit_log ORDER BY created_at").all() as { action: string }[];
    expect(log.map((r) => r.action)).toEqual(["login", "logout"]);
  });
});

describe("password reset", () => {
  it("the same answer for a known and an unknown address; a mail only for the admin", async () => {
    expect(await redirectOf(requestPasswordResetAction(form({ email: "board@example.org", locale: "de" })))).toBe("/de/passwort-vergessen?sent=1");
    expect(await redirectOf(requestPasswordResetAction(form({ email: "nobody@example.org", locale: "de" })))).toBe("/de/passwort-vergessen?sent=1");
    expect(await redirectOf(requestPasswordResetAction(form({ email: "member@example.org", locale: "de" })))).toBe("/de/passwort-vergessen?sent=1");
    expect(mails.reset.map((m) => m.to)).toEqual(["board@example.org"]);
  });

  it("a typo keeps the link valid; the new password works once and ends the old sessions", async () => {
    await redirectOf(requestPasswordResetAction(form({ email: "board@example.org", locale: "de" })));
    const token = mails.reset[0]!.token;
    await redirectOf(login("board@example.org", "richtig-1234"));
    const old = jar.store.get(SESSION_COOKIE)!.value;
    await new Promise((r) => setTimeout(r, 5));

    const set = (password: string, password_repeat = password) => redirectOf(resetPasswordAction(form({ t: token, password, password_repeat, locale: "de" })));
    expect(await set("kurz")).toContain("error=too_short");
    expect(await set("lang-genug-1", "anders-1234")).toContain("error=mismatch");
    expect(await set("neues-passwort-9")).toBe("/de/login?changed=1");
    expect(await set("noch-eins-1234")).toBe("/de/passwort-vergessen?error=invalid_or_expired");

    expect(await getUserFromSessionCookie(old)).toBeNull();
    expect(mails.changed).toEqual(["board@example.org"]);
    expect((await login("board@example.org", "richtig-1234")).error).toBe("invalid_login");
  });
});
