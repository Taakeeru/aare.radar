import { getTranslations } from "next-intl/server";
import { SiteChrome } from "@/components/site-chrome";
import { Link } from "@/i18n/navigation";

/** A missing page inside the normal public frame (same header and footer as every public page). */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <SiteChrome>
      <div className="page">
        <h1 className="page__title">{t("title")}</h1>
        <p className="page__lead">{t("text")}</p>
        <p>
          <Link href="/" className="btn btn--primary">
            {t("home")}
          </Link>
        </p>
      </div>
    </SiteChrome>
  );
}
