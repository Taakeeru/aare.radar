"use client";

import { useState } from "react";
import { Donut, type Slice } from "@/components/donut";

/**
 * «Skills companies seek», interactive (Seckin, 21.11.2026: «which companies?»): pick a skill (legend buttons) to see
 * the companies that ask for it most (no recruiting agencies).
 */
export function SkillCompanies({ slices, companies, label, pick, adsWord, none }: {
  slices: Slice[];
  companies: Record<string, { company: string; ads: number }[]>;
  label: string;
  pick: string;
  adsWord: string;
  none: string;
}) {
  const [sel, setSel] = useState(slices[0]?.key ?? "");
  const list = companies[sel] ?? [];
  return (
    <div>
      <Donut slices={slices} label={label} center="100%" size="large" />
      <p className="skillco__pick">{pick}</p>
      <div className="skillco__chips" role="group" aria-label={pick}>
        {slices.map((s) => (
          <button key={s.key} type="button" className="vol__chip" aria-pressed={sel === s.key} onClick={() => setSel(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {list.length > 0 ? (
        <ol className="skillco__list">
          {list.map((c) => (
            <li key={c.company}>
              <span className="company-names">{c.company}</span> <span className="skillco__n">{c.ads} {adsWord}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="note">{none}</p>
      )}
    </div>
  );
}
