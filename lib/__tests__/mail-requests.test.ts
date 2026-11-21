/**
 * «Send it to me» (21.11.2026): off unless switched on, and the guards stay in place, because anyone can type any
 * address into the form.
 */
import { describe, expect, it } from "vitest";
import { addressHash, mailRequestsEnabled, MAX_PER_DAY } from "@/lib/mail-requests";
import { read } from "./support/files";

const TOKEN = "x".repeat(40);

describe("mail requests", () => {
  it("are off unless MAIL_REQUESTS is on AND the sender token is set", () => {
    expect(mailRequestsEnabled({})).toBe(false);
    expect(mailRequestsEnabled({ MAIL_REQUESTS: "1" })).toBe(false);
    expect(mailRequestsEnabled({ DIGEST_CONFIG_TOKEN: TOKEN })).toBe(false);
    expect(mailRequestsEnabled({ MAIL_REQUESTS: "1", DIGEST_CONFIG_TOKEN: TOKEN })).toBe(true);
  });

  it("keep their guards: honeypot, consent, once per address per day, a daily cap, a per-visitor limit, same origin", () => {
    const lib = read("lib/mail-requests.ts");
    expect(lib).toMatch(/input\.website/);
    expect(lib).toMatch(/input\.consent !== "yes"/);
    expect(lib).toMatch(/eq\(mailRequests\.emailHash, emailHash\), gte\(mailRequests\.createdAt, since\)/);
    expect(lib).toMatch(/active: false/); // nobody can subscribe someone else
    expect(MAX_PER_DAY).toBeLessThanOrEqual(40);
    const route = read("app/api/mail-request/route.ts");
    expect(route).toMatch(/if \(!mailRequestsEnabled\(\)\) return back\("off"\);/);
    expect(route).toMatch(/if \(!isSameOrigin\(req\)\) return/);
    expect(route).toMatch(/checkRateLimit\(key, 3, 60 \* 60 \* 1000\)/);
  });

  it("the once-per-day check survives clearing the address and ignores plus tags and case", () => {
    expect(addressHash("Anna+x@Example.ch", TOKEN)).toBe(addressHash("anna@example.ch", TOKEN));
    expect(addressHash("anna@example.ch", TOKEN)).not.toBe(addressHash("anna@example.ch", "y".repeat(40)));
  });

  it("the sender API needs the token and clears the address after sending unless subscribed", () => {
    const api = read("app/api/mail-requests/route.ts");
    expect(api).toMatch(/tokenMatches\(given, expected\)/);
    expect(read("lib/mail-requests.ts")).toMatch(/email: row\.subscribe \? row\.email : null/);
  });
});
