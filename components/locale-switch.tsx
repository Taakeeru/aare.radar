"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAMES: Record<string, string> = { de: "Deutsch", en: "English" };

/**
 * Deutsch | English in the header of every page (public, sign-in and admin): the
 * same page in the other language, query kept (role, filter). A `next` address
 * (sign-in) is moved to the other language too, so the sign-in does not land in
 * the language the person just left.
 */
export function LocaleSwitch() {
  const t = useTranslations("nav");
  const current = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <ul className="lang" aria-label={t("language")}>
      {routing.locales.map((l) => {
        const query: Record<string, string> = {};
        params.forEach((v, k) => {
          query[k] = k === "next" && v.startsWith(`/${current}/`) ? `/${l}${v.slice(current.length + 1)}` : v;
        });
        return (
          <li key={l}>
            <Link href={{ pathname, query }} locale={l} lang={l} hrefLang={l} aria-current={l === current ? "true" : undefined} className="lang__link">
              {NAMES[l] ?? l}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
