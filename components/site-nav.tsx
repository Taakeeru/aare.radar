"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// One icon per page in Aare turquoise instead of the letters A to E (team, 21.11.2026). Paths in a 24 box, stroke only.
const ICONS: Record<string, string> = {
  demand: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  skills: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z",
  employers: "M3 21h18M5 21V5h9v16M14 9h5v12M8 9h2M8 13h2M8 17h2",
  target: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M17 3.5a4 4 0 0 1 0 7M22 21c0-3-1.7-5.5-4.5-6.5",
  policy: "M12 3v18M5 21h14M4 7h16M7 7l-3 7c0 1.7 1.3 3 3 3s3-1.3 3-3L7 7zM17 7l-3 7c0 1.7 1.3 3 3 3s3-1.3 3-3l-3-7z",
  volunteers: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  sources: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h12M8 7h6M8 11h6",
};

const ITEMS = [
  { key: "demand", href: "/nachfrage" },
  { key: "skills", href: "/faehigkeiten" },
  { key: "employers", href: "/arbeitgeber" },
  { key: "target", href: "/zielgruppe" },
  { key: "policy", href: "/politik" },
  { key: "volunteers", href: "/freiwillige" },
  { key: "sources", href: "/quellen" },
] as const;

/** The main navigation: the five questions (Demand to Policy), then the sources, each with its icon. */
export function SiteNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="nav">
      <ul>
        {ITEMS.map((i) => {
          const current = pathname === i.href;
          return (
            <li key={i.key}>
              <Link href={i.href} className="nav__link" aria-current={current ? "page" : undefined}>
                <svg className="nav__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d={ICONS[i.key]} />
                </svg>
                {t(i.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
