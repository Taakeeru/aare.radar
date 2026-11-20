// scripts/admin/create-admin.mjs — give a team member an admin account.
//
// Nobody types a password for someone else (the rule of Pandora's client template, since its
// security runs): this makes the account WITHOUT a password. The person then
// opens /de/passwort-vergessen, enters the address and chooses their own
// password through the mailed link (lib/auth.ts, 30 minutes, single use).
//
// Run inside the server container (the runtime image has node and
// better-sqlite3, no tsx), on the server, by the operator:
//   docker exec -i -e ADMIN_EMAIL=name@example.ch -e ADMIN_NAME="Vorname Name" \
//     <container> node --input-type=module - < scripts/admin/create-admin.mjs
//
// Refuses an address at the reserved demo.invalid domain unless the server is a
// demo instance (DEMO_INSTANCE=1): the CI demo admin can never exist in the
// production database. Idempotent: an existing account is made admin, nothing else.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const Database = require("better-sqlite3");

function die(msg) {
  console.error(`[create-admin] REFUSED: ${msg}`);
  process.exit(2);
}

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const name = (process.env.ADMIN_NAME ?? "").trim().slice(0, 120);
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die("ADMIN_EMAIL is not an e-mail address.");
if (email.endsWith("@demo.invalid") && process.env.DEMO_INSTANCE !== "1") die("demo.invalid accounts exist only on a demo instance.");

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "local.db");
if (!fs.existsSync(dbPath)) die(`${dbPath} does not exist: load one page of the app first (it migrates on open).`);
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email);
if (existing) {
  db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(existing.id);
  console.log(`[create-admin] ok: existing account is admin (${existing.id}).`);
} else {
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, email, name, is_admin, created_at) VALUES (?, ?, ?, 1, ?)").run(id, email, name, new Date().toISOString());
  console.log(`[create-admin] ok: admin account made (${id}). Next: /de/passwort-vergessen with that address.`);
}
