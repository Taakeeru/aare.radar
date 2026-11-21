import { adminSettingsEnabled } from "@/lib/admin-settings-flag";

/**
 * The areas of /admin, one line each. A new area is one line here plus its
 * page folder under app/[locale]/(admin)/admin/; every page asks the admin
 * guard itself (lib/__tests__/admin-guard-coverage.test.ts).
 */
export const ADMIN_AREAS = [
  { href: "/admin/berichte", label: "reportsTitle" },
  { href: "/admin/sicherheit", label: "security" },
  { href: "/admin/protokoll", label: "protocol" },
] as const;

/** «Settings» (summary email and its readers): only with ADMIN_SETTINGS=1 (lib/admin-settings-flag.ts). */
export const SETTINGS_AREA = { href: "/admin/einstellungen", label: "settingsTitle" } as const;

export type AdminArea = (typeof ADMIN_AREAS)[number] | typeof SETTINGS_AREA;

/** The areas the admin start page lists right now: ADMIN_AREAS, plus «Settings» when the switch is on. */
export function adminAreas(env: Record<string, string | undefined> = process.env): readonly AdminArea[] {
  return adminSettingsEnabled(env) ? [...ADMIN_AREAS, SETTINGS_AREA] : ADMIN_AREAS;
}
