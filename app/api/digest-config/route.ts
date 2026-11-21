import { NextResponse, type NextRequest } from "next/server";
import { adminSettingsEnabled } from "@/lib/admin-settings-flag";
import { digestConfig } from "@/lib/admin-settings";
import { bearerToken, configuredDigestToken, tokenMatches } from "@/lib/digest-token";
import { clientKeyFrom } from "@/lib/get-client-ip";
import { isRateLimited, recordFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/digest-config: the summary email settings for the sender on the other server.
 *
 *   Authorization: Bearer <DIGEST_CONFIG_TOKEN>
 *   200 {"enabled": bool, "weeks": "every"|"even"|"odd",
 *        "readers": [{"email", "lang": "en"|"de", "fields": null | ["250", ...], "active": bool}]}
 *
 * 404 when ADMIN_SETTINGS is off or DIGEST_CONFIG_TOKEN is unset (or shorter than 32 characters):
 * the API does not exist then. 401 on a missing or wrong token; 429 after 10 wrong tokens from one
 * address in 15 minutes (failures only, counted as the sign-in counts them, lib/rate-limit.ts).
 * Constant-time compare (lib/digest-token.ts). Never cached. Read-only: no body is read.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const NO_STORE = { "Cache-Control": "no-store" };

function plain(status: number, extra: Record<string, string> = {}): NextResponse {
  return new NextResponse(null, { status, headers: { ...NO_STORE, ...extra } });
}

export async function GET(req: NextRequest) {
  if (!adminSettingsEnabled()) return plain(404);
  const expected = configuredDigestToken();
  if (!expected) return plain(404);

  const key = `digestcfg:ip:${clientKeyFrom(req.headers, process.env.TRUST_PROXY)}`;
  if (await isRateLimited(key, MAX_FAILURES)) return plain(429, { "Retry-After": String(WINDOW_MS / 1000) });

  const given = bearerToken(req.headers.get("authorization"));
  if (!given || !tokenMatches(given, expected)) {
    await recordFailure(key, MAX_FAILURES, WINDOW_MS);
    return plain(401, { "WWW-Authenticate": 'Bearer realm="digest-config"' });
  }

  try {
    return NextResponse.json(digestConfig(), { headers: NO_STORE });
  } catch {
    console.error("[digest-config] could not read the settings");
    return plain(503, {});
  }
}
