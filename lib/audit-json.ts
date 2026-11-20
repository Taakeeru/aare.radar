/**
 * Ported from the client template lib/audit-json.ts, without
 * The template's phone-number markers (no phone numbers here).
 *
 * Reading the JSON columns of the audit logs (admin_audit_log detail/before/
 * after, user_audit_log detail) without trusting them to be JSON.
 *
 * drizzle's `text(..., { mode: "json" })` runs JSON.parse on every read and
 * throws on a malformed row, so one bad row (hand-written in sqlite, a cut-off
 * write, an older format) took the whole /admin/audit page down with «Etwas
 * ist schiefgelaufen», and emptied the session change log. Readers select the
 * column as plain text (auditText) and parse here: a row that is not a JSON
 * object keeps its raw text, which the pages show as it is.
 *
 * In SQL, json_extract on a malformed value fails the whole query too; use
 * safeJsonExtract in WHERE clauses.
 */
import { sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export type AuditJson = {
  /** The parsed object; null when the column is empty or not a JSON object. */
  value: Record<string, unknown> | null;
  /** The stored text when it is not a JSON object (malformed, an array, a bare string); else null. */
  raw: string | null;
};

/** The column as its stored text, bypassing json mode's parse-on-read. */
export function auditText(col: AnySQLiteColumn): SQL<string | null> {
  return sql<string | null>`${col}`;
}

/** json_extract that yields NULL for a malformed value instead of failing the query. */
export function safeJsonExtract(col: AnySQLiteColumn, path: string): SQL {
  return sql`(CASE WHEN json_valid(${col}) THEN json_extract(${col}, ${path}) END)`;
}

export function parseAuditJson(text: unknown): AuditJson {
  if (text === null || text === undefined || text === "") return { value: null, raw: null };
  // Already an object: a caller that still selects the json-mode column.
  if (typeof text === "object") {
    return Array.isArray(text) ? { value: null, raw: JSON.stringify(text) } : { value: text as Record<string, unknown>, raw: null };
  }
  const s = String(text);
  try {
    const v: unknown = JSON.parse(s);
    if (v === null) return { value: null, raw: null };
    if (typeof v === "object" && !Array.isArray(v)) return { value: v as Record<string, unknown>, raw: null };
  } catch {
    /* malformed: shown raw */
  }
  return { value: null, raw: s };
}

/**
 * One line for a Details column: `key=value, ...`, or the raw text of a row
 * that is not an object. `quoteStrings` keeps /admin/audit's `key="text"`.
 */
export function auditJsonLine(j: AuditJson, opts: { skip?: readonly string[]; quoteStrings?: boolean } = {}): string {
  if (j.raw !== null) return j.raw;
  if (!j.value) return "";
  return Object.entries(j.value)
    .filter(([k]) => !(opts.skip ?? []).includes(k))
    .map(([k, v]) => `${k}=${typeof v === "string" && !opts.quoteStrings ? v : JSON.stringify(v)}`)
    .join(", ");
}
