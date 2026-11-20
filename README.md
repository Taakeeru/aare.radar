# Powercoders Job Radar (hackathon prototype)

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
