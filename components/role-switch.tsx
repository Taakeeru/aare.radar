"use client";

import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * The role choice on Demand, Skills and Employers: a drop-down like the job list on the start page (team, 21.11.2026:
 * «in all the pages please incorporate the drop-down menu»; 18 role buttons were too many). Without script the
 * «Show» button submits the same choice as a plain form.
 */
export function RoleSwitch({ roles, current, label, base = "", show = "Show" }: { base?: string; roles: { id: string; label: string }[]; current: string; label: string; show?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const target = base || pathname || "/";
  return (
    <form className="job-select" action="" method="get">
      <label htmlFor="role">{label}</label>
      <div className="job-select__row">
        <select
          id="role"
          name="role"
          defaultValue={current}
          onChange={(e) => {
            const q = new URLSearchParams(params?.toString() ?? "");
            q.set("role", e.target.value);
            router.push(`${target}?${q.toString()}`, { scroll: false });
          }}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className="btn">
            {show}
          </button>
        </noscript>
      </div>
    </form>
  );
}
