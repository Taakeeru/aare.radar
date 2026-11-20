import { defineRouting } from "next-intl/routing";

/**
 * Languages: German (default) and English. Both are routed, linked and
 * complete; lib/__tests__/i18n.test.ts keeps messages/de.json and
 * messages/en.json in step and refuses an empty text.
 *
 * One slug per page for both languages (/de/politik, /en/politik, /de/quellen,
 * /en/quellen): the sign-in and admin paths are German-slugged in every
 * language, so the whole site uses one scheme.
 */
export const PREPARED_LOCALES = ["de", "en"] as const;
export type PreparedLocale = (typeof PREPARED_LOCALES)[number];

export const ACTIVE_LOCALES = ["de", "en"] as const satisfies readonly PreparedLocale[];
export type Locale = (typeof ACTIVE_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";

export const LOCALE_TAGS: Record<PreparedLocale, string> = {
  de: "de-CH",
  en: "en-GB",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (ACTIVE_LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export const routing = defineRouting({
  locales: ACTIVE_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: { mode: "always" },
});
