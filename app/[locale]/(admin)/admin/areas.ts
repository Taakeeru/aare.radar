/**
 * The areas of /admin, one line each. A new area is one line here plus its
 * page folder under app/[locale]/(admin)/admin/; every page asks the admin
 * guard itself (lib/__tests__/admin-guard-coverage.test.ts).
 */
export const ADMIN_AREAS = [
  { href: "/admin/sicherheit", label: "security" },
  { href: "/admin/protokoll", label: "protocol" },
] as const;
