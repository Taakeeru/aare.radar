/**
 * Design options (21.11.2026): the team tries looks on the live site and votes. Owner rules kept here:
 * every option value is in the charter palette (OPTION_PALETTE), no derived shade, and on a light
 * background the accent is never a text or link colour (it is a fill, line, dot or mark only).
 */
import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  BACKGROUNDS,
  DESIGN_DEFAULT,
  FONTS,
  MARKS,
  ON_ACCENT,
  OPTION_PALETTE,
  cleanChoice,
} from "@/lib/design-tokens";
import { read } from "./support/files";

const PALETTE = new Set<string>(OPTION_PALETTE);

describe("design options", () => {
  it("the option colours are exactly the charter's three additions", () => {
    expect(OPTION_PALETTE.slice(-3)).toEqual(["#ffffff", "#f6f1e7", "#3eafaf"]);
  });

  it("every option colour is in the palette", () => {
    const all = [...Object.values(BACKGROUNDS).flatMap((b) => Object.values(b.colors)), ...Object.values(ACCENTS), ON_ACCENT];
    expect(all.filter((c) => !PALETTE.has(c))).toEqual([]);
  });

  it("on a light background no text or link colour is an accent", () => {
    const accents = new Set(Object.values(ACCENTS));
    for (const [name, b] of Object.entries(BACKGROUNDS)) {
      if (!b.light) continue;
      const { text, text2, text3, link } = b.colors;
      expect([text, text2, text3, link].filter((c) => accents.has(c)), name).toEqual([]);
    }
  });

  it("the default is the look the team voted for, written on <html> by the layout", () => {
    expect(DESIGN_DEFAULT).toEqual({ bg: "sand", accent: "aare", font: "atkinson", mark: "b" });
    const layout = read("app/[locale]/layout.tsx");
    expect(layout).toContain("designStyle(DESIGN_DEFAULT)");
    expect(layout).toContain("data-mark={DESIGN_DEFAULT.mark}");
  });

  it("unknown values from the URL or the browser fall back to the default", () => {
    expect(cleanChoice({ bg: "url(evil)", accent: "#000", font: "x", mark: "z" })).toEqual(DESIGN_DEFAULT);
    expect(cleanChoice({ bg: "sand", accent: "aare", font: "ubuntu", mark: "b" })).toEqual({ bg: "sand", accent: "aare", font: "ubuntu", mark: "b" });
  });

  it("every option has a label in both languages and every wordmark is in the header", () => {
    const de = JSON.parse(read("messages/de.json"));
    const en = JSON.parse(read("messages/en.json"));
    const groups = { bg: Object.keys(BACKGROUNDS), accent: Object.keys(ACCENTS), font: Object.keys(FONTS), mark: [...MARKS] };
    for (const [g, values] of Object.entries(groups))
      for (const v of values) {
        expect(de.design.opt[g][v], `de ${g}.${v}`).toBeTruthy();
        expect(en.design.opt[g][v], `en ${g}.${v}`).toBeTruthy();
      }
    const brand = read("components/brand.tsx");
    for (const m of MARKS) expect(brand).toContain(`data-mark="${m}"`);
  });

  it("fonts are self-hosted: nothing from a font service", () => {
    const css = read("public/fonts/fonts.css");
    expect(css).not.toMatch(/https?:\/\//);
    for (const f of ["ubuntu", "atkinson-hyperlegible", "ibm-plex-sans"]) expect(css).toContain(`/fonts/${f}-latin-400-normal.woff2`);
  });

  it("the logo's radar motion stops for reduced motion and never fades by opacity", () => {
    const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const brand = read("components/brand.tsx");
    expect(brand).toContain('className="brand__arm"');
    expect(brand).toContain('className="brand__ping"');
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.brand__arm\s*\{\s*animation:\s*none/);
    expect(reduced).toMatch(/\.brand__ping\s*\{\s*display:\s*none/);
  });
});
