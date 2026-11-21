import { NextResponse, type NextRequest } from "next/server";
import { createMailRequest, mailRequestsEnabled } from "@/lib/mail-requests";
import { clientKeyFrom } from "@/lib/get-client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { SITE_URL } from "@/lib/site-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/mail-request: the «Send it to me» form of the email page (lib/mail-requests.ts). Answers with a 303
 * back to the page with ?mail=ok|bad|consent|limit|off, so it works without JavaScript. 3 per visitor per hour.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new NextResponse(null, { status: 403 });
  const form = await req.formData().catch(() => null);
  const locale = form?.get("locale") === "de" ? "de" : "en";
  // relative to the public address: behind the proxy req.url is the container's own (0.0.0.0:3000)
  const back = (status: string) => NextResponse.redirect(new URL(`/${locale}/email?mail=${status}#send`, SITE_URL), 303);
  if (!mailRequestsEnabled()) return back("off");
  if (!form) return back("bad");
  const key = `mailreq:ip:${clientKeyFrom(req.headers, process.env.TRUST_PROXY)}`;
  if (!(await checkRateLimit(key, 3, 60 * 60 * 1000))) return back("limit");
  try {
    const result = createMailRequest({
      email: form.get("email"),
      lang: locale,
      fields: form.getAll("field"),
      canton: form.get("canton"),
      subscribe: form.get("subscribe"),
      consent: form.get("consent"),
      website: form.get("website"),
    });
    return back(result);
  } catch {
    console.error("[mail-request] could not store the request");
    return back("bad");
  }
}
