import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { ACTIVE_LOCALES, PREPARED_LOCALES, routing } from "@/i18n/routing";

type Tree = { [k: string]: string | Tree };
const FILES: Record<string, Tree> = { de, en };

function flat(t: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string") out[prefix + k] = v;
    else Object.assign(out, flat(v, `${prefix}${k}.`));
  }
  return out;
}

describe("languages", () => {
  it("German (default) and English are routed", () => {
    expect([...routing.locales]).toEqual(["de", "en"]);
    expect(routing.defaultLocale).toBe("de");
    expect([...ACTIVE_LOCALES]).toEqual(["de", "en"]);
    expect([...PREPARED_LOCALES].sort()).toEqual(["de", "en"]);
  });

  it("both messages files have exactly the same keys", () => {
    expect(Object.keys(flat(en)).sort()).toEqual(Object.keys(flat(de)).sort());
  });

  it("no language has an empty text", () => {
    for (const l of ACTIVE_LOCALES) {
      const empty = Object.entries(flat(FILES[l]!)).filter(([, v]) => !v.trim()).map(([k]) => k);
      expect(empty, l).toEqual([]);
    }
  });

  it("both files use the same {placeholders} in every text", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]!).sort().join(",");
    const a = flat(de);
    const b = flat(en);
    const diff = Object.keys(a).filter((k) => names(a[k]!) !== names(b[k]!));
    expect(diff).toEqual([]);
  });
});
