/**
 * One session gate, ported idea of the client template
 * lib/__tests__/session-gate-parity.test.ts: only lib/auth.ts
 * reads or writes the credential tables, and nothing outside it calls
 * verifySession (signature only, blind to revocations). Every «is this person
 * signed in» goes through getUserFromSessionCookie.
 */
import { describe, expect, it } from "vitest";
import { read, rel, sourceFiles } from "./support/files";

const code = sourceFiles(["app", "components", "lib", "scripts"], [".ts", ".tsx"]).concat(
  sourceFiles(["."], ["middleware.ts", "instrumentation.ts"]).filter((f) => !f.includes("/lib/") && !f.includes("/app/")),
);

describe("session gate parity", () => {
  it("only lib/auth.ts touches magic_link_tokens, session_revocations and user_passwords", () => {
    const bad = code
      .filter((f) => !f.endsWith("lib/auth.ts"))
      .filter((f) => /\b(magicLinkTokens|sessionRevocations|userPasswords)\b/.test(read(f)))
      .map(rel);
    expect(bad).toEqual([]);
  });
  it("nothing outside lib/auth.ts calls verifySession", () => {
    expect(code.filter((f) => !f.endsWith("lib/auth.ts") && /verifySession\(/.test(read(f))).map(rel)).toEqual([]);
  });
  it("the session cookie is set only through setSessionCookie / sessionCookieOptions", () => {
    const bad = code
      .filter((f) => !f.endsWith("lib/auth.ts"))
      .filter((f) => /\.set\(\s*SESSION_COOKIE/.test(read(f)))
      .map(rel);
    expect(bad).toEqual([]);
  });
  it("a password is written only by setPasswordAndRevokeSessions (nobody sets one for someone else)", () => {
    const writers = code.filter((f) => /setPasswordAndRevokeSessions\(/.test(read(f)) && !f.endsWith("lib/auth.ts")).map(rel);
    expect(writers).toEqual(["app/[locale]/(admin)/passwort-vergessen/actions.ts"]);
  });
});
