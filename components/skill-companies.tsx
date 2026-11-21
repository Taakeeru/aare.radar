"use client";

import { useState } from "react";
import { Donut, type Slice } from "@/components/donut";

/**
 * «Skills companies seek», interactive (Seckin, Isabella, 21.11.2026): click a skill (slice, legend row or chip) to
 * highlight it and see the companies that ask for it most (no recruiting agencies).
 */
export function SkillCompanies({ slices, companies, label, pick, adsWord, none }: {
  slices: Slice[];
  companies: Record<string, { company: string; ads: number; url?: string | null }[]>;
  label: string;
  pick: string;
  adsWord: string;
  none: string;
}) {
  const [sel, setSel] = useState(slices[0]?.key ?? "");
  const list = companies[sel] ?? [];
  return (
    <div>
      <Donut slices={slices} label={label} center="100%" size="large" selected={sel} onSelect={(k) => setSel(k || sel)} unit={adsWord} />
      <p className="skillco__pick">{pick}</p>
      {list.length > 0 ? (
        <ul className="skillco__list">
          {list.map((c) => {
            const url = c.url && /^https:\/\//.test(c.url) ? c.url : null;
            return (
              <li key={c.company}>
                {url ? (
                  <a className="company-names" href={url} target="_blank" rel="noopener noreferrer">
                    {c.company}
                  </a>
                ) : (
                  <span className="company-names">{c.company}</span>
                )}{" "}
                <span className="skillco__n">
                  {c.ads} {adsWord}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="note">{none}</p>
      )}
    </div>
  );
}
