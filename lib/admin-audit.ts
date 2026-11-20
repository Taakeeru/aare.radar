/**
 * The admin audit log: every admin action leaves one row (who, what, which
 * record, the changed fields before/after). Writer pattern from the client
 * template (lib/user-audit.ts, lib/totp-store.ts): never
 * fatal (a failed audit write is logged, the action itself stands), never a
 * password, token or secret in a row (`redactAuditValues`).
 *
 * The content actions (app/[locale]/(admin)/admin/<section>/actions.ts and the photo
 * upload route) call logAdminAction after every write (SECURITY.md point 5).
 */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAuditLog, users } from "@/drizzle/schema";
import { auditJsonLine, auditText, parseAuditJson } from "@/lib/audit-json";
import { logError } from "@/lib/log-redact";

export type AuditTargetType = (typeof adminAuditLog.$inferInsert)["targetType"];

/** Keys whose values never enter the log, at any depth. */
const SECRET_KEY = /pass(word)?|token|secret|hash|cookie|code/i;

export function redactAuditValues(v: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!v) return null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (SECRET_KEY.test(k)) out[k] = "[entfernt]";
    else if (val && typeof val === "object" && !Array.isArray(val)) out[k] = redactAuditValues(val as Record<string, unknown>);
    else out[k] = val;
  }
  return out;
}

export function logAdminAction(args: {
  adminUserId: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  detail?: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  at?: Date;
}): void {
  try {
    db.insert(adminAuditLog)
      .values({
        id: randomUUID(),
        adminUserId: args.adminUserId,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId,
        detail: redactAuditValues(args.detail) ?? {},
        before: redactAuditValues(args.before),
        after: redactAuditValues(args.after),
        createdAt: (args.at ?? new Date()).toISOString(),
      })
      .run();
  } catch (e) {
    console.error("[audit] failed to write audit log:", logError(e));
  }
}

export type AuditRow = {
  id: string;
  createdAt: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  change: string;
};

/** One table cell of /admin/protokoll: a long text (a whole Leitbild) is cut for the view; the row keeps it whole. */
export function clipAuditCell(s: string, max = 160): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** The newest entries for /admin/protokoll. JSON columns read as text (lib/audit-json.ts), so one bad row cannot break the page. */
export function recentAuditRows(limit = 200): AuditRow[] {
  const rows = db
    .select({
      id: adminAuditLog.id,
      createdAt: adminAuditLog.createdAt,
      adminEmail: users.email,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      detail: auditText(adminAuditLog.detail),
      before: auditText(adminAuditLog.before),
      after: auditText(adminAuditLog.after),
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.adminUserId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .all();
  return rows.map((r) => {
    const before = clipAuditCell(auditJsonLine(parseAuditJson(r.before)));
    const after = clipAuditCell(auditJsonLine(parseAuditJson(r.after)));
    return {
      id: r.id,
      createdAt: r.createdAt,
      adminEmail: r.adminEmail ?? "",
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      detail: clipAuditCell(auditJsonLine(parseAuditJson(r.detail))),
      change: before || after ? `${before || "leer"} → ${after || "leer"}` : "",
    };
  });
}
