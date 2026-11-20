// Security-reviewed code of Pandora's client template, kept verbatim.
/**
 * The pure half of lib/log-privacy.ts (read that file for the rules): no Node
 * built-ins, so these are safe in any bundle, middleware.ts (edge) included.
 * Server code imports logError / redactPii / logStack from here; logHash, which
 * needs node:crypto, lives in lib/log-privacy.ts (which re-exports these).
 */

const EMAIL = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[a-z]{2,}/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Eight groups, or a `::` compression with at least two groups around it.
// Deliberately conservative: a time like 18:05 must stay readable.
const IPV6 =
  /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?\b|::(?:ffff:)?[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){1,6}\b/gi;

/** The text with every e-mail address and IP address replaced by a marker. */
export function redactPii(text: string): string {
  return text.replace(EMAIL, "[email]").replace(IPV4, "[ip]").replace(IPV6, "[ip]");
}

/**
 * An error as one log-safe line: its name and its message, addresses removed.
 * A Drizzle query error ("Failed query: … params: anna@example.com,…") is
 * reduced to the driver error underneath it, which names the constraint or
 * the table and not the values.
 */
export function logError(e: unknown): string {
  if (!(e instanceof Error)) return redactPii(String(e));
  let err: Error = e;
  if (/^Failed query:/.test(err.message) && err.cause instanceof Error) err = err.cause;
  else if (/^Failed query:/.test(err.message)) return `${e.name}: query failed`;
  const code = (err as { code?: unknown }).code;
  const head = typeof code === "string" ? `${err.name} ${code}` : err.name;
  return `${head}: ${redactPii(err.message)}`;
}

/**
 * An error's stack frames without its message line (which logError covers):
 * `at …` lines only, so a message that carries bound params cannot ride along
 * in the stack.
 */
export function logStack(e: unknown): string | undefined {
  if (!(e instanceof Error) || typeof e.stack !== "string") return undefined;
  return e.stack
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .map(redactPii)
    .join("\n");
}
