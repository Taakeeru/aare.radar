import type { MetadataRoute } from "next";
import { ACTIVE_LOCALES } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-meta";

const PAGES = ["", "/nachfrage", "/faehigkeiten", "/arbeitgeber", "/zielgruppe", "/politik", "/quellen"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ACTIVE_LOCALES.flatMap((l) => PAGES.map((p) => ({ url: `${SITE_URL}/${l}${p}` })));
}
