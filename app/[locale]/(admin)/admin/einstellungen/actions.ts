"use server";

/**
 * The actions of /admin/einstellungen (lib/admin-settings.ts). Each one:
 *
 *   1. answers 404 while the area is switched off (ADMIN_SETTINGS, lib/admin-settings-flag.ts);
 *   2. asks the admin guard (signed in, an admin, second factor as the other admin pages);
 *   3. validates its input, writes, and leaves one audit row (masked address).
 *
 * Origin: these are server actions, so Next checks the Origin against the host before they run
 * (lib/__tests__/security-headers.test.ts keeps that check on). No address goes into a redirect.
 */
import { notFound, redirect } from "next/navigation";
import { toLocale } from "@/i18n/routing";
import { requireAdmin, requireAdminOrRedirect } from "@/lib/admin-guard";
import { adminSettingsEnabled } from "@/lib/admin-settings-flag";
import { addReader, isDigestWeeks, removeReader, saveDigestSettings, setReaderActive, updateReader, validateReader, type ReaderError } from "@/lib/admin-settings";

export type ReaderFormValues = { email: string; lang: string; all: boolean; fields: string[]; active: boolean };
export type ReaderFormError = ReaderError | "duplicate" | "not_found" | "too_many" | "not_allowed";
export type ReaderFormState = { status: "idle" } | { status: "error"; error: ReaderFormError; values: ReaderFormValues };

const PAGE = (locale: string) => `/${locale}/admin/einstellungen`;

function readId(formData: FormData): string {
  return String(formData.get("id") ?? "").slice(0, 64);
}

function readerValues(formData: FormData): ReaderFormValues {
  return {
    email: String(formData.get("email") ?? "").slice(0, 320),
    lang: String(formData.get("lang") ?? ""),
    all: formData.get("all") === "on",
    fields: formData.getAll("fields").map((f) => String(f).slice(0, 16)).slice(0, 32),
    active: formData.get("active") === "on",
  };
}

/** Summary email: on/off and the sending weeks. */
export async function saveDigestAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  if (!adminSettingsEnabled()) notFound();
  const { user } = await requireAdminOrRedirect(locale, PAGE(locale));
  const weeks = formData.get("weeks");
  if (!isDigestWeeks(weeks)) redirect(`${PAGE(locale)}?error=weeks`);
  saveDigestSettings(user.id, { enabled: formData.get("enabled") === "on", weeks });
  redirect(`${PAGE(locale)}?saved=digest`);
}

/** Add a reader (no id) or change one (id). The form keeps what was typed when it is refused. */
export async function saveReaderAction(_prev: ReaderFormState, formData: FormData): Promise<ReaderFormState> {
  const locale = toLocale(formData.get("locale"));
  if (!adminSettingsEnabled()) notFound();
  const g = await requireAdmin();
  const values = readerValues(formData);
  if (!g.ok) return { status: "error", error: "not_allowed", values };
  const v = validateReader(values);
  if (!v.ok) return { status: "error", error: v.error, values };
  const id = readId(formData);
  const res = id ? updateReader(g.user.id, id, v.value) : addReader(g.user.id, v.value);
  if (!res.ok) return { status: "error", error: res.error, values };
  redirect(`${PAGE(locale)}?saved=${id ? "reader_edit" : "reader_add"}`);
}

/** Pause a reader (stays on the list, gets nothing) or make them active again. */
export async function setReaderActiveAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  if (!adminSettingsEnabled()) notFound();
  const { user } = await requireAdminOrRedirect(locale, PAGE(locale));
  const active = formData.get("active") === "1";
  const res = setReaderActive(user.id, readId(formData), active);
  if (!res.ok) redirect(`${PAGE(locale)}?error=not_found`);
  redirect(`${PAGE(locale)}?saved=${active ? "active" : "paused"}`);
}

/** Remove a reader for good (the page asks first: ?remove=<id>). */
export async function removeReaderAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  if (!adminSettingsEnabled()) notFound();
  const { user } = await requireAdminOrRedirect(locale, PAGE(locale));
  const res = removeReader(user.id, readId(formData));
  if (!res.ok) redirect(`${PAGE(locale)}?error=not_found`);
  redirect(`${PAGE(locale)}?saved=removed`);
}
