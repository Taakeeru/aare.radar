/**
 * An in-memory SQLite with every migration applied, shaped like lib/db.ts's
 * exports. Tests replace "@/lib/db" with it the way the template's tests do:
 *
 *   vi.mock("@/lib/db", async () => (await import("./support/test-db")).makeTestDbModule());
 */
import * as path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/drizzle/schema";
import { ROOT } from "./files";

export function makeTestDbModule() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(ROOT, "drizzle", "migrations") });
  return { db, sqlite, getDb: () => db, databasePath: () => ":memory:" };
}

/** Insert an account the way scripts/admin/create-admin.mjs does. */
export function insertUser(
  sqlite: Database.Database,
  u: { id: string; email: string; isAdmin?: boolean; name?: string },
): void {
  sqlite
    .prepare("INSERT INTO users (id, email, name, is_admin, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(u.id, u.email, u.name ?? "", u.isAdmin === false ? 0 : 1, "2026-01-01T00:00:00.000Z");
}
