// scripts/demo/seed_demo.mjs — the demo/CI admin account for a THROWAWAY database.
//
// WHAT IT IS FOR
//   Pandora's client CI (scripts/ci/client_flows.py, client_layout.py) starts
//   this repo's standalone server on an empty SQLite, loads a page (the app
//   then migrates and seeds the client's content itself, lib/db.ts) and feeds
//   this file to `node` inside the server container to add a demo admin, so
//   the layout step can sign in at /de/login and measure /de/admin:
//     docker exec -i -e DEMO_ADMIN_PASSWORD_HASH=<salt:hash> <server> node --input-type=module - < scripts/demo/seed_demo.mjs
//   The password hash comes from the runner (scrypt `salt:hash`, the format of
//   lib/password.ts); this file never sees a password.
//
// SAFETY — it refuses unless ALL of these hold (the guards of the client template's demo seed):
//   1. DEMO_INSTANCE=1 in the environment (only the CI/demo server sets it).
//   2. DEMO_PRODUCT is "radar".
//   3. The database is new (no users) or carries the demo marker this script
//      creates; every user is at the reserved demo.invalid domain.
//
// IDEMPOTENT: fixed ids, upserts.

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const Database = require("better-sqlite3");

const DEMO_DOMAIN = "demo.invalid";
const PRODUCT = (process.env.DEMO_PRODUCT ?? "").trim();
const ADMIN_EMAIL = (process.env.DEMO_ADMIN_EMAIL ?? `cto-demo@${DEMO_DOMAIN}`).trim().toLowerCase();
const PASSWORD_HASH = (process.env.DEMO_ADMIN_PASSWORD_HASH ?? "").trim();

function die(msg) {
  console.error(`[seed-demo] REFUSED: ${msg}`);
  process.exit(2);
}

if (process.env.DEMO_INSTANCE !== "1") die("DEMO_INSTANCE=1 is not set: this is not a demo server.");
// The production server never carries demo credentials (lib/auth.ts refuses
// @demo.invalid sign-ins there too). APP_ENV=production alone is not enough to refuse:
// Pandora's CI runs the production build with DEMO_INSTANCE=1 on a throwaway database.
if (PRODUCT !== "radar") die(`DEMO_PRODUCT must be radar (got '${PRODUCT}').`);
if (!ADMIN_EMAIL.endsWith(`@${DEMO_DOMAIN}`)) die(`DEMO_ADMIN_EMAIL must be at @${DEMO_DOMAIN}.`);
if (!/^[0-9a-f]{8,}:[0-9a-f]{128}$/i.test(PASSWORD_HASH)) die("DEMO_ADMIN_PASSWORD_HASH must be a scrypt salt:hash (lib/password.ts).");

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "local.db");
if (/^(libsql|https?|wss?):/i.test(dbPath)) die("remote database URL: the demo uses a local SQLite file only.");
if (!fs.existsSync(dbPath)) die(`${dbPath} does not exist: load one page of the app first (it migrates on open).`);

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const tableExists = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
if (!tableExists("users") || !tableExists("user_passwords")) die("schema not migrated yet: load one page of the app first.");

const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (!tableExists("demo_instance_marker")) {
  if (userCount > 0) die(`database has ${userCount} users and no demo marker: not a demo database.`);
  db.exec("CREATE TABLE demo_instance_marker (id INTEGER PRIMARY KEY CHECK (id = 1), product TEXT NOT NULL, created_at TEXT NOT NULL)");
  db.prepare("INSERT INTO demo_instance_marker (id, product, created_at) VALUES (1, ?, ?)").run(PRODUCT, new Date().toISOString());
}
const foreign = db.prepare("SELECT COUNT(*) AS c FROM users WHERE lower(email) NOT LIKE ?").get(`%@${DEMO_DOMAIN}`).c;
if (foreign > 0) die(`${foreign} user(s) outside @${DEMO_DOMAIN}: not touching this database.`);

const now = new Date().toISOString();
const id = "demo-admin";
db.transaction(() => {
  db.prepare(
    "INSERT INTO users (id, email, name, is_admin, created_at) VALUES (?, ?, ?, 1, ?) " +
      "ON CONFLICT(id) DO UPDATE SET email = excluded.email, is_admin = 1",
  ).run(id, ADMIN_EMAIL, "Demo Admin", now);
  db.prepare(
    "INSERT INTO user_passwords (user_id, password_hash, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at",
  ).run(id, PASSWORD_HASH, now);
})();
console.log(`[seed-demo] ok: admin ${ADMIN_EMAIL} (product ${PRODUCT})`);
