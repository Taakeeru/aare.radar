"use client";

/**
 * Add or edit one reader of the summary email (/admin/einstellungen). The action validates on
 * the server (lib/admin-settings.ts validateReader); a refused form comes back with what was
 * typed, so nothing has to be entered twice.
 */
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DIGEST_FIELDS, DIGEST_LANGS } from "@/lib/digest-fields";
import { saveReaderAction, type ReaderFormState, type ReaderFormValues } from "./actions";

export function ReaderForm({ locale, id, initial }: { locale: string; id?: string; initial: ReaderFormValues }) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<ReaderFormState, FormData>(saveReaderAction, { status: "idle" });
  const v = state.status === "error" ? state.values : initial;
  const error = state.status === "error" ? state.error : null;
  const errorOn = (field: string) => (error === field ? true : undefined);
  const describedBy = error ? "reader-error" : undefined;

  return (
    <form action={action} className="form" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {error ? (
        <p className="form-error" role="alert" id="reader-error">
          {t(`err_${error}`)}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="reader-email">{t("email")}</label>
        <input
          id="reader-email"
          name="email"
          type="email"
          autoComplete="off"
          inputMode="email"
          required
          maxLength={254}
          defaultValue={v.email}
          aria-invalid={errorOn("email") || errorOn("duplicate")}
          aria-describedby={describedBy}
        />
      </div>

      <fieldset className="choices" aria-invalid={errorOn("lang")}>
        <legend>{t("lang")}</legend>
        {DIGEST_LANGS.map((l) => (
          <label key={l} className="choice">
            <input type="radio" name="lang" value={l} defaultChecked={v.lang === l} />
            {t(`lang_${l}`)}
          </label>
        ))}
      </fieldset>

      <fieldset className="choices" aria-invalid={errorOn("fields")} aria-describedby="reader-fields-hint">
        <legend>{t("fields")}</legend>
        <p className="choices__hint" id="reader-fields-hint">
          {t("fieldsHint")}
        </p>
        <label className="choice choice--all">
          <input type="checkbox" name="all" defaultChecked={v.all} />
          {t("allFields")}
        </label>
        {DIGEST_FIELDS.map((f) => (
          <label key={f} className="choice">
            <input type="checkbox" name="fields" value={f} defaultChecked={!v.all && v.fields.includes(f)} />
            {t(`field_${f}`)}
          </label>
        ))}
      </fieldset>

      <label className="choice">
        <input type="checkbox" name="active" defaultChecked={v.active} />
        {t("activeLabel")}
      </label>

      <div className="btn-pair">
        <button type="submit" className="btn btn--outline" aria-busy={pending}>
          {id ? t("editSubmit") : t("addSubmit")}
        </button>
        {id ? (
          <Link href="/admin/einstellungen" className="btn-pair__link">
            {t("cancel")}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
