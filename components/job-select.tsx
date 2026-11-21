"use client";

import { useRouter } from "@/i18n/navigation";

/**
 * The job list on the start page (21.11.2026, Isabella: «a scroll down list with all the different IT roles»).
 * Choosing one opens its dashboard (?job=<code>); «All IT jobs» shows the market at a glance. Without script the
 * «Show» button submits the same choice as a plain form.
 */
export function JobSelect({ jobs, current, label, all, show, placeholder }: { jobs: { code: string; label: string }[]; current: string; label: string; all: string; show: string; placeholder?: string }) {
  const router = useRouter();
  return (
    <form className="job-select" action="" method="get">
      <label htmlFor="job">{label}</label>
      <div className="job-select__row">
        <select
          id="job"
          name="job"
          defaultValue={current || (placeholder ? "__select" : "")}
          onChange={(e) => router.push(e.target.value ? `/?job=${encodeURIComponent(e.target.value)}` : "/", { scroll: false })}
        >
          {placeholder ? (
            <option value="__select" disabled>
              {placeholder}
            </option>
          ) : null}
          <option value="">{all}</option>
          {jobs.map((j) => (
            <option key={j.code} value={j.code}>
              {j.label}
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
