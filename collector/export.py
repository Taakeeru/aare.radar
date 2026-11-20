"""Export data/radar.db to one JSON file the dashboard reads (the app never touches SQLite).

    python3 -m collector.export                      # -> data/radar.json
    python3 -m collector.export path/to/out.json

Contract (keep in step with lib/radar.ts in the app):
{
  "generated_at": ISO timestamp,
  "window_days": 60,
  "sources": [{"id","name","url","what","updated"}],
  "roles": [{
     "id", "label", "ads",                       # ads matched in the window
     "weekly": [{"week": "2026-W44", "new_ads": n}],   # by publication date
     "skills": [{"skill", "count", "share"}],    # share of the role's ads with full text, 0..1, top 15
     "barriers": {"german_required": share, ...},
     "entry_level_share": share,                 # ads that say junior / career changer / trainee / internship
     "employers": [{"company", "ads"}],          # direct employers with 2+ ads for the role (question C), top 15
     "agencies": [{"company", "ads"}],           # recruiting agencies posting for the role, top 8
     "agency_share": share,                      # ads posted by agencies
     "cantons": [{"canton", "count"}],
     "reporting_obligation_share": share,         # occupations under the Swiss job-reporting duty
     "examples": [{"title","company","city","published","url"}]   # newest 8
  }],
  "sector": [{"series", "period", "value"}],     # BFS JOBSTAT, quarterly
  "policy": [{"source","title","date","status","url","matched"}]   # newest 40
}
"""
import collections
import datetime as dt
import json
import sqlite3
import sys
from pathlib import Path

from .roles import AGENCY, BARRIERS, ROLES

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "radar.db"
WINDOW = 60

SOURCES = [
    {"id": "jobroom", "name": "job-room.ch (SECO)", "url": "https://www.job-room.ch",
     "what": "Swiss job ads, public service of the State Secretariat for Economic Affairs"},
    {"id": "bfs", "name": "Federal Statistical Office (BFS), JOBSTAT", "url":
     "https://www.bfs.admin.ch/bfs/en/home/statistics/industry-services/businesses-employment/jobstat.html",
     "what": "Open positions by economic sector, quarterly"},
    {"id": "curia", "name": "Swiss Parliament (Curia Vista)", "url": "https://www.parlament.ch",
     "what": "Motions, questions and bills on asylum, status F and S, integration, skilled workers"},
    {"id": "fedlex", "name": "Fedlex", "url": "https://www.fedlex.admin.ch", "what": "New federal law"},
]


def main(out: Path):
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    since = (dt.date.today() - dt.timedelta(days=WINDOW)).isoformat()
    rows = c.execute("""SELECT title, company, city, canton, published, url, roles, skills, barriers,
                               reporting_obligation, tagged IS NOT NULL
                        FROM ads WHERE roles != '[]' AND published >= ? ORDER BY published DESC""", (since,)).fetchall()
    roles = []
    for rid, (label, _, _) in ROLES.items():
        R = [r for r in rows if rid in json.loads(r[6])]
        full = [r for r in R if r[10]] or R
        n, nf = len(R), max(len(full), 1)
        weekly = collections.Counter()
        for r in R:
            if r[4]:
                y, w, _ = dt.date.fromisoformat(r[4]).isocalendar()
                weekly[f"{y}-W{w:02d}"] += 1
        skills = collections.Counter(s for r in full for s in json.loads(r[7]))
        barriers = collections.Counter(b for r in full for b in json.loads(r[8]))
        roles.append({
            "id": rid, "label": label, "ads": n,
            "weekly": [{"week": k, "new_ads": v} for k, v in sorted(weekly.items())],
            "skills": [{"skill": k, "count": v, "share": round(v / nf, 3)} for k, v in skills.most_common(15)],
            "barriers": {k: round(barriers[k] / nf, 3) for k in BARRIERS if k != "entry_level"},
            "entry_level_share": round(barriers["entry_level"] / nf, 3),
            "employers": [{"company": k, "ads": v} for k, v in
                          collections.Counter(r[1] for r in R if r[1] and not AGENCY.search(r[1])).most_common(15)
                          if v >= 2],
            "agencies": [{"company": k, "ads": v} for k, v in
                         collections.Counter(r[1] for r in R if r[1] and AGENCY.search(r[1])).most_common(8)],
            "agency_share": round(sum(1 for r in R if r[1] and AGENCY.search(r[1])) / max(n, 1), 3),
            "cantons": [{"canton": k, "count": v} for k, v in
                        collections.Counter(r[3] for r in R if r[3]).most_common()],
            "reporting_obligation_share": round(sum(r[9] for r in R) / max(n, 1), 3),
            "examples": [{"title": r[0], "company": r[1], "city": r[2], "published": r[4], "url": r[5]} for r in R[:8]],
        })
    sector = [{"series": s, "period": p, "value": v} for s, p, v in
              c.execute("SELECT series, period, value FROM stats WHERE source='bfs_jobstat' ORDER BY period")]
    policy = [dict(zip(["source", "title", "date", "status", "url", "matched"], r)) for r in
              c.execute("SELECT source, title, date, status, url, matched FROM policy ORDER BY date DESC LIMIT 40")]
    last = c.execute("SELECT max(last_seen) FROM ads").fetchone()[0]
    for s in SOURCES:
        s["updated"] = last
    doc = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "window_days": WINDOW,
           "sources": SOURCES, "roles": roles, "sector": sector, "policy": policy}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB): " + ", ".join(f"{r['id']} {r['ads']}" for r in roles))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "radar.json")
