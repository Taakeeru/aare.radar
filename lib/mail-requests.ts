/**
 * «Send it to me» (Isabella, 21.11.2026): someone types their address on the email page, picks categories and a
 * canton, and gets the current summary email. This file stores the request; the sender on the other server sends it.
 *
 * Off unless MAIL_REQUESTS=1 and DIGEST_CONFIG_TOKEN is set (the sender needs it to fetch the requests). Guards,
 * because anyone can type any address: a hidden honeypot field, explicit consent, one request per address per
 * day, 3 per visitor address per hour, 40 in total per day. The address is cleared after sending unless the
 * person also asked to subscribe (then it joins the reader list of the admin page, as an active reader).
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { digestReaders, mailRequests } from "@/drizzle/schema";
import { normaliseEmail } from "@/lib/admin-settings";
import { configuredDigestToken } from "@/lib/digest-token";
import { DIGEST_FIELDS, type DigestField } from "@/lib/digest-fields";

export const MAX_PER_DAY = 40;

export function mailRequestsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MAIL_REQUESTS ?? "").trim().toLowerCase();
  return (v === "1" || v === "true" || v === "on") && configuredDigestToken(env) !== null;
}

export type MailRequestInput = { email: unknown; lang: unknown; fields: unknown[]; canton: unknown; subscribe: unknown; consent: unknown; website: unknown };
export type MailRequestResult = "ok" | "bad" | "consent" | "limit";

function startOfDayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function createMailRequest(input: MailRequestInput, now: Date = new Date()): MailRequestResult {
  // a bot filling the hidden field gets the same answer as a person, so it learns nothing
  if (typeof input.website === "string" && input.website.trim() !== "") return "ok";
  const email = normaliseEmail(input.email);
  if (!email) return "bad";
  if (input.consent !== "yes") return "consent";
  const lang = input.lang === "de" ? "de" : "en";
  const fields = input.fields.filter((f): f is DigestField => typeof f === "string" && (DIGEST_FIELDS as readonly string[]).includes(f));
  const canton = typeof input.canton === "string" && /^[A-Z]{2}$/.test(input.canton) ? input.canton : null;
  const subscribe = input.subscribe === "yes";
  const since = startOfDayUtc(now);
  const today = db.select({ n: sql<number>`count(*)` }).from(mailRequests).where(gte(mailRequests.createdAt, since)).get();
  if ((today?.n ?? 0) >= MAX_PER_DAY) return "limit";
  const again = db.select({ id: mailRequests.id }).from(mailRequests).where(and(eq(mailRequests.email, email), gte(mailRequests.createdAt, since))).get();
  if (again) return "ok"; // once per address per day; same answer, so nobody learns who asked
  const iso = now.toISOString();
  db.insert(mailRequests)
    .values({ id: randomUUID(), email, lang, fields: fields.length ? JSON.stringify(fields) : null, canton, subscribe, status: "pending", createdAt: iso })
    .run();
  if (subscribe) {
    db.insert(digestReaders)
      .values({ id: randomUUID(), email, lang, fields: fields.length ? JSON.stringify(fields) : null, active: true, createdAt: iso, updatedAt: iso })
      .onConflictDoNothing()
      .run();
  }
  return "ok";
}

export type PendingMail = { id: string; email: string; lang: "en" | "de"; fields: string[] | null; canton: string | null };

export function pendingMailRequests(limit = 20): PendingMail[] {
  return db
    .select()
    .from(mailRequests)
    .where(eq(mailRequests.status, "pending"))
    .orderBy(asc(mailRequests.createdAt))
    .limit(limit)
    .all()
    .filter((r) => r.email)
    .map((r) => ({ id: r.id, email: r.email!, lang: r.lang, fields: r.fields ? (JSON.parse(r.fields) as string[]) : null, canton: r.canton }));
}

/** The sender's report: sent or failed. The address is cleared unless the person subscribed. */
export function finishMailRequest(id: string, ok: boolean, now: Date = new Date()): boolean {
  const row = db.select().from(mailRequests).where(eq(mailRequests.id, id)).get();
  if (!row || row.status !== "pending") return false;
  db.update(mailRequests)
    .set({ status: ok ? "sent" : "failed", sentAt: now.toISOString(), email: row.subscribe ? row.email : null })
    .where(eq(mailRequests.id, id))
    .run();
  return true;
}
