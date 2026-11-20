# Powercoders Job Radar

Shows a non-technical team where the Swiss IT job market is heading for the roles Powercoders graduates go into
(web developer, IT support, data analyst): demand, most requested skills, entry barriers, and policy changes.

## Sources

| Source | What | Access |
|---|---|---|
| job-room.ch (SECO) | Swiss job ads incl. full text, canton, reporting-duty flag | public JSON used by the site; max 60 days back, so we snapshot daily |
| BFS JOBSTAT (PxWeb) | open positions in IT sectors (NOGA 58-63, 62-63), quarterly since 1992 | open API |
| Curia Vista (ws.parlament.ch OData) | parliament business on asylum, status F/S, integration, skilled workers | open API |
| Fedlex RSS | new federal law, keyword-filtered | open feed |

Not used: LinkedIn and jobs.ch (no public API, scraping breaks their terms); Adzuna (Switzerland support unverified,
aggregate use after the 14-day trial needs written consent).

## Run

    python3 -m collector.collect            # jobs, bfs, policy -> data/radar.db
    python3 -m collector.collect jobs       # one source

Run it from a home/office IP once a day. Python 3.10+, standard library only.

## What we extract per ad (`collector/roles.py`)

- **role**: from the job title (regex per role, plus an "is this IT at all" guard)
- **skills**: ~35 skills by regex over title + full text
- **barriers**: German/French required at a high level, formal degree (EFZ/FH/Uni), 3+ years, English accepted.
  These are what Powercoders coaches around, so the dashboard shows how open each role is to newcomers.

## The dashboard (this repo's web app)

Next.js 16 (App Router, `output: "standalone"`), React 19, next-intl (German default, English), Tailwind 4 preflight plus a
small hand-written stylesheet, vitest, Playwright. The app skeleton is Pandora's client template, so the in-house CI
judges it unchanged. The collector (`collector/`, Python standard library only) is a separate part; the app never runs
Python and never reads SQLite for the numbers.

**Data**: the app reads ONE JSON file, the output of `python3 -m collector.export` (contract: docstring of
`collector/export.py`, types in `lib/radar.ts`). Path from `RADAR_DATA`, default `fixtures/radar.sample.json`; read on
the server, cached for 10 minutes; a file that breaks later does not blank the dashboard. A test
(`lib/__tests__/radar.test.ts`) keeps types, docstring and fixture in step.

**The five questions are the navigation**: A Nachfrage, B Fähigkeiten, C Arbeitgeber (one dashboard page, role switcher
at the top), D Zielgruppe (`/de/zielgruppe`: "Daten folgen", no numbers, the planned sources SEM and BFS), E Politik
(`/de/politik`). Plus `/de/quellen`, rendered from the export's `sources` array (a new source in the export appears without
app code), and `/de/admin` (Datenstand, sign-in required).

**Data rules** (hard): every number, chart and list names its source with a link and the date of the last update right
next to it; aggregate data only, never anything about a person; example ads show only title, company, city, date, link
(`e2e/site.spec.ts` checks the source line on every panel).

| Path | What |
|---|---|
| `app/[locale]/(site)/` | dashboard (`page.tsx`), `politik/`, `quellen/`, `zielgruppe/` |
| `app/[locale]/(admin)/` | `/de/login`, `/de/auth/2fa`, `/de/passwort-vergessen`, `/de/auth/passwort-neu`, `/de/admin` (Datenstand), `/de/admin/sicherheit`, `/de/admin/protokoll`, `/de/admin/berichte` (placeholder for the planned email summaries; new areas are one line in `admin/areas.ts`) |
| `lib/radar.ts`, `lib/radar-view.ts` | the data contract and cache; plain-language numbers, dates, chart scales |
| `lib/design-tokens.ts` | the ONLY place colours and the font are defined (Pandora palette; `lib/__tests__/design-tokens.test.ts` fails on any other colour value) |
| `messages/de.json`, `en.json` | all texts. German: du, no ß, no dashes as sentence punctuation (`copy.test.ts`; also run through `~/.claude/sops/copy_rules.py`) |
| `scripts/demo/seed_demo.mjs` | adds the demo admin to a throwaway database (CI only; `DEMO_INSTANCE=1`, `DEMO_PRODUCT=radar`) |
| `scripts/admin/create-admin.mjs` | makes a team member's account (no password; they set it via "Passwort vergessen") |
| `e2e/` | Playwright specs; the ones tagged `@ci` run in the CI |
| `SECURITY.md`, `deploy/` | the security layer and the deployment |

Environment: `RADAR_DATA`, `DATABASE_URL` (SQLite, default `./data/local.db`; accounts and audit log only), `AUTH_SECRET`,
`TRUST_PROXY`, `SMTP_*`, `MAIL_FROM`, `ADMIN_TOTP_REQUIRED`, `DEMO_INSTANCE` (CI only), `NEXT_PUBLIC_APP_URL`
(default `https://radar.gnamak.ch`). Full list: `deploy/.env.example`.

Run (never `next dev` on a production host; use a container):

    npm ci && npm run build && npm run typecheck && npm test      # vitest
    npm run test:e2e:ci                                            # the @ci Playwright specs against a running server (CI_BASE_URL)

Locally: `npm ci && npm run dev`, http://localhost:3000/de.
