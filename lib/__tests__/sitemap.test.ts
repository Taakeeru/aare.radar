import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { ACTIVE_LOCALES } from "@/i18n/routing";

describe("sitemap", () => {
  it("lists the demand, skills and employers pages for every locale", () => {
    const urls = sitemap().map((e) => e.url);
    for (const l of ACTIVE_LOCALES) {
      for (const p of ["/nachfrage", "/faehigkeiten", "/arbeitgeber"]) {
        expect(urls.some((u) => u.endsWith(`/${l}${p}`))).toBe(true);
      }
    }
  });
});
