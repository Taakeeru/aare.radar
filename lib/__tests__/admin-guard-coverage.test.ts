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

  it("the settings area (/admin/einstellungen) is covered: its page and actions are checked above", () => {
    const names = files.map((f) => rel(f).split("\\").join("/"));
    expect(names).toEqual(expect.arrayContaining(["app/[locale]/(admin)/admin/einstellungen/page.tsx", "app/[locale]/(admin)/admin/einstellungen/actions.ts"]));
  });

  it("the settings area answers 404 while ADMIN_SETTINGS is off: the page and every action check the switch before the guard", () => {
    const page = read(`${ADMIN_DIR}/einstellungen/page.tsx`);
    const body = page.slice(page.indexOf("export default async function"));
    expect(body.indexOf("if (!adminSettingsEnabled()) notFound();")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!adminSettingsEnabled()) notFound();")).toBeLessThan(body.indexOf("requireAdminOrRedirect("));
    const actions = read(`${ADMIN_DIR}/einstellungen/actions.ts`);
    const fns = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
    expect(fns.length).toBeGreaterThanOrEqual(4);
    for (const m of fns) {
      const flag = m[2]!.indexOf("if (!adminSettingsEnabled()) notFound();");
      expect(flag, m[1]).toBeGreaterThan(-1);
      expect(flag, m[1]).toBeLessThan(m[2]!.search(/requireAdmin(OrRedirect)?\(/));
    }
    const route = read("app/api/digest-config/route.ts");
    expect(route).toMatch(/if \(!adminSettingsEnabled\(\)\) return plain\(404\);/);
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
