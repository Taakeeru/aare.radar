/**
 * The colours, the typeface and the type sizes of the app. ONE place:
 * app/[locale]/layout.tsx writes COLOR, GRADIENT and FONT onto <html> as CSS
 * variables (--radar-root, --radar-surface, ...), app/globals.css reads only
 * those variables, and no other file names a colour value or a font family.
 * Guard: lib/__tests__/design-tokens.test.ts (it fails on any other hex colour
 * in app/, components/, lib/ or the CSS).
 *
 * The palette is Pandora's. Adding, removing or changing any colour here is the
 * owner's decision. No derived shades: no colour-mix(), no rgba(), no opacity
 * to make a new shade, no darker or lighter variant of a value below. A failing
 * contrast check is solved by changing what sits on what (text on surface,
 * text2 or text3 on root ...), never by changing a value.
 */

export const COLOR = {
  /** The page ground. */
  root: "#101317",
  /** Panels. */
  surface: "#161a1f",
  /** Raised parts inside a panel (bar tracks, the "what this means" lines, inputs). */
  raised: "#1d2228",
  /** The faintest line (grid lines in charts, table rows). */
  hairline: "#22272e",
  /** Panel borders and input borders. */
  border: "#2c333c",
  /** Headings, numbers and body text. */
  text: "#eceef1",
  /** Secondary text. */
  text2: "#b6bdc7",
  /** Tertiary text: sources, dates, axis labels. */
  text3: "#8f98a5",
  /** Links and the main data colour of the charts. */
  link: "#8ab4f8",
  /** High or bad. Always together with a word, never colour alone. */
  critical: "#f2554a",
  /** Medium. Always together with a word. */
  warning: "#e5b454",
  /** Low or good. Always together with a word. */
  healthy: "#4cc38a",
} as const;

/**
 * The brand gradient. Only as a thin accent (the one rule under the header);
 * never behind text and never as a panel background.
 */
export const GRADIENT = ["#c084fc", "#60a5fa", "#22c55e"] as const;

/** System Helvetica / Inter-like sans. Nothing is loaded from a font service. */
export const FONT = {
  sans: '"Helvetica Neue", Helvetica, Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
} as const;

/** CSS variables written onto <html>: the only way a colour or the font reaches the CSS. */
export function tokenStyle(): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(COLOR)) style[`--radar-${name}`] = value;
  GRADIENT.forEach((value, i) => {
    style[`--radar-gradient-${i + 1}`] = value;
  });
  style["--radar-font"] = FONT.sans;
  // The accent fills, lines, dots, chart marks and the wordmark's braces; --radar-link stays the TEXT
  // colour of links. By default both are the link blue, exactly as before the design options.
  style["--radar-accent"] = COLOR.link;
  style["--radar-on-accent"] = COLOR.root;
  return style;
}

/*
 * DESIGN OPTIONS (21.11.2026, owner: «add many options so the site will be exactly as we like … also with
 * the font»). The team tries them on the live site (components/design-switcher.tsx) and votes; the default
 * above stays until then. White, light sand and Aare turquoise were added to the charter palette as options
 * (Aare turquoise sampled from the team's photo of the Aare in Bern). Rules kept by the guard
 * lib/__tests__/design-options.test.ts: every value is in OPTION_PALETTE, and on a light background no
 * text or link colour is an accent (the accent is a fill, line, dot or mark only).
 */
export const OPTION_PALETTE = [
  ...Object.values(COLOR),
  ...GRADIENT,
  "#ffffff",
  "#f6f1e7",
  "#3eafaf",
] as const;

type Surface = Record<"root" | "surface" | "raised" | "hairline" | "border" | "text" | "text2" | "text3" | "link", string>;

const LIGHT_TEXT = { text: "#101317", text2: "#22272e", text3: "#2c333c", link: "#101317" } as const;

export const BACKGROUNDS: Record<string, { light: boolean; colors: Surface }> = {
  dark: {
    light: false,
    colors: {
      root: COLOR.root, surface: COLOR.surface, raised: COLOR.raised, hairline: COLOR.hairline, border: COLOR.border,
      text: COLOR.text, text2: COLOR.text2, text3: COLOR.text3, link: COLOR.link,
    },
  },
  grey: {
    light: true,
    colors: { root: "#eceef1", surface: "#ffffff", raised: "#eceef1", hairline: "#eceef1", border: "#b6bdc7", ...LIGHT_TEXT },
  },
  white: {
    light: true,
    colors: { root: "#ffffff", surface: "#ffffff", raised: "#eceef1", hairline: "#eceef1", border: "#b6bdc7", ...LIGHT_TEXT },
  },
  sand: {
    light: true,
    colors: { root: "#f6f1e7", surface: "#ffffff", raised: "#f6f1e7", hairline: "#eceef1", border: "#b6bdc7", ...LIGHT_TEXT },
  },
};

export const ACCENTS: Record<string, string> = {
  link: COLOR.link,
  aare: "#3eafaf",
  blue: "#60a5fa",
};

/** Text on an accent fill (the primary button): always the darkest ink. */
export const ON_ACCENT = COLOR.root;

export const FONTS: Record<string, string> = {
  system: FONT.sans,
  ubuntu: '"Ubuntu", ' + FONT.sans,
  atkinson: '"Atkinson Hyperlegible", ' + FONT.sans,
  plex: '"IBM Plex Sans", ' + FONT.sans,
};

/** Wordmarks: A { Aare.Radar } · B { AARE.RADAR } · C { aare.radar } · D AareRadar (as now). */
export const MARKS = ["a", "b", "c", "d"] as const;

export type DesignChoice = { bg: string; accent: string; font: string; mark: string };

export const DESIGN_DEFAULT: DesignChoice = { bg: "dark", accent: "link", font: "system", mark: "d" };

/** The CSS variables for one combination (written onto <html> by the switcher). */
export function designStyle(choice: DesignChoice): Record<string, string> {
  const bg = BACKGROUNDS[choice.bg] ?? BACKGROUNDS[DESIGN_DEFAULT.bg]!;
  const accent = ACCENTS[choice.accent] ?? ACCENTS[DESIGN_DEFAULT.accent]!;
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(bg.colors)) style[`--radar-${name}`] = value;
  style["--radar-accent"] = accent;
  style["--radar-on-accent"] = ON_ACCENT;
  style["--radar-font"] = FONTS[choice.font] ?? FONTS[DESIGN_DEFAULT.font]!;
  return style;
}

/** A known value of each group, else the default (URL and browser storage are untrusted input). */
export function cleanChoice(raw: Partial<Record<keyof DesignChoice, string | null | undefined>>): DesignChoice {
  const pick = (v: string | null | undefined, ok: readonly string[], d: string) => (v && ok.includes(v) ? v : d);
  return {
    bg: pick(raw.bg, Object.keys(BACKGROUNDS), DESIGN_DEFAULT.bg),
    accent: pick(raw.accent, Object.keys(ACCENTS), DESIGN_DEFAULT.accent),
    font: pick(raw.font, Object.keys(FONTS), DESIGN_DEFAULT.font),
    mark: pick(raw.mark, MARKS, DESIGN_DEFAULT.mark),
  };
}
