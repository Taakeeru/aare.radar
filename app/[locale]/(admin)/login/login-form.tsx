"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("login");
  const locale = useLocale();
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { error: "", email: "" });
  return (
    <form action={action} className="form" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <p className="form-error" role="alert" id="login-error">
          {t(state.error)}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="pw-email">{t("email")}</label>
        <input id="pw-email" name="email" type="email" autoComplete="username" defaultValue={state.email} required aria-describedby={state.error ? "login-error" : undefined} />
      </div>
      <div className="field">
        <label htmlFor="pw-password">{t("password")}</label>
        <input id="pw-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
      </div>
      <div className="btn-pair">
        <button type="submit" className="btn btn--primary" aria-busy={pending}>
          {t("submit")}
        </button>
        <Link href="/passwort-vergessen" className="btn-pair__link">
          {t("forgot")}
        </Link>
      </div>
    </form>
  );
}
