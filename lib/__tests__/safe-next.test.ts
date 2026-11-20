// Security-reviewed code of Pandora's client template, kept verbatim.
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it.each([
    "/%09/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\u0000/evil.com",
    "/\x7f/evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
  ])("rejects %j", (bad) => {
    expect(safeNextPath(bad)).toBe("");
    expect(safeNextPath(bad, "/de/dashboard")).toBe("/de/dashboard");
  });

  it("rejects non-strings", () => {
    expect(safeNextPath(undefined, "/x")).toBe("/x");
    expect(safeNextPath(["/de/admin"], "/x")).toBe("/x");
  });

  it("keeps a path on this site", () => {
    expect(safeNextPath("/de/admin")).toBe("/de/admin");
    expect(safeNextPath("/de/sessions/abc?x=1#y")).toBe("/de/sessions/abc?x=1#y");
  });

  it("percent-encoded slashes and newlines", () => {
    expect(safeNextPath("/%0a/evil.com")).toBe("");
    expect(safeNextPath("/%2f%2fevil.com")).toBe("");
    expect(safeNextPath("/%5Cevil.com")).toBe("");
  });

  it("keeps a URL fragment (signup links land on #anmeldung)", () => {
    expect(safeNextPath("/de/sessions/signup-v2#anmeldung")).toBe("/de/sessions/signup-v2#anmeldung");
  });
});
