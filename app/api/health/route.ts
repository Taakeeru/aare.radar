import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness probe (Pandora's CI waits on it). Opening the database here means
 * the SQLite file exists, migrated and seeded, once this answers 200.
 */
export function GET() {
  try {
    getDb();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
