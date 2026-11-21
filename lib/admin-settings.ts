/**
 * The admin «Settings» (/admin/einstellungen): the summary email switch, its sending weeks and
 * the list of readers. Server only. Switched on by ADMIN_SETTINGS=1 (lib/admin-settings-flag.ts);
 * with the switch off nothing here is reachable (the page, the actions and /api/digest-config
 * answer 404).
 *
 * The summary email is OFF until an admin switches it on (owner, 21.11.2026: no scheduled mails
 * after the hackathon; the capability stays). The sender runs on another server and reads
 * digestConfig() through GET /api/digest-config.
 *
 * Every write leaves one row in the admin audit log (lib/admin-audit.ts). A reader's address
 * never enters the log in full: maskEmail() keeps the first letter and the domain (a***@example.org).
 */
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, digestReaders, type DigestReaderRow } from "@/drizzle/schema";
import { logAdminAction } from "@/lib/admin-audit";
import { DIGEST_FIELDS, DIGEST_LANGS, DIGEST_WEEKS, type DigestField, type DigestLang, type DigestWeeks } from "@/lib/digest-fields";

export { DIGEST_DAYS, DIGEST_FIELDS, DIGEST_LANGS, DIGEST_WEEKS, type DigestField, type DigestLang, type DigestWeeks } from "@/lib/digest-fields";

/** A sane upper bound for the list (the team's readers, not a mailing list). */
export const MAX_READERS = 500;

export type DigestSettings = { enabled: boolean; weeks: DigestWeeks };

/** OFF by default: nothing is sent until an admin switches it on. */
export const DEFAULT_DIGEST_SETTINGS: DigestSettings = { enabled: false, weeks: "every" };

const DIGEST_KEY = "digest";

export type DigestReader = {
  id: string;
  email: string;
  lang: DigestLang;
  /** null = all categories. */
  fields: DigestField[] | null;
  active: boolean;
};

// ── Pure helpers (tests) ─────────────────────────────────────────────────

/** a***@example.org: the first character and the domain, never the whole address (audit log). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * A plain address check: one @, no spaces or angle brackets, a dot in the domain, at most 254
 * characters. Not RFC 5322 in full; enough to stop typos and anything that is not an address.
 */
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

export function normaliseEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  if (domain.startsWith(".") || domain.includes("..")) return null;
  return e;
}

export function isDigestWeeks(v: unknown): v is DigestWeeks {
  return typeof v === "string" && (DIGEST_WEEKS as readonly string[]).includes(v);
}

export function isDigestLang(v: unknown): v is DigestLang {
  return typeof v === "string" && (DIGEST_LANGS as readonly string[]).includes(v);
}

export function isDigestField(v: unknown): v is DigestField {
  return typeof v === "string" && (DIGEST_FIELDS as readonly string[]).includes(v);
}

export type ReaderInput = { email: unknown; lang: unknown; all: boolean; fields: unknown[]; active: boolean };
export type ReaderError = "email" | "lang" | "fields";
export type ValidReader = { email: string; lang: DigestLang; fields: DigestField[] | null; active: boolean };

/**
 * One reader from the form. «All categories» (or every category ticked) is stored as null; an
 * empty choice without «all» is refused; an unknown category is refused, never dropped quietly.
 */
export function validateReader(input: ReaderInput): { ok: true; value: ValidReader } | { ok: false; error: ReaderError } {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, error: "email" };
  const lang = input.lang;
  if (!isDigestLang(lang)) return { ok: false, error: "lang" };
  let fields: DigestField[] | null = null;
  if (!input.all) {
    if (input.fields.length === 0 || input.fields.length > DIGEST_FIELDS.length * 2) return { ok: false, error: "fields" };
    if (!input.fields.every(isDigestField)) return { ok: false, error: "fields" };
    const chosen = new Set(input.fields as DigestField[]);
    fields = DIGEST_FIELDS.filter((f) => chosen.has(f));
    if (fields.length === DIGEST_FIELDS.length) fields = null;
  }
  return { ok: true, value: { email, lang, fields, active: input.active === true } };
}

/** The stored settings value, read defensively: anything malformed falls back to the default (off). */
export function parseDigestSettings(text: string | null | undefined): DigestSettings {
  if (!text) return { ...DEFAULT_DIGEST_SETTINGS };
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ...DEFAULT_DIGEST_SETTINGS };
    return {
      enabled: v.enabled === true,
      weeks: isDigestWeeks(v.weeks) ? v.weeks : DEFAULT_DIGEST_SETTINGS.weeks,
    };
  } catch {
    return { ...DEFAULT_DIGEST_SETTINGS };
  }
}

/** The stored fields column: null (all), or the known codes in their canonical order. */
export function parseFields(text: string | null | undefined): DigestField[] | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return null;
    const chosen = new Set(v.filter(isDigestField));
    const out = DIGEST_FIELDS.filter((f) => chosen.has(f));
    return out.length === 0 || out.length === DIGEST_FIELDS.length ? null : out;
  } catch {
    return null;
  }
}

function toReader(r: DigestReaderRow): DigestReader {
  return { id: r.id, email: r.email, lang: isDigestLang(r.lang) ? r.lang : "en", fields: parseFields(r.fields), active: r.active };
}

/** What the audit row shows of a reader: the masked address, never the whole one. */
function auditView(r: { email: string; lang: string; fields: DigestField[] | null; active: boolean }): Record<string, unknown> {
  return { email: maskEmail(r.email), lang: r.lang, fields: r.fields ? r.fields.join(",") : "all", active: r.active };
}

// ── Reads ────────────────────────────────────────────────────────────────

export function getDigestSettings(): DigestSettings {
  const row = db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, DIGEST_KEY)).get();
  return parseDigestSettings(row?.value);
}

export function listReaders(): DigestReader[] {
  return db.select().from(digestReaders).orderBy(asc(digestReaders.email)).all().map(toReader);
}

export function getReader(id: string): DigestReader | null {
  const row = db.select().from(digestReaders).where(eq(digestReaders.id, id)).get();
  return row ? toReader(row) : null;
}

/** The read API's answer (GET /api/digest-config): exactly these fields, nothing else. */
export type DigestConfig = {
  enabled: boolean;
  weeks: DigestWeeks;
  readers: Array<{ email: string; lang: DigestLang; fields: DigestField[] | null; active: boolean }>;
};

export function digestConfig(): DigestConfig {
  const s = getDigestSettings();
  return {
    enabled: s.enabled,
    weeks: s.weeks,
    readers: listReaders().map((r) => ({ email: r.email, lang: r.lang, fields: r.fields, active: r.active })),
  };
}

// ── Writes (each leaves one audit row) ────────────────────────────────────

export function saveDigestSettings(adminUserId: string, next: DigestSettings): { changed: boolean } {
  const before = getDigestSettings();
  const value: DigestSettings = { enabled: next.enabled === true, weeks: isDigestWeeks(next.weeks) ? next.weeks : before.weeks };
  if (before.enabled === value.enabled && before.weeks === value.weeks) return { changed: false };
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key: DIGEST_KEY, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(value), updatedAt: now } })
    .run();
  logAdminAction({ adminUserId, action: "digest_settings", targetType: "setting", targetId: DIGEST_KEY, before, after: value });
  return { changed: true };
}

export type WriteResult = { ok: true; id: string } | { ok: false; error: "duplicate" | "not_found" | "too_many" };

function emailTaken(email: string, exceptId?: string): boolean {
  const row = db.select({ id: digestReaders.id }).from(digestReaders).where(eq(digestReaders.email, email)).get();
  return !!row && row.id !== exceptId;
}

export function addReader(adminUserId: string, r: ValidReader): WriteResult {
  if (emailTaken(r.email)) return { ok: false, error: "duplicate" };
  if (listReaders().length >= MAX_READERS) return { ok: false, error: "too_many" };
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(digestReaders)
    .values({ id, email: r.email, lang: r.lang, fields: r.fields ? JSON.stringify(r.fields) : null, active: r.active, createdAt: now, updatedAt: now })
    .run();
  logAdminAction({ adminUserId, action: "add_reader", targetType: "digest_reader", targetId: id, detail: { email: maskEmail(r.email) }, after: auditView(r) });
  return { ok: true, id };
}

export function updateReader(adminUserId: string, id: string, r: ValidReader): WriteResult {
  const before = getReader(id);
  if (!before) return { ok: false, error: "not_found" };
  if (emailTaken(r.email, id)) return { ok: false, error: "duplicate" };
  db.update(digestReaders)
    .set({ email: r.email, lang: r.lang, fields: r.fields ? JSON.stringify(r.fields) : null, active: r.active, updatedAt: new Date().toISOString() })
    .where(eq(digestReaders.id, id))
    .run();
  logAdminAction({
    adminUserId,
    action: "edit_reader",
    targetType: "digest_reader",
    targetId: id,
    detail: { email: maskEmail(r.email) },
    before: auditView(before),
    after: auditView(r),
  });
  return { ok: true, id };
}

export function setReaderActive(adminUserId: string, id: string, active: boolean): WriteResult {
  const before = getReader(id);
  if (!before) return { ok: false, error: "not_found" };
  if (before.active === active) return { ok: true, id };
  db.update(digestReaders).set({ active, updatedAt: new Date().toISOString() }).where(eq(digestReaders.id, id)).run();
  logAdminAction({
    adminUserId,
    action: active ? "activate_reader" : "deactivate_reader",
    targetType: "digest_reader",
    targetId: id,
    detail: { email: maskEmail(before.email) },
    before: { active: before.active },
    after: { active },
  });
  return { ok: true, id };
}

export function removeReader(adminUserId: string, id: string): WriteResult {
  const before = getReader(id);
  if (!before) return { ok: false, error: "not_found" };
  db.delete(digestReaders).where(eq(digestReaders.id, id)).run();
  logAdminAction({ adminUserId, action: "remove_reader", targetType: "digest_reader", targetId: id, detail: { email: maskEmail(before.email) }, before: auditView(before) });
  return { ok: true, id };
}
