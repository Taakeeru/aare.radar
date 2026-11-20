# Security

The team's admin area (`/de/admin`) must be secure before the Powercoders team gets access. The security layer
comes from Pandora's client template, which went through its own security reviews; it is not a new design. The
template's member features (magic-link login, invitations, seats, payments) are left out. The public pages show
aggregate data only and need no sign-in.

## What the code is, file by file

| File | What | Notes |
|---|---|---|
| `lib/get-client-ip.ts` | client address for rate limits | X-Real-IP only (set by our Caddy), validated as an IP; never X-Forwarded-For; otherwise one shared key |
| `lib/rate-limit.ts` | in-memory rate limiter | failures-only counting for sign-in and 2FA, and a key cap that never evicts a blocking entry |
| `lib/same-origin.ts`, `lib/safe-next.ts`, `lib/log-redact.ts`, `lib/password.ts`, `lib/totp.ts` | helpers | kept verbatim from the template (scrypt `salt:hash`, minimum 8 characters; TOTP RFC 6238 with backup codes) |
| `lib/totp-store.ts` | second-factor storage | **fails closed**: a read error refuses the sign-in and the admin area, it is never treated as "no second factor" |
| `lib/auth.ts` | sessions, revocation, reset tokens, TOTP proof | lifetime 7 days, not sliding; constant scrypt work for unknown addresses; `@demo.invalid` accounts refused outside a demo instance |
| `lib/admin-guard.ts` | the one guard for every admin page and action | one kind of staff (`users.is_admin`); `setupPage` for the 2FA set-up page |
| `lib/referrer-policy.ts` | pages with a secret in the URL send only their origin as Referer | the password-reset page |
| `lib/admin-audit.ts`, `lib/audit-json.ts` | one audit log for admin actions | secret-looking keys redacted |
| `lib/boot-guards.ts`, `instrumentation.ts` | the server refuses to start in production without its settings | see below |
| `middleware.ts`, `next.config.ts` | CSP with a nonce, security headers, locale routing, noindex on admin and sign-in | |

## How sign-in works

- **Accounts**: team members only (`users.is_admin`). There is no public sign-up. An account is made without a
  password (`scripts/admin/create-admin.mjs`); the person sets their own password through «Passwort vergessen».
  **Nobody types a password for someone else.**
- **Password**: scrypt, at least 8 characters, at most 1024. Written only by `setPasswordAndRevokeSessions`, which in
  one transaction also ends every session and every open reset link.
- **Sign-in errors** never say whether an address exists: one message, the same scrypt work for every case. A rate-limit
  block says so.
- **Rate limits**: sign-in 10 failures per client address and 5 per e-mail in 15 minutes; 2FA code 5 failures per account
  and 20 per address; reset request 5 per address and 3 per e-mail; reset form 10 per address.
- **Session cookie** `radar_session`: `${userId}.${expiry}.${HMAC-SHA256}`, HttpOnly, Secure in production,
  SameSite=Lax, path `/`, 7 days. Every request checks it against `session_revocations`: sign-out, a new password and
  an admin 2FA reset end every session of the account, on every device.
- **Second factor (TOTP)**: set up at `/de/admin/sicherheit` (QR code rendered on the server, 8 single-use backup codes,
  replay protection). An account with a factor passes `/de/auth/2fa` after every sign-in; the proof cookie is bound to
  that one session. `ADMIN_TOTP_REQUIRED=1` makes it mandatory for every admin (off by default; turn it on once every
  team member has set it up).
- **Reset links**: 32 random bytes, only the SHA-256 stored, 30 minutes, single use. The page only peeks (mail scanners),
  the form POST spends it.
- **Every admin page and action** asks `lib/admin-guard.ts` on the server; middleware never decides access
  (`lib/__tests__/admin-guard-coverage.test.ts` fails when a file under `admin/` does not).

## Headers, CSRF, logs

- CSP per request with a nonce and `'strict-dynamic'`; no `'unsafe-eval'`, no inline scripts; `default-src 'self'`,
  `frame-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`. Nothing loads from another site.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` (token pages `strict-origin`),
  `Permissions-Policy`, HSTS, `Cross-Origin-Opener-Policy: same-origin`; admin and sign-in pages `noindex` and `no-store`.
- CSRF: forms post to server actions, which Next checks (Origin must match Host). Never widen
  `serverActions.allowedOrigins`. A route handler that changes state must call `isSameOrigin()` before it reads the body
  (`route-origin-ratchet.test.ts`).
- Any link built from outside data must become a link only when it is an http(s) address, and open with
  `rel="noopener noreferrer"`.
- Logs: errors through `logError` (addresses removed); never a password, token, cookie or reset link.

## Deployment settings (the server refuses to start without them)

Production = `APP_ENV=production` without `DEMO_INSTANCE=1` (`lib/boot-guards.ts`):

| Setting | Why |
|---|---|
| `AUTH_SECRET` (32+ chars, `openssl rand -hex 32`) | signs the session and proof cookies |
| `TRUST_PROXY=true` **and** the Caddy block below | per-client rate limits. Caddy's `header_up X-Real-IP {remote_host}` replaces any X-Real-IP the client sent |
| no secret under `NEXT_PUBLIC_*` | it would be compiled into the browser bundle |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | reset mails |
| `ADMIN_TOTP_REQUIRED=1` | second factor mandatory |

```caddy
reverse_proxy radar:3000 {
	header_up X-Real-IP {remote_host}
}
```

`DEMO_INSTANCE=1` is only for Pandora's CI test server; it lets the `@demo.invalid` demo admin sign in. The production
compose file never sets it.

## Reporting

Security problems: tell the team that runs the radar directly. Please do not open a public issue.
