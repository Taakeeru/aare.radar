/** Team, 21.11.2026: the pages show the tab icons, not the letters A to E. */
import { describe, expect, it } from "vitest";
import { ICONS } from "@/components/page-icon";
import { read } from "./support/files";

describe("page icons instead of letters", () => {
  it("every navigation tab has an icon", () => {
    for (const k of ["demand", "skills", "employers", "target", "policy", "volunteers", "sources"]) expect(ICONS[k], k).toBeTruthy();
  });
  it("no page head writes «Question D/E» or a letter badge", () => {
    for (const f of ["app/[locale]/(site)/zielgruppe/page.tsx", "app/[locale]/(site)/politik/page.tsx"]) {
      expect(read(f), f).not.toMatch(/sectionOf", \{ letter/);
    }
    expect(read("app/[locale]/(site)/nachfrage/page.tsx")).not.toMatch(/<span aria-hidden="true">\{letter\}<\/span>/);
  });
});
