/**
 * The app's database (SQLite, better-sqlite3): admin accounts, the sign-in security tables, the
 * audit log and the admin settings (summary email and its readers). The dashboard itself reads ONE JSON file (lib/radar.ts), never this database.
 * Migrations: `npm run db:generate` after a change here, applied at boot by lib/db.ts.
 */
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/** Admin accounts (the Powercoders team). Sign-in with e-mail and password. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  /** Last successful sign-in (lib/auth.ts recordLogin, ported from the template). */
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
});

/** `salt:hash` (scrypt, lib/password.ts). Own table, as in the the template pattern. */
export const userPasswords = sqliteTable("user_passwords", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Small key/value facts about the database itself, e.g. which content seed ran. */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Security tables, ported from the client template (drizzle/schema.ts) ────

/**
 * Mailed single-use links. The plaintext token goes into the mail; only its
 * SHA-256 is stored. Used today for the password reset only (the template also signs in
 * with them; this app has no login link).
 */
export const magicLinkTokens = sqliteTable(
  "magic_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["password_reset"] }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("magic_link_expires_idx").on(t.expiresAt), index("magic_link_user_idx").on(t.userId)],
);

/** One row per account whose sessions were ended. A cookie issued before `revokedBefore` is refused (lib/auth.ts). */
export const sessionRevocations = sqliteTable("session_revocations", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  revokedBefore: text("revoked_before").notNull(),
});

/**
 * Second factor (TOTP, RFC 6238). `last_used_step` is the last accepted 30 s
 * step (replay protection); `backup_codes` is a JSON array of sha256 hashes,
 * one removed per use; `pending_secret` holds a new phone's secret until it is
 * confirmed. Same shape as the template: Pandora's CI enables a factor for its demo admin
 * by these column names (scripts/ci/client_layout.py _TOTP_SEED_JS).
 */
export const userTotp = sqliteTable("user_totp", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  enabledAt: text("enabled_at"),
  lastUsedStep: integer("last_used_step"),
  backupCodes: text("backup_codes").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  pendingSecret: text("pending_secret"),
});

/** Every admin action (lib/admin-audit.ts). `before`/`after` hold the changed fields. */
export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type", { enum: ["user", "setting", "digest_reader"] }).notNull(),
    targetId: text("target_id").notNull(),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    before: text("before", { mode: "json" }).$type<Record<string, unknown> | null>(),
    after: text("after", { mode: "json" }).$type<Record<string, unknown> | null>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_admin_idx").on(t.adminUserId), index("audit_created_idx").on(t.createdAt)],
);

// ── Admin «Settings» (/admin/einstellungen, lib/admin-settings.ts; switched on by ADMIN_SETTINGS=1) ──

/**
 * Small app-wide settings, one JSON value per key (read through lib/admin-settings.ts, which
 * parses the text itself, so one malformed row falls back to the default instead of throwing).
 * Today one key: "digest" = {enabled, weeks} of the summary email.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * The people who get the summary email. `fields` is a JSON array of category codes
 * (lib/admin-settings.ts DIGEST_FIELDS), NULL = all categories. The sender on the other server
 * reads this list through GET /api/digest-config.
 */
export const digestReaders = sqliteTable("digest_readers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  lang: text("lang", { enum: ["en", "de"] }).notNull().default("en"),
  fields: text("fields"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type DigestReaderRow = typeof digestReaders.$inferSelect;

export type UserTotp = typeof userTotp.$inferSelect;
export type AdminAuditEntry = typeof adminAuditLog.$inferSelect;

export type User = typeof users.$inferSelect;
