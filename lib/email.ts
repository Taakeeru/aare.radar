/**
 * The two mails the sign-in needs: the password-reset link and «Passwort
 * geändert». SMTP via nodemailer (as the template's SMTP path), configured by env:
 *
 *   SMTP_HOST, SMTP_PORT (465 = TLS, else STARTTLS), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM (e.g. "Powercoders Job Radar <noreply@radar.gnamak.ch>")
 *
 * Without SMTP_HOST nothing is sent and the server log says so, WITHOUT the
 * link: a reset token never appears in a log (Pandora's CI runs with an empty
 * SMTP_HOST, so no mail leaves a CI run either).
 */
import nodemailer from "nodemailer";
import { logError } from "@/lib/log-redact";
import { SITE_URL } from "@/lib/site-meta";
import type { Locale } from "@/i18n/routing";

export type SendResult = { ok: true } | { ok: false; error: string };

export function smtpConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SMTP_HOST ?? "").trim() !== "";
}

async function send(to: string, subject: string, text: string): Promise<SendResult> {
  if (!smtpConfigured()) {
    console.warn("[email] SMTP_HOST not set: mail not sent:", subject);
    return { ok: false, error: "smtp_not_configured" };
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    });
    await transport.sendMail({ from: process.env.MAIL_FROM ?? "Powercoders Job Radar <noreply@radar.gnamak.ch>", to, subject, text });
    return { ok: true };
  } catch (e) {
    console.error("[email] send failed:", logError(e));
    return { ok: false, error: "send_failed" };
  }
}

export function passwordResetUrl(token: string, locale: Locale, base: string = SITE_URL): string {
  return `${base.replace(/\/+$/, "")}/${locale}/auth/passwort-neu?t=${encodeURIComponent(token)}`;
}

/** Text of the reset mail, in the language of the page the person asked from (German copy passed copy_rules.py). */
export function passwordResetText(url: string, locale: Locale = "de"): { subject: string; text: string } {
  if (locale === "en") {
    return {
      subject: "New password for the Powercoders Job Radar",
      text: [
        "Hello",
        "",
        "A new password was requested for your account in the Powercoders Job Radar. Use this link to choose it:",
        "",
        url,
        "",
        "The link is valid for 30 minutes and can be used once. If you did not request a new password, you can delete this email; your password stays as it is.",
        "",
        "Powercoders Job Radar",
      ].join("\n"),
    };
  }
  return {
    subject: "Neues Passwort für den Powercoders Job Radar",
    text: [
      "Hallo",
      "",
      "Für dein Konto im Powercoders Job Radar wurde ein neues Passwort angefordert. Mit diesem Link wählst du es:",
      "",
      url,
      "",
      "Der Link gilt 30 Minuten und nur einmal. Wenn du kein neues Passwort angefordert hast, kannst du diese Mail löschen; dein Passwort bleibt, wie es ist.",
      "",
      "Powercoders Job Radar",
    ].join("\n"),
  };
}

export async function sendPasswordReset(args: { to: string; token: string; locale: Locale }): Promise<SendResult> {
  const { subject, text } = passwordResetText(passwordResetUrl(args.token, args.locale), args.locale);
  return send(args.to, subject, text);
}

export async function sendPasswordChangedNotice(args: { to: string; locale?: Locale }): Promise<SendResult> {
  if (args.locale === "en") {
    return send(
      args.to,
      "Your password was changed",
      [
        "Hello",
        "",
        "The password for your account in the Powercoders Job Radar was just changed. All earlier sign-ins have ended.",
        "",
        "Was this not you? Please contact the team that runs the radar right away.",
        "",
        "Powercoders Job Radar",
      ].join("\n"),
    );
  }
  return send(
    args.to,
    "Dein Passwort wurde geändert",
    [
      "Hallo",
      "",
      "Das Passwort für dein Konto im Powercoders Job Radar wurde soeben geändert. Alle bisherigen Anmeldungen sind damit beendet.",
      "",
      "Warst du das nicht? Dann melde dich bitte sofort beim Team, das den Radar betreut.",
      "",
      "Powercoders Job Radar",
    ].join("\n"),
  );
}
