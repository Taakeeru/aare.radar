/**
 * SQLite via better-sqlite3 + drizzle, opened LAZILY on the first query (the
 * build imports route modules and must not open a database).
 *
 * Path: DATABASE_URL (a file path), else ./data/local.db. On Vercel the
 * filesystem is read-only except /tmp, so the file lives there (it only holds
 * accounts, and this deploy does not use them). The folder is made when
 * missing. On open the migrations in drizzle/migrations are applied
 * (idempotent, so every start is the same).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/drizzle/schema";

export type Db = BetterSQLite3Database<typeof schema>;

declare global {
  var __radar_db__: { sqlite: Database.Database; db: Db } | undefined;
}

export function databasePath(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url && /^(libsql|https?|wss?):/i.test(url)) {
    throw new Error("DATABASE_URL must be a local SQLite file path");
  }
  if (url) return url;
  if (process.env.VERCEL) return path.join("/tmp", "radar.db");
  return path.join(process.cwd(), "data", "local.db");
}

function open(): { sqlite: Database.Database; db: Db } {
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle", "migrations") });
  return { sqlite, db };
}

export function getDb(): Db {
  if (!globalThis.__radar_db__) globalThis.__radar_db__ = open();
  return globalThis.__radar_db__.db;
}

/**
 * `db` and `sqlite` as the template's lib/db.ts exports them (both lazy), so the modules
 * ported from the client template (lib/auth.ts, lib/totp-store.ts,
 * lib/admin-audit.ts) read the same and their tests can mock "@/lib/db" with
 * an in-memory database the way the template's tests do.
 */
export const db: Db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(getDb() as object, prop),
});

export const sqlite: Database.Database = new Proxy({} as Database.Database, {
  get: (_t, prop) => {
    getDb();
    const conn = globalThis.__radar_db__!.sqlite;
    const v = Reflect.get(conn as object, prop);
    return typeof v === "function" ? v.bind(conn) : v;
  },
});


/** Opens (and so migrates) the database, never throwing: for pages that do not need it themselves (see the public layout). */
export function ensureDb(): void {
  try {
    getDb();
  } catch (e) {
    console.error("[db] could not open the database:", e instanceof Error ? e.message : "unknown error");
  }
}
