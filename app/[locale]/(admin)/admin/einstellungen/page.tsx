import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { toLocale } from "@/i18n/routing";
import { requireAdminOrRedirect } from "@/lib/admin-guard";
import { adminSettingsEnabled } from "@/lib/admin-settings-flag";
import { isoWeek } from "@/lib/digest-fields";
import { DIGEST_WEEKS, getDigestSettings, listReaders, type DigestReader } from "@/lib/admin-settings";
import { removeReaderAction, saveDigestAction, setReaderActiveAction } from "./actions";
import { ReaderForm } from "./reader-form";

export async function generateMetadata(): Promise<Metadata> {
  if (!adminSettingsEnabled()) return {};
  const t = await getTranslations("settings");
  return { title: t("title") };
}

const SAVED = ["digest", "reader_add", "reader_edit", "active", "paused", "removed"] as const;
const ERRORS = ["weeks", "not_found"] as const;

function pick<T extends string>(list: readonly T[], v: unknown): T | "" {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : "";
}

/**
 * /{locale}/admin/einstellungen: the summary email (on/off, sending weeks; days fixed) and its
 * readers. Switched OFF unless ADMIN_SETTINGS=1: then this page is a 404 for everybody, before
 * any sign-in check, so it does not even show that it exists. With the switch on it asks the
 * admin guard like every admin page.
 */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; edit?: string; remove?: string }>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  if (!adminSettingsEnabled()) notFound();
  await requireAdminOrRedirect(locale, `/${locale}/admin/einstellungen`);
  const sp = await searchParams;
  const t = await getTranslations("settings");
  const a = await getTranslations("admin");

  const digest = getDigestSettings();
  const readers = listReaders();
  const editing = readers.find((r) => r.id === sp.edit) ?? null;
  const removing = readers.find((r) => r.id === sp.remove) ?? null;
  const saved = pick(SAVED, sp.saved);
  const error = pick(ERRORS, sp.error);
  const fieldsText = (r: DigestReader) => (r.fields ? r.fields.map((f) => t(`field_${f}`)).join(", ") : t("allFields"));

  return (
    <>
      <Link href="/admin">{a("back")}</Link>
      <h1 className="h-admin">{t("title")}</h1>
      <p>{t("intro")}</p>
      {saved ? (
        <p className="notice" role="status">
          {t(`saved_${saved}`)}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {t(`err_${error}`)}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="mail-title">
        <h2 id="mail-title" className="panel__title">
          {t("mailTitle")}
        </h2>
        <p className="panel__intro">{digest.enabled ? t("statusOn") : t("statusOff")}</p>
        <form action={saveDigestAction} className="form">
          <input type="hidden" name="locale" value={locale} />
          <label className="switch">
            <input type="checkbox" role="switch" name="enabled" defaultChecked={digest.enabled} />
            {t("mailOn")}
          </label>
          <fieldset className="choices" aria-describedby="weeks-hint">
            <legend>{t("weeksLegend")}</legend>
            {DIGEST_WEEKS.map((w) => (
              <label key={w} className="choice">
                <input type="radio" name="weeks" value={w} defaultChecked={digest.weeks === w} />
                {t(`weeks_${w}`)}
              </label>
            ))}
            <p className="choices__hint" id="weeks-hint">
              {t("weeksHint", { week: isoWeek(new Date()) })}
            </p>
          </fieldset>
          <dl className="facts">
            <div>
              <dt>{t("daysLabel")}</dt>
              <dd>{t("daysValue")}</dd>
            </div>
          </dl>
          <p className="note">{t("daysNote")}</p>
          <div>
            <button type="submit" className="btn btn--primary">
              {t("save")}
            </button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="readers-title">
        <h2 id="readers-title" className="panel__title">
          {t("readersTitle")}
        </h2>
        <p className="panel__intro">{t("readersIntro")}</p>
        {!digest.enabled && readers.some((r) => r.active) ? <p className="notice">{t("offNote")}</p> : null}
        <p className="muted">{readers.length === 0 ? t("readersEmpty") : t("readersCount", { count: readers.length })}</p>

        {removing ? (
          <div className="notice reader-confirm" role="alert">
            <p>{t("removeConfirm", { email: removing.email })}</p>
            <form action={removeReaderAction} className="btn-pair">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="id" value={removing.id} />
              <button type="submit" className="btn btn--outline">
                {t("removeYes")}
              </button>
              <Link href="/admin/einstellungen" className="btn-pair__link">
                {t("cancel")}
              </Link>
            </form>
          </div>
        ) : null}

        {readers.length > 0 ? (
          <ul className="readers">
            {readers.map((r) => (
              <li key={r.id} className="reader">
                <div className="reader__head">
                  <span className="reader__email">{r.email}</span>
                  <span className={`tag ${r.active ? "tag--healthy" : "tag--paused"}`}>
                    <span className="tag__dot" aria-hidden="true" />
                    {r.active ? t("statusActive") : t("statusPaused")}
                  </span>
                </div>
                <p className="reader__meta">
                  {t(`lang_${r.lang}`)} · {fieldsText(r)}
                </p>
                <div className="reader__actions">
                  <Link href={`/admin/einstellungen?edit=${encodeURIComponent(r.id)}`} className="btn btn--outline">
                    {t("edit")}
                  </Link>
                  <form action={setReaderActiveAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                    <button type="submit" className="btn btn--outline">
                      {r.active ? t("pause") : t("activate")}
                    </button>
                  </form>
                  <Link href={`/admin/einstellungen?remove=${encodeURIComponent(r.id)}`} className="btn-pair__link">
                    {t("remove")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="reader-form-title">
        <h2 id="reader-form-title" className="panel__title">
          {editing ? t("editTitle") : t("addTitle")}
        </h2>
        <ReaderForm
          key={editing?.id ?? "new"}
          locale={locale}
          id={editing?.id}
          initial={
            editing
              ? { email: editing.email, lang: editing.lang, all: editing.fields === null, fields: editing.fields ?? [], active: editing.active }
              : { email: "", lang: "en", all: true, fields: [], active: true }
          }
        />
      </section>
    </>
  );
}
