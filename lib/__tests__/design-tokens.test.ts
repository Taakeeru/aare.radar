/**
 * Owner rules (CLAUDE.md "brand colours are exact", Pandora palette): the app
 * uses ONLY the twelve palette values and the three gradient values of
 * lib/design-tokens.ts, nowhere written out a second time. No derived shade:
 * no rgba, hsl, oklch, color-mix and no opacity. The gradient is a thin accent
 * only, never behind text.
 */
import { describe, expect, it } from "vitest";
import { COLOR, FONT, GRADIENT, tokenStyle } from "@/lib/design-tokens";
import { read, rel, sourceFiles } from "./support/files";

const PALETTE = {
  root: "#101317",
  surface: "#161a1f",
  raised: "#1d2228",
  hairline: "#22272e",
  border: "#2c333c",
  text: "#eceef1",
  text2: "#b6bdc7",
  text3: "#8f98a5",
  link: "#8ab4f8",
  critical: "#f2554a",
  warning: "#e5b454",
  healthy: "#4cc38a",
};

const CSS = "app/globals.css";
const NAMED = [
  "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey", "silver", "gold", "brown", "navy", "teal", "cyan",
  "magenta", "lime", "maroon", "olive", "aqua", "fuchsia", "indigo", "violet", "crimson", "coral", "salmon", "tomato", "khaki", "beige", "ivory",
];

describe("design tokens", () => {
  it("the palette is exactly the Pandora values", () => {
    expect(COLOR).toEqual(PALETTE);
  });

  it("the gradient is exactly the three values", () => {
    expect([...GRADIENT]).toEqual(["#c084fc", "#60a5fa", "#22c55e"]);
  });

  it("every token reaches the CSS as a variable", () => {
    const style = tokenStyle();
    for (const [k, v] of Object.entries(COLOR)) expect(style[`--radar-${k}`]).toBe(v);
    GRADIENT.forEach((v, i) => expect(style[`--radar-gradient-${i + 1}`]).toBe(v));
    expect(style["--radar-font"]).toBe(FONT.sans);
  });

  it("no file outside the token file names a colour value, a shade trick or opacity", () => {
    const files = sourceFiles(["app", "components", "lib", "i18n"], [".ts", ".tsx", ".css"]).filter((f) => !f.endsWith("lib/design-tokens.ts"));
    const bad: string[] = [];
    for (const f of files) {
      const text = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\blab\(|color-mix\(|\bopacity\s*:|\bfilter\s*:|\bmix-blend-mode\s*:/g)) {
        if (m[0].startsWith("#") && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(m[0])) continue;
        bad.push(`${rel(f)}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the CSS only uses var(--radar-*) that exist, and no named colour", () => {
    const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
    const known = new Set(Object.keys(tokenStyle()));
    const unknown = [...css.matchAll(/var\((--radar-[a-z0-9-]+)\)/g)].map((m) => m[1]!).filter((v) => !known.has(v));
    expect(unknown).toEqual([]);
    const bad: string[] = [];
    for (const m of css.matchAll(/(?:^|[;{\s])(color|background|background-color|border(?:-[a-z]+)*|outline|box-shadow|fill|stroke|text-decoration-color|caret-color|accent-color)\s*:\s*([^;}]+)/g)) {
      const value = m[2]!.replace(/var\(--radar-[a-z0-9-]+\)/g, "");
      for (const name of NAMED) if (new RegExp(`\\b${name}\\b`, "i").test(value)) bad.push(`${m[1]}: ${m[2]}`);
    }
    expect(bad).toEqual([]);
  });

  it("the gradient is used only for the one accent rule, never as a text or panel background", () => {
    const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
    const uses = [...css.matchAll(/([^{}]+)\{[^{}]*gradient[^{}]*\}/g)].map((m) => m[1]!.trim());
    expect(uses).toEqual([".accent-rule"]);
    expect(css).not.toMatch(/background-clip\s*:\s*text/);
  });

  it("the font is one token: no font family named elsewhere (monospace for codes aside), no web font service", () => {
    const css = read(CSS);
    const families = [...css.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    for (const f of families) expect(f.startsWith("var(--radar-font)") || f.startsWith("ui-monospace"), f).toBe(true);
    for (const f of sourceFiles(["app", "components", "lib"], [".ts", ".tsx", ".css"])) {
      expect(read(f), rel(f)).not.toMatch(/next\/font\/google|fonts\.googleapis|fonts\.gstatic|use\.typekit/);
    }
  });
});
