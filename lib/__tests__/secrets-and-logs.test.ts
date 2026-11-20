/**
 * No secret reaches the browser bundle or a log line (security pass of PR #1).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { redactAuditValues } from "@/lib/admin-audit";
import { logError, redactPii } from "@/lib/log-redact";
import { ROOT, read, rel, sourceFiles } from "./support/files";

const SERVER_ONLY = ["@/lib/auth", "@/lib/db", "@/lib/password", "@/lib/email", "@/lib/totp-store", "@/lib/admin-guard", "@/lib/rate-limit", "@/lib/get-client-ip", "@/lib/admin-audit", "@/lib/boot-guards", "@/lib/uploads", "@/lib/admin/texts", "@/lib/admin/concerts", "@/lib/admin/people", "@/lib/admin/images", "@/lib/admin/limits"];

describe("client components import no server module", () => {
  it("no 'use client' file imports auth, db, password, mail, 2FA store, guard or limiter", () => {
    const bad: string[] = [];
    for (const f of sourceFiles(["app", "components"], [".tsx", ".ts"])) {
      const src = read(f);
      if (!/^\s*["']use client["']/m.test(src)) continue;
      for (const m of SERVER_ONLY) if (src.includes(`from "${m}"`)) bad.push(`${rel(f)} → ${m}`);
    }
    expect(bad).toEqual([]);
  });
  it("the only NEXT_PUBLIC_ variable is the public site address", () => {
    const names = new Set<string>();
    for (const f of sourceFiles(["app", "components", "lib", "i18n"], [".ts", ".tsx"])) {
      for (const m of read(f).matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)) names.add(m[1]!);
    }
    expect([...names]).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });
  it("a built browser bundle, when present, names no secret or server table", () => {
    const dir = path.join(ROOT, ".next", "static");
    const hits: string[] = [];
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".js")) {
          const t = fs.readFileSync(full, "utf8");
          for (const needle of ["AUTH_SECRET", "SMTP_PASS", "user_passwords", "magic_link_tokens", "session_revocations", "scryptSync", "DUMMY_PASSWORD_HASH"]) {
            if (t.includes(needle)) hits.push(`${path.relative(ROOT, full)}: ${needle}`);
          }
        }
      }
    };
    walk(dir);
    expect(hits).toEqual([]);
  });
});

describe("log lines carry no password, token, cookie or secret", () => {
  it("no console call prints a credential variable", () => {
    const bad: string[] = [];
    const files = sourceFiles(["app", "components", "lib"], [".ts", ".tsx"]).concat([path.join(ROOT, "middleware.ts"), path.join(ROOT, "instrumentation.ts")]);
    for (const f of files) {
      for (const m of read(f).matchAll(/console\.(?:log|info|warn|error)\(([\s\S]*?)\);/g)) {
        // String literals may name things; only code (variables) is checked.
        const code = m[1]!.replace(/`(?:\\.|[^`])*`|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'/g, "");
        if (/\b(password|passwordHash|token|secret|cookie|sessionValue|proof|code|url)\b/i.test(code)) bad.push(`${rel(f)}: console.${m[0].slice(8, 40)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("the reset link is never logged, also when no mail can be sent", () => {
    const src = read("lib/email.ts");
    expect(src).toMatch(/SMTP_HOST not set: mail not sent:", subject\)/);
  });
  it("addresses are removed from logged errors (the template lib/log-redact.ts)", () => {
    expect(redactPii("login failed for anna@example.org from 203.0.113.5")).toBe("login failed for [email] from [ip]");
    expect(logError(new Error("no row for anna@example.org"))).toBe("Error: no row for [email]");
  });
  it("audit rows never keep a password, token or code value", () => {
    expect(redactAuditValues({ email: "a@b.ch", password: "x", nested: { resetToken: "y" }, backupCodes: ["z"] })).toEqual({
      email: "a@b.ch",
      password: "[entfernt]",
      nested: { resetToken: "[entfernt]" },
      backupCodes: "[entfernt]",
    });
  });
});
