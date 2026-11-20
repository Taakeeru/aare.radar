"""Collect everything listed in sources.json into data/radar.db.

    python3 -m collector.collect                 # every source (the default)
    python3 -m collector.collect curia bfs       # only these source ids
    python3 -m collector.collect --due           # only sources whose schedule says they are due
    python3 -m collector.collect --list          # show the sources, their schedule and when they last ran
    python3 -m collector.collect retag           # re-tag stored job ads after a change in roles.py (network, ~5 min)

Old names still work: jobs = jobroom, policy = curia + fedlex.
job-room: run from a home/office IP (this Mac), never from a server. Python 3.10+, standard library only.
Adding a source needs no code: see docs/adding-a-source.md.
"""
import datetime as dt
import os
import sys

from . import config, db, types

ALIASES = {"jobs": ["jobroom"], "policy": ["curia", "fedlex"]}


def due(c, entry, today=None):
    row = c.execute("SELECT last_ok FROM source_runs WHERE source=?", (entry["id"],)).fetchone()
    if not row or not row[0]:
        return True
    age = ((today or dt.date.today()) - dt.date.fromisoformat(row[0])).days
    return age >= config.SCHEDULE_DAYS[entry["schedule"]]


def run_entry(c, entry):
    """Run one source; a failing source is reported and recorded, it never stops the others."""
    if entry.get("home_ip_only") and (os.environ.get("CI") or os.environ.get("RADAR_SERVER")):
        print(f"{entry['id']}: skipped, this source must only run from a home/office IP, not from a server")
        return
    print(f"{entry['id']} ({entry['type']}) ...")
    try:
        n = types.get(entry["type"]).run(c, entry)
        db.record_run(c, entry["id"], True, n or 0, "reference only" if entry["type"] == "link" else "")
    except Exception as e:
        print(f"{entry['id']} FAILED: {e!r}")
        db.record_run(c, entry["id"], False, 0, repr(e))


def main(argv):
    entries = config.load()
    errs = config.validate(entries)
    if errs:
        sys.exit("sources.json has problems:\n  " + "\n  ".join(errs))
    c = db.connect()
    if "--list" in argv:
        for e in entries:
            r = c.execute("SELECT last_ok, status FROM source_runs WHERE source=?", (e["id"],)).fetchone()
            print(f"{e['id']:28} {e['type']:15} {e['schedule']:8} {','.join(e['questions']):6} last ok: {r[0] if r else 'never'}")
        return
    want = [a for a in argv if not a.startswith("--")]
    if "retag" in want:
        types.get("jobroom_search").retag(c)
        want.remove("retag")
        if not want:
            return
    ids = [i for w in want for i in ALIASES.get(w, [w])]
    unknown = [i for i in ids if i not in {e["id"] for e in entries}]
    if unknown:
        sys.exit(f"unknown source id(s): {', '.join(unknown)}. Known: {', '.join(e['id'] for e in entries)}")
    for e in entries:
        if ids and e["id"] not in ids:
            continue
        if "--due" in argv and not ids and not due(c, e):
            continue
        run_entry(c, e)


if __name__ == "__main__":
    main(sys.argv[1:])
