/**
 * Admin «Settings» (/admin/einstellungen, lib/admin-settings.ts) and its read API
 * (GET /api/digest-config), on an in-memory database:
 *
 *   - switched OFF by default: not in the admin menu, page, actions and API answer 404;
 *   - the summary email is OFF until an admin switches it on (owner, 21.11.2026);
 *   - the API: token missing / wrong / right, constant-time compare, rate limit, no-store, exact shape;
 *   - validation of address, language and categories;
 *   - every change writes the audit log with a masked address, never the whole one;
 *   - every text in both languages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const guard = vi.hoisted(() => ({
  result: { ok: true, user: { id: "u-admin", email: "board@example.org", isAdmin: true }, totpMissing: false } as
    | { ok: true; user: { id: string; email: string; isAdmin: boolean }; totpMissing: boolean }
    | { ok: false; reason: "login"; user: null },
  calls: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => true }),
  setRequestLocale: () => undefined,
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: async () => {
    guard.calls++;
    return guard.result;
  },
  requireAdminOrRedirect: async (locale: string, next?: string) => {
    guard.calls++;
    if (!guard.result.ok) throw Object.assign(new Error("NEXT_REDIRECT"), { to: `/${locale}/login?next=${encodeURIComponent(next ?? "")}` });
    return guard.result;
  },
}));
vi.mock("@/lib/db", async () => (await import("./support/test-db")).makeTestDbModule());

import { sqlite } from "@/lib/db";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { adminSettingsEnabled } from "@/lib/admin-settings-flag";
import { ADMIN_AREAS, adminAreas } from "@/app/[locale]/(admin)/admin/areas";
import {
  addReader,
  DIGEST_FIELDS,
  DIGEST_LANGS,
  DIGEST_WEEKS,
  digestConfig,
  getDigestSettings,
  listReaders,
  maskEmail,
  normaliseEmail,
  parseDigestSettings,
  parseFields,
  validateReader,
} from "@/lib/admin-settings";
import { bearerToken, configuredDigestToken, tokenMatches } from "@/lib/digest-token";
import { isoWeek } from "@/lib/digest-fields";
import { _clearRateLimitStore } from "@/lib/rate-limit";
import SettingsPage from "@/app/[locale]/(admin)/admin/einstellungen/page";
import {
  removeReaderAction,
  saveDigestAction,
  saveReaderAction,
  setReaderActiveAction,
} from "@/app/[locale]/(admin)/admin/einstellungen/actions";
import { GET } from "@/app/api/digest-config/route";
import { insertUser } from "./support/test-db";

const TOKEN = "t".repeat(40);
const ADMIN = { ok: true as const, user: { id: "u-admin", email: "board@example.org", isAdmin: true }, totpMissing: false };

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

async function outcome(p: Promise<unknown>): Promise<{ to?: string; notFound?: boolean; value?: unknown }> {
  try {
    return { value: await p };
  } catch (e) {
    const err = e as { to?: string; notFound?: boolean; message?: string };
    if (err.to || err.notFound) return { to: err.to, notFound: err.notFound };
    throw e;
  }
}

function auditRows(): Array<{ action: string; target_type: string; target_id: string; detail: string | null; before: string | null; after: string | null }> {
  return sqlite.prepare("SELECT action, target_type, target_id, detail, before, after FROM admin_audit_log ORDER BY created_at").all() as never;
}

const idle = { status: "idle" as const };
const page = (locale = "en", sp: Record<string, string> = {}) => SettingsPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(sp) });
const api = (auth?: string) =>
  GET(new NextRequest("https://radar.gnamak.ch/api/digest-config", { headers: auth === undefined ? {} : { authorization: auth } }));

beforeEach(() => {
  vi.stubEnv("ADMIN_SETTINGS", "");
  vi.stubEnv("DIGEST_CONFIG_TOKEN", "");
  guard.result = ADMIN;
  guard.calls = 0;
  _clearRateLimitStore();
  sqlite.exec("DELETE FROM admin_audit_log; DELETE FROM digest_readers; DELETE FROM app_settings; DELETE FROM users;");
  insertUser(sqlite, { id: "u-admin", email: "board@example.org" });
});
afterEach(() => vi.unstubAllEnvs());

describe("the switch ADMIN_SETTINGS: off by default", () => {
  it("is off unless set to 1, true or on", () => {
    expect(adminSettingsEnabled({})).toBe(false);
    for (const v of ["", "0", "false", "off", "no", "yes"]) expect(adminSettingsEnabled({ ADMIN_SETTINGS: v }), v).toBe(false);
    for (const v of ["1", "true", "on", " ON "]) expect(adminSettingsEnabled({ ADMIN_SETTINGS: v }), v).toBe(true);
  });

  it("off: the area is not in the admin menu; on: it is", () => {
    expect(ADMIN_AREAS.map((a) => a.href)).not.toContain("/admin/einstellungen");
    expect(adminAreas({}).map((a) => a.href)).not.toContain("/admin/einstellungen");
    expect(adminAreas({ ADMIN_SETTINGS: "1" }).map((a) => a.href)).toContain("/admin/einstellungen");
  });

  it("off: the page is a 404, before any sign-in check", async () => {
    const r = await outcome(page());
    expect(r.notFound).toBe(true);
    expect(guard.calls).toBe(0);
  });

  it("off: every action is a 404 and writes nothing", async () => {
    for (const p of [
      saveDigestAction(form({ locale: "en", enabled: "on", weeks: "even" })),
      saveReaderAction(idle, form({ locale: "en", email: "anna@example.org", lang: "en", all: "on", active: "on" })),
      setReaderActiveAction(form({ locale: "en", id: "x", active: "0" })),
      removeReaderAction(form({ locale: "en", id: "x" })),
    ]) {
      expect((await outcome(p)).notFound).toBe(true);
    }
    expect(guard.calls).toBe(0);
    expect(listReaders()).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it("off: the API is a 404, also with the right token", async () => {
    vi.stubEnv("DIGEST_CONFIG_TOKEN", TOKEN);
    const res = await api(`Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("on: the page asks the admin guard (signed out goes to the sign-in) and renders for an admin", async () => {
    vi.stubEnv("ADMIN_SETTINGS", "1");
    guard.result = { ok: false, reason: "login", user: null };
    expect((await outcome(page("en"))).to).toBe("/en/login?next=%2Fen%2Fadmin%2Feinstellungen");
    guard.result = ADMIN;
    const r = await outcome(page("en"));
    expect(r.value).toBeTruthy();
    expect(guard.calls).toBe(2);
  });
});

describe("the summary email is OFF until an admin switches it on", () => {
  it("default settings and an empty database: off, every week", () => {
    expect(getDigestSettings()).toEqual({ enabled: false, weeks: "every" });
    expect(digestConfig()).toEqual({ enabled: false, weeks: "every", readers: [] });
  });
  it("a malformed stored value falls back to off", () => {
    for (const t of [null, "", "nonsense", "[]", "null", '{"enabled":"yes","weeks":"daily"}']) {
      expect(parseDigestSettings(t), String(t)).toEqual({ enabled: false, weeks: "every" });
    }
    expect(parseDigestSettings('{"enabled":true,"weeks":"odd"}')).toEqual({ enabled: true, weeks: "odd" });
  });
});

describe("validation", () => {
  it("email: a plain address, trimmed and lower case; anything else refused", () => {
    expect(normaliseEmail("  Anna.Muster@Example.ORG ")).toBe("anna.muster@example.org");
    for (const bad of ["", "anna", "anna@", "@example.org", "an na@example.org", "anna@example", "anna@example..org", "<a>@example.org", "a@b.c", "a,b@example.org", `${"a".repeat(250)}@example.org`]) {
      expect(normaliseEmail(bad), bad).toBeNull();
    }
  });
  it("language: en or de only", () => {
    const base = { email: "anna@example.org", all: true, fields: [], active: true };
    expect(validateReader({ ...base, lang: "en" }).ok).toBe(true);
    expect(validateReader({ ...base, lang: "de" }).ok).toBe(true);
    for (const l of ["fr", "", "EN", undefined]) expect(validateReader({ ...base, lang: l }), String(l)).toEqual({ ok: false, error: "lang" });
  });
  it("categories: a subset of the seven in a fixed order, or all (null)", () => {
    const base = { email: "anna@example.org", lang: "en", active: true };
    expect(validateReader({ ...base, all: true, fields: ["251"] })).toMatchObject({ ok: true, value: { fields: null } });
    expect(validateReader({ ...base, all: false, fields: ["policy", "251", "250", "251"] })).toMatchObject({ ok: true, value: { fields: ["250", "251", "policy"] } });
    expect(validateReader({ ...base, all: false, fields: [...DIGEST_FIELDS] })).toMatchObject({ ok: true, value: { fields: null } });
    expect(validateReader({ ...base, all: false, fields: [] })).toEqual({ ok: false, error: "fields" });
    expect(validateReader({ ...base, all: false, fields: ["251", "999"] })).toEqual({ ok: false, error: "fields" });
    expect(validateReader({ ...base, all: false, fields: ["251"] })).toMatchObject({ ok: true, value: { fields: ["251"] } });
  });
  it("the stored categories are read back defensively", () => {
    expect(parseFields(null)).toBeNull();
    expect(parseFields("not json")).toBeNull();
    expect(parseFields('["352","x","250"]')).toEqual(["250", "352"]);
  });
  it("an address in the audit log is masked: first letter and domain only", () => {
    expect(maskEmail("anna.muster@example.org")).toBe("a***@example.org");
    expect(maskEmail("nobody")).toBe("***");
  });
  it("the current ISO week in Swiss time", () => {
    expect(isoWeek(new Date("2026-11-21T12:00:00Z"))).toBe(47);
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe(53);
    expect(isoWeek(new Date("2026-12-31T23:30:00Z"))).toBe(53);
    expect(isoWeek(new Date("2026-01-01T12:00:00Z"))).toBe(1);
  });
});

describe("the actions (switch on, signed-in admin)", () => {
  beforeEach(() => vi.stubEnv("ADMIN_SETTINGS", "1"));

  it("summary email: on, even weeks; one audit row; a wrong week value is refused", async () => {
    expect((await outcome(saveDigestAction(form({ locale: "en", enabled: "on", weeks: "even" })))).to).toBe("/en/admin/einstellungen?saved=digest");
    expect(getDigestSettings()).toEqual({ enabled: true, weeks: "even" });
    expect((await outcome(saveDigestAction(form({ locale: "en", weeks: "daily" })))).to).toBe("/en/admin/einstellungen?error=weeks");
    expect((await outcome(saveDigestAction(form({ locale: "de", weeks: "even" })))).to).toBe("/de/admin/einstellungen?saved=digest");
    expect(getDigestSettings()).toEqual({ enabled: false, weeks: "even" });
    const rows = auditRows();
    expect(rows.map((r) => r.action)).toEqual(["digest_settings", "digest_settings"]);
    expect(JSON.parse(rows[0]!.after!)).toEqual({ enabled: true, weeks: "even" });
  });

  it("add, edit, pause, activate, remove: each one audit row, the address masked in every one", async () => {
    const add = await outcome(saveReaderAction(idle, form({ locale: "en", email: "Anna.Muster@Example.org", lang: "de", fields: ["251", "policy"], active: "on" })));
    expect(add.to).toBe("/en/admin/einstellungen?saved=reader_add");
    const [r] = listReaders();
    expect(r).toMatchObject({ email: "anna.muster@example.org", lang: "de", fields: ["251", "policy"], active: true });

    expect((await outcome(saveReaderAction(idle, form({ locale: "en", id: r!.id, email: "anna.muster@example.org", lang: "en", all: "on", active: "on" })))).to).toBe(
      "/en/admin/einstellungen?saved=reader_edit",
    );
    expect(listReaders()[0]).toMatchObject({ lang: "en", fields: null });
    expect((await outcome(setReaderActiveAction(form({ locale: "en", id: r!.id, active: "0" })))).to).toBe("/en/admin/einstellungen?saved=paused");
    expect(listReaders()[0]!.active).toBe(false);
    expect((await outcome(setReaderActiveAction(form({ locale: "en", id: r!.id, active: "1" })))).to).toBe("/en/admin/einstellungen?saved=active");
    expect((await outcome(removeReaderAction(form({ locale: "en", id: r!.id })))).to).toBe("/en/admin/einstellungen?saved=removed");
    expect(listReaders()).toEqual([]);

    const rows = auditRows();
    expect(rows.map((x) => x.action)).toEqual(["add_reader", "edit_reader", "deactivate_reader", "activate_reader", "remove_reader"]);
    for (const row of rows) {
      expect(row.target_type).toBe("digest_reader");
      expect(row.target_id).toBe(r!.id);
      const text = [row.detail, row.before, row.after].join(" ");
      expect(text).toContain("a***@example.org");
      expect(text.toLowerCase()).not.toContain("anna");
      expect(text).not.toContain("muster");
    }
  });

  it("a refused form comes back with the typed values and writes nothing", async () => {
    const bad = await outcome(saveReaderAction(idle, form({ locale: "en", email: "not an address", lang: "en", fields: ["251"], active: "on" })));
    expect(bad.value).toEqual({ status: "error", error: "email", values: { email: "not an address", lang: "en", all: false, fields: ["251"], active: true } });
    expect((await outcome(saveReaderAction(idle, form({ locale: "en", email: "anna@example.org", lang: "fr", all: "on" })))).value).toMatchObject({ error: "lang" });
    expect((await outcome(saveReaderAction(idle, form({ locale: "en", email: "anna@example.org", lang: "en" })))).value).toMatchObject({ error: "fields" });
    expect(listReaders()).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it("the same address twice is refused, also on edit; an unknown reader is not found", async () => {
    addReader("u-admin", { email: "anna@example.org", lang: "en", fields: null, active: true });
    addReader("u-admin", { email: "ben@example.org", lang: "en", fields: null, active: true });
    expect((await outcome(saveReaderAction(idle, form({ locale: "en", email: "ANNA@example.org", lang: "en", all: "on" })))).value).toMatchObject({ error: "duplicate" });
    const ben = listReaders().find((x) => x.email === "ben@example.org")!;
    expect((await outcome(saveReaderAction(idle, form({ locale: "en", id: ben.id, email: "anna@example.org", lang: "en", all: "on" })))).value).toMatchObject({ error: "duplicate" });
    expect((await outcome(saveReaderAction(idle, form({ locale: "en", id: "nope", email: "cleo@example.org", lang: "en", all: "on" })))).value).toMatchObject({ error: "not_found" });
    expect((await outcome(removeReaderAction(form({ locale: "en", id: "nope" })))).to).toBe("/en/admin/einstellungen?error=not_found");
  });

  it("without an admin session nothing is written", async () => {
    guard.result = { ok: false, reason: "login", user: null };
    expect((await outcome(saveReaderAction(idle, form({ locale: "en", email: "anna@example.org", lang: "en", all: "on" })))).value).toMatchObject({ error: "not_allowed" });
    expect((await outcome(saveDigestAction(form({ locale: "en", enabled: "on", weeks: "every" })))).to).toMatch(/^\/en\/login\?next=/);
    expect(listReaders()).toEqual([]);
    expect(getDigestSettings().enabled).toBe(false);
    expect(auditRows()).toEqual([]);
  });
});

describe("GET /api/digest-config", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SETTINGS", "1");
    vi.stubEnv("DIGEST_CONFIG_TOKEN", TOKEN);
  });

  it("404 while the token is unset or too short", async () => {
    vi.stubEnv("DIGEST_CONFIG_TOKEN", "");
    expect((await api(`Bearer ${TOKEN}`)).status).toBe(404);
    vi.stubEnv("DIGEST_CONFIG_TOKEN", "short");
    expect((await api("Bearer short")).status).toBe(404);
    expect(configuredDigestToken({ DIGEST_CONFIG_TOKEN: ` ${TOKEN} ` })).toBe(TOKEN);
  });

  it("401 on a missing or wrong token, never with data", async () => {
    for (const auth of [undefined, "", "Bearer", `Basic ${TOKEN}`, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, `Bearer ${"u".repeat(40)}`]) {
      const res = await api(auth);
      expect(res.status, String(auth)).toBe(401);
      expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).toBe("");
    }
  });

  it("200 with the right token: exactly enabled, weeks and the readers, never cached", async () => {
    addReader("u-admin", { email: "anna@example.org", lang: "de", fields: ["251", "policy"], active: true });
    addReader("u-admin", { email: "ben@example.org", lang: "en", fields: null, active: false });
    const res = await api(`Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      enabled: false,
      weeks: "every",
      readers: [
        { email: "anna@example.org", lang: "de", fields: ["251", "policy"], active: true },
        { email: "ben@example.org", lang: "en", fields: null, active: false },
      ],
    });
    expect(Object.keys(body).sort()).toEqual(["enabled", "readers", "weeks"]);
    for (const r of body.readers) expect(Object.keys(r).sort()).toEqual(["active", "email", "fields", "lang"]);
  });

  it("an admin switching the email on shows up in the API", async () => {
    await outcome(saveDigestAction(form({ locale: "en", enabled: "on", weeks: "odd" })));
    expect(await (await api(`bearer ${TOKEN}`)).json()).toMatchObject({ enabled: true, weeks: "odd" });
  });

  it("rate-limited like the sign-in: after 10 wrong tokens from one address, 429 even for the right one", async () => {
    for (let i = 0; i < 10; i++) expect((await api("Bearer wrong")).status).toBe(401);
    const res = await api(`Bearer ${TOKEN}`);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("900");
    _clearRateLimitStore();
    expect((await api(`Bearer ${TOKEN}`)).status).toBe(200);
  });

  it("the token compare hashes both sides (constant time, any length)", () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches("", TOKEN)).toBe(false);
    expect(bearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(bearerToken(`Bearer ${"x".repeat(600)}`)).toBe("");
    expect(bearerToken(null)).toBe("");
  });
});

describe("texts in both languages", () => {
  type Tree = Record<string, unknown>;
  const s = { en: (en as Tree).settings as Record<string, string>, de: (de as Tree).settings as Record<string, string> };
  const needed = [
    "title",
    "intro",
    "mailTitle",
    "mailOn",
    "statusOn",
    "statusOff",
    "weeksLegend",
    "weeksHint",
    "daysLabel",
    "daysValue",
    "readersTitle",
    "readersCount",
    "readersEmpty",
    "allFields",
    "removeConfirm",
    ...DIGEST_FIELDS.map((f) => `field_${f}`),
    ...DIGEST_WEEKS.map((w) => `weeks_${w}`),
    ...DIGEST_LANGS.map((l) => `lang_${l}`),
    ...["email", "lang", "fields", "duplicate", "not_found", "too_many", "not_allowed", "weeks"].map((e) => `err_${e}`),
    ...["digest", "reader_add", "reader_edit", "active", "paused", "removed"].map((k) => `saved_${k}`),
  ];
  it.each(["en", "de"] as const)("%s has every settings text the page and form use", (l) => {
    const missing = needed.filter((k) => typeof s[l][k] !== "string" || !s[l][k]!.trim());
    expect(missing).toEqual([]);
    expect(((l === "en" ? en : de) as unknown as { admin: Record<string, string> }).admin.settingsTitle).toBeTruthy();
  });
  it("the category labels are the readable names", () => {
    expect(s.en.field_251).toBe("Software and applications");
    expect(s.en.field_policy).toBe("New in parliament and federal law");
    expect(s.de.field_250).toBe("Informatik allgemein");
  });
});
