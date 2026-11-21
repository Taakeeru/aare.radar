"""SQLite store (data/radar.db) shared by the collector and the exporter."""
import datetime as dt
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "radar.db"


def connect(path=None):
    path = Path(path) if path else DB
    if str(path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(path)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS ads(
      id TEXT PRIMARY KEY, title TEXT, company TEXT, canton TEXT, city TEXT, published TEXT, ends TEXT,
      reporting_obligation INT, occupation TEXT, workload_min INT, workload_max INT, lang TEXT, url TEXT,
      roles TEXT, skills TEXT, barriers TEXT, first_seen TEXT, last_seen TEXT);
    CREATE TABLE IF NOT EXISTS snapshots(day TEXT, role TEXT, live INT, PRIMARY KEY(day, role));
    CREATE TABLE IF NOT EXISTS stats(source TEXT, series TEXT, period TEXT, value REAL, PRIMARY KEY(source, series, period));
    CREATE TABLE IF NOT EXISTS policy(id TEXT PRIMARY KEY, source TEXT, title TEXT, date TEXT, status TEXT, url TEXT,
      matched TEXT, first_seen TEXT);
    CREATE TABLE IF NOT EXISTS source_runs(source TEXT PRIMARY KEY, last_run TEXT, last_ok TEXT, status TEXT,
      rows INT, note TEXT);
    """)
    cols = [r[1] for r in c.execute("PRAGMA table_info(ads)")]
    if "tagged" not in cols:
        c.execute("ALTER TABLE ads ADD COLUMN tagged INT")
    if "reqs" not in cols:  # requirement details (language levels, degree, years), 21.11.2026
        c.execute("ALTER TABLE ads ADD COLUMN reqs TEXT")
    if "experience" not in cols:  # job-room's own field (NO_EXPERIENCE, LESS_THAN_1_YEAR, ...), 21.11.2026
        c.execute("ALTER TABLE ads ADD COLUMN experience TEXT")
    if "full_text" in cols:  # earlier prototype stored ad text; it may name recruiters, so it goes
        c.execute("UPDATE ads SET tagged=1 WHERE full_text IS NOT NULL")
        c.execute("ALTER TABLE ads DROP COLUMN full_text")
        c.commit()
        c.execute("VACUUM")
    scols = [r[1] for r in c.execute("PRAGMA table_info(stats)")]
    for name in ("unit", "dim"):
        if name not in scols:
            c.execute(f"ALTER TABLE stats ADD COLUMN {name} TEXT")
    c.execute("UPDATE stats SET source='bfs' WHERE source='bfs_jobstat'")  # the source id is the config entry id now
    c.commit()
    return c


def put_stat(c, source, series, period, value, unit=None, dim=None):
    c.execute("INSERT OR REPLACE INTO stats(source, series, period, value, unit, dim) VALUES(?,?,?,?,?,?)",
              (source, series, period, value, unit, dim))


def has_period(c, source, period):
    return c.execute("SELECT 1 FROM stats WHERE source=? AND period=? LIMIT 1", (source, period)).fetchone() is not None


def record_run(c, source, ok, rows, note=""):
    now = dt.datetime.now().isoformat(timespec="seconds")
    prev = c.execute("SELECT last_ok FROM source_runs WHERE source=?", (source,)).fetchone()
    last_ok = now[:10] if ok else (prev[0] if prev else None)
    c.execute("INSERT OR REPLACE INTO source_runs VALUES(?,?,?,?,?,?)",
              (source, now, last_ok, "ok" if ok else "error", rows, note[:300]))
    c.commit()
