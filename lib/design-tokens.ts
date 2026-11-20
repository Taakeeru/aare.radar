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
  return style;
}
