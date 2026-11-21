"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { key: "demand", letter: "A", href: "/#nachfrage" },
  { key: "skills", letter: "B", href: "/#faehigkeiten" },
  { key: "employers", letter: "C", href: "/#arbeitgeber" },
  { key: "target", letter: "D", href: "/zielgruppe" },
  { key: "policy", letter: "E", href: "/politik" },
  { key: "sources", letter: "", href: "/quellen" },
] as const;

/** The main navigation: the five questions A to E, then the sources. A to C are sections of the dashboard. */
export function SiteNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="nav">
      <ul>
        {ITEMS.map((i) => {
          const page = i.href.startsWith("/#") ? null : i.href;
          const current = page !== null && pathname === page;
          return (
            <li key={i.key}>
              <Link href={i.href} className="nav__link" aria-current={current ? "page" : undefined}>
                {i.letter ? <span className="nav__letter">{i.letter}</span> : null}
                {t(i.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
