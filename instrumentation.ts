// Next.js instrumentation hook — runs once on server startup (pattern of
// the client template instrumentation.ts).
import { assertBootInterlocks } from "@/lib/boot-guards";
import { logError, logStack } from "@/lib/log-redact";
import { logPath } from "@/lib/referrer-policy";

export async function register() {
  // Not while `next build` collects page data: the build runs with
  // APP_ENV=production but without the server's secrets.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  assertBootInterlocks(process.env);
}

export async function onRequestError(
  err: Error & { digest?: string },
  request: { method: string; path: string; headers: Record<string, string | string[]> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  // No addresses or bound params (lib/log-redact.ts), and no token from a
  // path or query (lib/referrer-policy.ts). Never the headers (cookies).
  console.error("[500] Server error:", {
    message: logError(err),
    digest: err.digest,
    stack: logStack(err),
    method: request.method,
    path: logPath(request.path.split("?")[0] ?? ""),
    routePath: context.routePath,
    routeType: context.routeType,
    timestamp: new Date().toISOString(),
  });
}
