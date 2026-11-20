// Security-reviewed code of Pandora's client template, kept verbatim.
/**
 * THE check for a `?next=` / `next` form value: a path on this site, or the
 * fallback. Browsers strip tab/CR/LF from URLs (WHATWG), so "/\t/evil.com"
 * becomes "//evil.com"; control characters and backslashes are therefore
 * refused outright, and what is left must resolve to our own origin.
 */
const BASE = "https://x.invalid";

export function safeNextPath(raw: unknown, fallback = ""): string {
  if (typeof raw !== "string" || raw === "") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\\]/.test(raw)) return fallback;
  // Belt and braces against anything that decodes later (a framework, a proxy,
  // a second redirect): the percent-decoded form must pass the same rules.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\\]/.test(decoded) || decoded.startsWith("//")) return fallback;
  let u: URL;
  try {
    u = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (u.origin !== BASE) return fallback;
  if (!u.pathname.startsWith("/") || u.pathname.startsWith("//")) return fallback;
  return raw;
}
