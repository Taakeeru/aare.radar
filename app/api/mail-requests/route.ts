import { NextResponse, type NextRequest } from "next/server";
import { finishMailRequest, mailRequestsEnabled, pendingMailRequests } from "@/lib/mail-requests";
import { bearerToken, configuredDigestToken, tokenMatches } from "@/lib/digest-token";
import { clientKeyFrom } from "@/lib/get-client-ip";
import { isRateLimited, recordFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The sender on the other server (Authorization: Bearer <DIGEST_CONFIG_TOKEN>, as /api/digest-config):
 *   GET   -> {"requests": [{"id", "email", "lang", "fields": null | [...], "canton": null | "BE"}]}  (pending, max 20)
 *   POST  {"id": "...", "ok": true|false} -> 204 (the address is cleared unless the person subscribed)
 * 404 when MAIL_REQUESTS is off; 401 wrong token; 429 after 10 wrong tokens in 15 minutes. Never cached.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const plain = (status: number) => new NextResponse(null, { status, headers: NO_STORE });

async function authorised(req: NextRequest): Promise<NextResponse | null> {
  const expected = configuredDigestToken();
  if (!mailRequestsEnabled() || !expected) return plain(404);
  const key = `mailreqs:ip:${clientKeyFrom(req.headers, process.env.TRUST_PROXY)}`;
  if (await isRateLimited(key, 10)) return plain(429);
  const given = bearerToken(req.headers.get("authorization"));
  if (!given || !tokenMatches(given, expected)) {
    await recordFailure(key, 10, 15 * 60 * 1000);
    return plain(401);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const refused = await authorised(req);
  if (refused) return refused;
  return NextResponse.json({ requests: pendingMailRequests() }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const refused = await authorised(req);
  if (refused) return refused;
  const body = (await req.json().catch(() => null)) as { id?: unknown; ok?: unknown } | null;
  if (!body || typeof body.id !== "string" || body.id.length > 64) return plain(400);
  return finishMailRequest(body.id, body.ok === true) ? plain(204) : plain(404);
}
