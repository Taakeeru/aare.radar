/**
 * The switch for the admin «Settings» area (/admin/einstellungen) and its read API
 * (/api/digest-config). OFF by default: the team decides when it goes on.
 *
 *   ADMIN_SETTINGS=1   the area is in the admin menu, the page and the API answer
 *   anything else      the area is not listed, the page and the API answer 404
 *
 * No database import here, so the admin menu (admin/areas.ts) and the tests read it cheaply.
 * Guard: lib/__tests__/admin-settings.test.ts pins the default-off behaviour.
 */

/** On only for an explicit "1", "true" or "on" (same rule as ADMIN_TOTP_REQUIRED); unset is off. */
export function adminSettingsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.ADMIN_SETTINGS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}
