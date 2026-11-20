import { Link } from "@/i18n/navigation";

/** The role switcher: plain links (no script needed), the chosen role is marked with aria-current. */
export function RoleSwitch({ roles, current, label }: { roles: { id: string; label: string }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="roles">
      <ul>
        {roles.map((r) => (
          <li key={r.id}>
            <Link href={`/?role=${encodeURIComponent(r.id)}`} className="roles__link" aria-current={r.id === current ? "true" : undefined} scroll={false}>
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
