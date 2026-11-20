"use client";

/**
 * «Enter one code to switch it on» (first setup and re-setup), port of the template
 * EnableTotpForm.tsx. The backup codes come back in the action result and are
 * rendered once; a reload shows the enabled state without them (stored hashed).
 */
import { useActionState } from "react";
import { enableTotpAction, type EnableState } from "./actions";

export function EnableTotpForm({
  copy,
  reenrol,
  cancel,
}: {
  copy: Record<string, string>;
  reenrol: boolean;
  cancel?: { action: (formData: FormData) => void | Promise<void>; label: string; locale: string };
}) {
  const [state, action, pending] = useActionState<EnableState, FormData>(enableTotpAction, { status: "idle" });

  if (state.status === "enabled") {
    return (
      <div role="status" className="notice">
        <p>
          <strong>{copy.enabledTitle}</strong>
        </p>
        <p>{copy.backupIntro}</p>
        <ul className="backup-codes">
          {state.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p>{copy.backupOnce}</p>
      </div>
    );
  }

  return (
    <form action={action} className="form">
      {cancel ? <input type="hidden" name="locale" value={cancel.locale} /> : null}
      <div className="field">
        <label htmlFor="enable-code">{copy.codeLabel}</label>
        <input
          id="enable-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={8}
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? "enable-code-error" : undefined}
        />
      </div>
      {state.status === "error" ? (
        <p className="form-error" role="alert" id="enable-code-error">
          {copy[`err_${state.error}`] ?? copy.err_invalid_code}
        </p>
      ) : null}
      <div className="btn-pair">
        <button type="submit" className="btn btn--primary" aria-busy={pending}>
          {reenrol ? copy.enableReset : copy.enable}
        </button>
        {cancel ? (
          <button type="submit" formAction={cancel.action} formNoValidate className="btn-pair__link btn-text">
            {cancel.label}
          </button>
        ) : null}
      </div>
    </form>
  );
}
