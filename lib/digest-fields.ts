/**
 * The fixed choices of the summary email settings (lib/admin-settings.ts), without any server
 * import, so the settings form in the browser can use them too.
 */

/** The categories a reader can choose (job-room ISCO groups of collector/it_occupations.json, plus «other» and «policy»). */
export const DIGEST_FIELDS = ["250", "251", "252", "351", "352", "other", "policy"] as const;
export type DigestField = (typeof DIGEST_FIELDS)[number];

/** Sending weeks: every week, or only even / only odd ISO calendar weeks. */
export const DIGEST_WEEKS = ["every", "even", "odd"] as const;
export type DigestWeeks = (typeof DIGEST_WEEKS)[number];

export const DIGEST_LANGS = ["en", "de"] as const;
export type DigestLang = (typeof DIGEST_LANGS)[number];

/** The sending days are fixed for now (shown on the page, not editable). */
export const DIGEST_DAYS = ["monday", "thursday"] as const;

/** ISO 8601 week number (Monday first; week 1 holds the year's first Thursday) of today in Swiss time. */
export function isoWeek(now: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}
