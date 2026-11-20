import type { MetadataRoute } from "next";
import { ACTIVE_LOCALES } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-meta";

export default function robots(): MetadataRoute.Robots {
  const private_ = ACTIVE_LOCALES.flatMap((l) => [`/${l}/admin`, `/${l}/login`, `/${l}/auth`, `/${l}/passwort-vergessen`]);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...private_, "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
