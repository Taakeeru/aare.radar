# AareRadar

Shows a non-technical team where the Swiss IT job market is heading for the roles Powercoders graduates go into
(web developer, IT support, data analyst): demand, most requested skills, entry barriers, and policy changes.

## Sources

Every source is one entry in `sources.json` (id, name, link, one sentence, questions A-E, type, schedule, plus a few
settings for its type). Adding a source is a copy-and-change of an entry, no code: see
[docs/adding-a-source.md](docs/adding-a-source.md).

| Source (id) | Question | Type | What |
|---|---|---|---|
| job-room.ch, SECO (`jobroom`) | A B C | `jobroom_search` | Swiss job ads incl. canton and reporting-duty flag; max 60 days back, so we snapshot daily |
| BFS JOBSTAT (`bfs`) | A | `pxweb` | open positions in IT sectors, quarterly |
| Eurostat (`eurostat_jvs`) | A | `csv_series` (JSON-stat) | job vacancy rate, information and communication, Switzerland |
| SECO Stellenmeldepflicht 2026 (`seco_stellenmeldepflicht`) | A E | `link` | list of occupations under the job-reporting duty (IT is not on it) |
| Curia Vista (`curia`), Fedlex (`fedlex`) | E | `odata_search`, `rss_keywords` | parliament business and new federal law on asylum, status F/S, integration, skilled workers |
| SEM asylum statistics (`sem_asylprozess`, `sem_erwerb_status_f/b/s/n`) | D | `xlsx_series` | stock of persons with status N, F, B, S by canton and nationality; employment rate (18-64) by status, canton, nationality, sex, length of stay; monthly |
| BFS (`bfs_population_permit`, `bfs_sozialhilfe_asyl`) | D | `pxweb`, `xlsx_series` | residents by permit incl. F/N/S; social-assistance rate of working-age asylum persons by canton |
| SEM pages, ESCO (`sem_*`, `esco`) | B D E | `link` | references without numbers |

Skills are linked to ESCO (official EU skills classification) where it has a concept: `collector/esco_skills.json`,
built once with `python3 -m collector.esco_lookup` (curated, because ESCO lacks React, Docker, Azure ...).

Not used: LinkedIn and jobs.ch (no public API, scraping breaks their terms); Adzuna (Switzerland support unverified,
aggregate use after the 14-day trial needs written consent).

## Run

    python3 -m collector.collect            # every source in sources.json -> data/radar.db
    python3 -m collector.collect curia bfs  # only these ids   (old names: jobs, policy)
    python3 -m collector.collect --due      # only what its schedule says is due
    python3 -m collector.collect --list     # sources, schedule, last successful run
    python3 -m collector.export             # data/radar.json for the dashboard (contract: docstring of export.py)
    python3 -m unittest discover -s tests -t .   # tests, no network

job-room answers from servers too (HTTP 200 checked from the VPS on 20.11.2026), so every source runs anywhere. A source that
truly needs a home/office IP gets `"home_ip_only": true` in `sources.json` and is then skipped on a server
(`CI` or `RADAR_SERVER` set; one-off override `RADAR_ALLOW_SERVER=1`). Servers that answer 429 are respected: the
collector waits as long as `Retry-After` says. Python 3.10+, standard library only.

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
