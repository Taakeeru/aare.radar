# Powercoders Job Radar (hackathon prototype)

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
