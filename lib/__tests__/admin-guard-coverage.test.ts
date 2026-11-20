/**
 * Every admin page, server action and route under /admin asks the guard on the
 * server (middleware never decides access). A new file under admin/ that does
 * not call requireAdmin / requireAdminOrRedirect fails here.
 */
import { describe, expect, it } from "vitest";
import { read, rel, sourceFiles } from "./support/files";

const ADMIN_DIR = "app/[locale]/(admin)/admin";
const NEEDS_GUARD = /(page|actions|route)\.tsx?$/;

describe("admin guard coverage", () => {
  const files = sourceFiles([ADMIN_DIR], [".ts", ".tsx"]).filter((f) => NEEDS_GUARD.test(f));

  it("there are admin files to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [rel(f), f]))("%s asks the admin guard", (_name, file) => {
    expect(read(file as string)).toMatch(/requireAdmin(OrRedirect)?\(/);
  });

  it("no public page reads the user database or the audit log", () => {
    const pub = sourceFiles(["app/[locale]/(site)", "components"], [".ts", ".tsx"]);
    for (const f of pub) {
      const text = read(f);
      expect(text, rel(f)).not.toMatch(/@\/lib\/(admin-audit|totp-store|auth)"/);
      expect(text, rel(f)).not.toMatch(/\bdb\./);
    }
  });
});
