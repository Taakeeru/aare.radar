"use client";

import { useTranslations } from "next-intl";
import { PageIcon } from "@/components/page-icon";
import { Link, usePathname } from "@/i18n/navigation";

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
                <PageIcon name={i.key} />
                {t(i.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
