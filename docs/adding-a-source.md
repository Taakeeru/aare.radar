# Adding a data source to the radar

Every source the radar uses is one short block in the file `sources.json`. To add a source you copy a block, change a few
words, run one command and look at the result. No programming is needed for most sources.

The data rules still apply to every new source: **aggregate numbers only, no personal data**, and **no scraping of sites
whose terms forbid it** (LinkedIn and jobs.ch are out). Use official APIs, open data and published reports. Every number
shows its source link and the date it was last updated; the block below is where that link comes from.

## For everyone: copy a block, change it, run it

1. Open `sources.json` in any text editor.
2. Find a block of the same kind as what you want (see "Which block do I copy?" below) and copy it, including the curly
   brackets, to the end of the list. Put a comma between two blocks.
3. Change these words (they are the same in every block):

   | Word | What to write |
   |---|---|
   | `id` | A short unique name, only small letters, digits and `_`, e.g. `eurostat_jvs_de`. Never change it later: the numbers are stored under it. |
   | `name` | The name people see in the dashboard. |
   | `url` | The web page where a person can see the same data (this becomes the "source" link). Must start with `https://`. |
   | `what` | One plain sentence: what do the numbers say? |
   | `questions` | Which of the five questions it helps: `"A"` demand, `"B"` skills, `"C"` employers, `"D"` target group, `"E"` policy watch. More than one is fine. |
   | `schedule` | How often it should be refreshed: `daily`, `weekly` or `monthly`. |

4. Change the few words that are specific to the kind of block (the address of the data, the keywords). The comments in
   "Which block do I copy?" say which ones.
5. Check the file and run the new source only:

       python3 -m collector.collect your_new_id

   You see a line such as `your_new_id: 44 rows` (numbers) or `3 new items` (policy news). If something is wrong, the
   message says what, in words (for example `sources.json has problems: your_new_id: missing 'what'`). The other sources
   are not affected by a mistake in yours.
6. Look at the result: `python3 -m collector.export` writes `data/radar.json`; your numbers are under `series`, your
   news under `policy`, and your block is listed under `sources` with its last-update date.

`python3 -m collector.collect --list` shows all sources, their schedule and when each last worked.
`python3 -m collector.collect` (without a name) refreshes everything; `--due` refreshes only what its schedule says is due.

### Which block do I copy?

| I want to add... | Copy the block `type` | Example in `sources.json` |
|---|---|---|
| a statistics table from the Federal Statistical Office (BFS) or another PxWeb office | `pxweb` | `bfs`, `bfs_population_permit` |
| a CSV or JSON file with a table, or a Eurostat / opendata.swiss download | `csv_series` | `eurostat_jvs` |
| an Excel file (SEM asylum statistics, BFS tables) | `xlsx_series` | `sem_erwerb_status_s`, `bfs_sozialhilfe_asyl` |
| news from an RSS feed that mention certain words | `rss_keywords` | `fedlex` |
| parliament business or another OData service searched by words | `odata_search` | `curia` |
| a report or page that has no usable numbers (PDF, web page) | `link` | `esco`, `sem_auslaenderstatistik` |
| job ads from job-room.ch | `jobroom_search` | `jobroom` (only one is needed) |

A `link` block is shown as a reference only: nothing is collected. Use it when a source is only a PDF.

### Worked example 1: the job vacancy rate of another country (change two words)

Eurostat publishes the job vacancy rate of the IT and communication sector for many countries. The radar already has it
for Switzerland (`eurostat_jvs`). To add Germany for comparison, copy that block, and change `id`, `name`, and the two
letters `geo=CH` to `geo=DE` in `data_url`:

```json
{
 "id": "eurostat_jvs_de",
 "name": "Eurostat, job vacancy statistics (Germany, information and communication)",
 "url": "https://ec.europa.eu/eurostat/databrowser/view/jvs_q_nace2/default/table",
 "what": "The job vacancy rate in information and communication (NACE J) in Germany, quarterly, for comparison with Switzerland.",
 "questions": ["A"],
 "type": "csv_series",
 "schedule": "monthly",
 "format": "jsonstat",
 "data_url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/jvs_q_nace2?geo=DE&nace_r2=J&s_adj=SA&sizeclas=TOTAL&indic_em=JVR&lang=en&sinceTimePeriod=2015-Q1",
 "units": {"rate": "%"}
}
```

Run `python3 -m collector.collect eurostat_jvs_de`. You should see about 44 rows (one per quarter since 2015).
The series appears in `radar.json` under `series` > `A`, next to the Swiss one.

### Worked example 2: a new table from the Federal Statistical Office (pick values by words)

Goal: how many foreign citizens move to Switzerland each year. On the BFS data portal the table is called
"Demographic balance by canton" and its address ends in `px-x-0102020000_101`. In a `pxweb` block you do not list codes; you
say, for each question the table asks, which answers you want, using words (`values` is matched against the names in the
table, upper and lower case do not matter):

```json
{
 "id": "bfs_immigration_foreign",
 "name": "BFS, immigration of foreign citizens",
 "url": "https://www.bfs.admin.ch/bfs/en/home/statistics/population/effectif-change/demographic-balance.html",
 "what": "Foreign citizens moving to Switzerland each year, all of Switzerland.",
 "questions": ["D"],
 "type": "pxweb",
 "schedule": "monthly",
 "unit": "persons",
 "table": "https://www.pxweb.bfs.admin.ch/api/v1/en/px-x-0102020000_101/px-x-0102020000_101.px",
 "select": [
  {"variable": "^year$", "last": 15},
  {"variable": "^canton$", "values": "^Switzerland$"},
  {"variable": "citizenship", "values": "foreign"},
  {"variable": "component", "values": "^Immigration"}
 ]
}
```

How to read `select`: `variable` is a word from the question's name (the dashboard of the BFS table shows the names),
`values` is a word from the answers you want, `last: 15` means "the latest 15 years". A question you do not mention is left
out (the total is used). If your words match nothing, the run stops with a message such as
`no value of 'Canton' matches /^Switzerland$/`: open the table address in a browser (it lists every variable and value) and
fix the words. The BFS server sometimes answers "too many requests"; the collector then waits as long as the server asks and
tries again by itself.

### What the dashboard shows for your block

Every block appears under `sources` (name, link, one sentence, last-update date, schedule, and whether the last run worked).
Numbers appear under `series`, grouped by question, each with the unit. Nothing else needs to be done.

### Things to know

* Run `python3 -m collector.collect` from the Mac (home IP). job-room must never run from a server; the `jobroom` block
  is marked `"home_ip_only": true` and is skipped when the environment variable `CI` or `RADAR_SERVER` is set.
* Be polite: the collector waits between requests to the same server and obeys `Retry-After`. Do not lower the waits.
* Excel files from SEM get a new file address every month, so the block names the monthly page and the link text
  (`"page"`, `"file_link": "^6-22:"`); the collector finds the file itself and keeps up to `"editions"` months.
* The SEM definition of status S changed in January 2025 (people with an open S application are counted separately), so
  S numbers before and after are only roughly comparable.
* When BFS publishes a new yearly Excel (for `bfs_sozialhilfe_asyl`) the file address changes: update `file_url`.

---

## For developers: adding a new source type

A type is one Python file in `collector/types/` (standard library only, Python 3.10+):

```python
# collector/types/my_type.py
"""type "my_type": one line on what it reads. Describe every param here, the docstring is the documentation."""
from .. import net
from ..db import put_stat

REQUIRED = ["my_param"]          # config keys a block of this type must have (checked by the validator and the tests)


def run(c, entry):               # c = sqlite connection (data/radar.db), entry = the block from sources.json
    body, headers = net.fetch(entry["my_param"])       # ALWAYS fetch through net.fetch: pacing, retries, Retry-After
    n = 0
    for label, period, value in parse(body, entry):
        put_stat(c, entry["id"], label, period, value, entry.get("unit"))   # numbers -> table "stats"
        n += 1
    c.commit()
    return n                     # rows stored; the runner records ok/error and the date per source
```

Then:

1. Add `"my_type"` to `NAMES` in `collector/types/__init__.py`.
2. Where results go: numbers via `put_stat(c, source_id, series, period, value, unit, dimension)` into `stats` (the exporter
   puts them under `series` automatically, grouped by the entry's `questions`); news-like items into the `policy` table
   (`id` = `<source id>:<item id>` so re-runs never duplicate); ads stay with `jobroom_search`.
3. Keep `parse` a pure function (bytes in, rows out) so a test can feed it a saved sample.
4. Add a tiny saved sample to `tests/fixtures/` and a test in `tests/test_types.py` that calls `parse` and `run` with
   `net.fetch` replaced (see the existing tests): no network in tests.
5. Add an entry using the type to `sources.json`, run `python3 -m unittest discover -s tests -t .`, then the real
   run `python3 -m collector.collect <id>`.
6. Document the params in the module docstring and add a row to the "Which block do I copy?" table above.

Rules that apply to every type: aggregate data only; no scraping where the terms forbid it; never store free text from ads
or people's names; be polite to the server.

### Existing types in short

| type | reads | key params |
|---|---|---|
| `jobroom_search` | job-room.ch ads, classified by `roles.py` | `online_since_days` |
| `pxweb` | any PxWeb table | `table`, `select` (rules by variable/value words) |
| `odata_search` | OData service searched by keywords | `base`, `filter`, `keywords`, `fields`, `link` |
| `rss_keywords` | RSS feed filtered by keywords | `feed`, `keywords` |
| `csv_series` | CSV, JSON or JSON-stat file | `data_url`, `format`, `period`/`value`/`series` columns |
| `xlsx_series` | Excel file, fixed address or found on a monthly page | `file_url` or `page`+`file_link`, `sheets`, `columns` |
| `link` | nothing (reference only) | none |

The full parameter list of each type is the docstring at the top of its file in `collector/types/`.

### Other tools

* `python3 -m collector.esco_lookup` rebuilds `collector/esco_skills.json` (skill label to ESCO skill address). It is curated by
  hand because ESCO has no concept for several tools (Docker, Kubernetes, React ...); those skills get no `esco_uri`.
* Tests: `python3 -m unittest discover -s tests -t .` (about a second; no network, no build).
