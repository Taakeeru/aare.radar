# Powercoders Job Radar (hackathon stub)

The starting point for the Powercoders hackathon: a market radar for a non-technical team, organised along five
questions, A to E:

- **A** Demand (Nachfrage)
- **B** Skills (Fähigkeiten)
- **C** Employers (Arbeitgeber)
- **D** Target group (Zielgruppe)
- **E** Policy (Politik)

Two rules from the brief: aggregate open data only (never anything about a person), and every number names its source.
Example sources are job-room.ch, BFS, Eurostat, SEM, Curia Vista and Fedlex; which ones to use is up to the team.

The home page is a stub: the name, one line and the five question labels, without data. Everything else (data, pages,
charts) is still to be built.

## What is already here

The project was started from the client template, so the scaffolding is in place and the in-house CI judges it unchanged:

- Next.js 16 (App Router, `output: "standalone"`), React 19, next-intl (German default, English), Tailwind 4 preflight
  plus one hand-written stylesheet, vitest, Playwright.
- Sign-in for the team: `/de/login`, password reset, optional second factor, `/de/admin` (see `SECURITY.md`).
- `lib/design-tokens.ts` is the only place colours and the font are defined; a test fails on any other colour value.
- `messages/de.json`, `messages/en.json`: all texts. German: du, no ß, no dashes as sentence punctuation (`copy.test.ts`).
- `deploy/`, `Dockerfile`, `ci/`: deployment and CI inputs. `scripts/admin/create-admin.mjs` makes a team member's
  account, `scripts/demo/seed_demo.mjs` adds the demo admin to a throwaway database (CI only).
- `e2e/`: Playwright specs; the ones tagged `@ci` run in the CI.

## Run

    npm ci
    npm run dev          # http://localhost:3000/de
    npm test             # vitest
    npm run typecheck

The `@ci` Playwright specs run against a built, running server: `CI_BASE_URL=http://localhost:3000 npm run test:e2e:ci`.

Environment: `DATABASE_URL` (SQLite, default `./data/local.db`; accounts and audit log only), `AUTH_SECRET`,
`TRUST_PROXY`, `SMTP_*`, `MAIL_FROM`, `ADMIN_TOTP_REQUIRED`, `DEMO_INSTANCE` (CI only), `NEXT_PUBLIC_APP_URL`
(default `https://radar.gnamak.ch`). Full list: `deploy/.env.example`.
