"""Export data/radar.db to one JSON file the dashboard reads (the app never touches SQLite).

    python3 -m collector.export                      # -> data/radar.json
    python3 -m collector.export path/to/out.json

Contract (keep in step with lib/radar.ts in the app):
{
  "generated_at": ISO timestamp,
  "window_days": 60,
  "questions": {"A": "Demand", "B": "Skills", "C": "Employers", "D": "Target group", "E": "Policy watch"},   # NEW
  "sources": [{"id","name","url","what","updated",
               "questions": ["A"], "type", "schedule", "status",  # NEW: from sources.json; status = ok | error | never
               "latest_period"}],                                  # NEW: newest period of its numbers, null for ads/links
  "roles": [{
     "id", "label", "ads",                       # ads matched in the window
     "weekly": [{"week": "2026-W44", "new_ads": n}],   # by publication date
     "skills": [{"skill", "count", "share",     # share of the role's ads with full text, 0..1, top 15
                 "esco_uri", "esco_label", "esco_match"}],   # NEW, only when ESCO has a concept ("exact" | "broader")
     "barriers": {"german_required": share, ...},
     "entry_level_share": share,                 # ads that say junior / career changer / trainee / internship
     "employers": [{"company", "ads"}],          # direct employers with 2+ ads for the role (question C), top 15
     "agencies": [{"company", "ads"}],           # recruiting agencies posting for the role, top 8
     "agency_share": share,                      # ads posted by agencies
     "cantons": [{"canton", "count"}],
     "reporting_obligation_share": share,         # occupations under the Swiss job-reporting duty
     "examples": [{"title","company","city","published","url"}]   # newest 8
  }],
  "it_market": {                                # NEW 21.11.: EVERY IT ad (job-room occupation codes, collector/it_occupations.json)
     "ads", "read_in_full", "entry_ads", "entry_level_share", "reporting_obligation_share",   # entry: text OR experience field
     "weekly": [{"week", "new_ads"}],
     "groups": [{"group", "label_en", "label_de", "ads"}],              # CH-ISCO 250/251/252/351/352
     "occupations": [{"code", "label_en", "label_de", "group", "ads", "entry_ads", "entry_level_share"}],   # all with 1+ ad, most first
     "cantons": [{"canton", "count"}]
  },
  "sector": [{"series", "period", "value"}],     # BFS JOBSTAT, quarterly (the source flagged "sector" in sources.json)
  "series": {                                    # NEW: every numeric source, grouped by question letter
     "D": [{"source": id, "name", "url", "updated",
            "series": [{"label", "unit", "dimension", "points": [{"period", "value"}]}]}]
  },                                             # unit: persons | share (0..1) | % | positions; dimension: Canton ...
  "policy": [{"source","title","date","status","url","matched"}]   # newest 40
}
"""
import collections
import datetime as dt
import json
import sqlite3
import sys
from pathlib import Path

from . import config
from .roles import AGENCY, BARRIERS, ROLES

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "radar.db"
ESCO = Path(__file__).resolve().parent / "esco_skills.json"
WINDOW = 60
MAX_SERIES = 60   # per source and dimension; override with "export_max_series" in the source entry



def _latest(v):
    return v if v is not None else -1e18


def build_series(c, entries):
    """stats rows of every source -> {question: [source block]} (sources can appear under several questions)."""
    by_q = collections.defaultdict(list)
    runs = {r[0]: r for r in c.execute("SELECT source, last_ok FROM source_runs")}
    for e in entries:
        rows = c.execute("SELECT series, period, value, unit, dim FROM stats WHERE source=? ORDER BY period",
                         (e["id"],)).fetchall()
        if not rows:
            continue
        grouped = collections.OrderedDict()
        for label, period, value, unit, dim in rows:
            g = grouped.setdefault((label, dim), {"label": label, "unit": unit, "dimension": dim, "points": []})
            g["points"].append({"period": period, "value": value})
        per_dim = collections.defaultdict(list)
        for g in grouped.values():
            per_dim[g["dimension"]].append(g)
        cap = int(e.get("export_max_series", MAX_SERIES))
        series = []
        for dim, gs in per_dim.items():
            gs.sort(key=lambda g: (-_latest(g["points"][-1]["value"]), g["label"]))
            series += gs[:cap]
        block = {"source": e["id"], "name": e["name"], "url": e["url"],
                 "updated": runs.get(e["id"], (None, None))[1], "series": series}
        for q in e["questions"]:
            by_q[q].append(block)
    return dict(sorted(by_q.items()))


def main(out: Path, db=None, entries=None, esco_path=None):
    c = sqlite3.connect(f"file:{db or DB}?mode=ro", uri=True)
    entries = entries if entries is not None else config.load()
    esco = json.loads(Path(esco_path or ESCO).read_text()) if Path(esco_path or ESCO).exists() else {}
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
            "skills": [dict({"skill": k, "count": v, "share": round(v / nf, 3)}, **_esco(esco, k))
                       for k, v in skills.most_common(15)],
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
    it_market = build_it_market(c, since)
    sector_id = next((e["id"] for e in entries if e.get("sector")), "bfs")
    sector = [{"series": s, "period": p, "value": v} for s, p, v in
              c.execute("SELECT series, period, value FROM stats WHERE source=? ORDER BY period", (sector_id,))]
    policy = [dict(zip(["source", "title", "date", "status", "url", "matched"], r)) for r in
              c.execute("SELECT source, title, date, status, url, matched FROM policy ORDER BY date DESC LIMIT 40")]
    last_ad = c.execute("SELECT max(last_seen) FROM ads").fetchone()[0]
    runs = {r[0]: r for r in c.execute("SELECT source, last_ok, status FROM source_runs")}
    sources = []
    for e in entries:
        run = runs.get(e["id"])
        latest = c.execute("SELECT max(period) FROM stats WHERE source=?", (e["id"],)).fetchone()[0]
        updated = run[1] if run else None
        if updated is None and e["type"] == "jobroom_search":
            updated = last_ad
        sources.append({"id": e["id"], "name": e["name"], "url": e["url"], "what": e["what"], "updated": updated,
                        "questions": e["questions"], "type": e["type"], "schedule": e["schedule"],
                        "status": ("reference" if e["type"] == "link" else run[2] if run else "never"),
                        "latest_period": latest})
    doc = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "window_days": WINDOW,
           "questions": config.QUESTIONS, "sources": sources, "roles": roles, "it_market": it_market, "sector": sector, "policy": policy,
           "series": build_series(c, entries)}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB): " + ", ".join(f"{r['id']} {r['ads']}" for r in roles))
    return doc


ENTRY_EXPERIENCE = {"NO_EXPERIENCE", "LESS_THAN_1_YEAR"}


def build_it_market(c, since):
    """Every ad whose job-room occupation code is an IT occupation (collector/it_occupations.json), in the window."""
    from .types.jobroom_search import it_occupations
    it = it_occupations()
    occ, groups = it["occupations"], it["groups"]
    marks = ",".join("?" * len(occ)) or "''"
    cols = {r[1] for r in c.execute("PRAGMA table_info(ads)")}
    exp_col = "experience" if "experience" in cols else "NULL"
    rows = c.execute(f"""SELECT occupation, published, canton, barriers, reporting_obligation, tagged, {exp_col} FROM ads
                         WHERE occupation IN ({marks}) AND published >= ?""", (*occ, since)).fetchall()
    n = len(rows)
    weekly = collections.Counter()
    for r in rows:
        if r[1]:
            y, w, _ = dt.date.fromisoformat(r[1][:10]).isocalendar()
            weekly[f"{y}-W{w:02d}"] += 1
    by_occ = collections.defaultdict(list)
    for r in rows:
        by_occ[r[0]].append(r)
    # Entry level: the ad's full text speaks to beginners (junior, trainee, career changer, internship ...) OR the
    # employer set job-room's experience field to none / under a year.
    is_entry = lambda r: "entry_level" in json.loads(r[3] or "[]") or r[6] in ENTRY_EXPERIENCE  # noqa: E731
    entry_n = lambda R: sum(1 for r in R if is_entry(r))  # noqa: E731
    entry = lambda R: round(entry_n(R) / max(len(R), 1), 3)  # noqa: E731
    by_group = collections.Counter(occ[r[0]]["group"] for r in rows)
    return {
        "ads": n,
        "read_in_full": sum(1 for r in rows if r[5]),
        "entry_ads": entry_n(rows),
        "entry_level_share": entry(rows),
        "reporting_obligation_share": round(sum(r[4] or 0 for r in rows) / max(n, 1), 3),
        "weekly": [{"week": k, "new_ads": v} for k, v in sorted(weekly.items())],
        "groups": [{"group": g, "label_en": groups[g]["en"], "label_de": groups[g]["de"], "ads": by_group[g]}
                   for g in sorted(groups, key=lambda g: -by_group[g]) if by_group[g]],
        "occupations": [{"code": k, "label_en": occ[k]["en"], "label_de": occ[k]["de"], "group": occ[k]["group"],
                         "ads": len(R), "entry_ads": entry_n(R), "entry_level_share": entry(R)}
                        for k, R in sorted(by_occ.items(), key=lambda kv: -len(kv[1]))],
        "cantons": [{"canton": k, "count": v} for k, v in collections.Counter(r[2] for r in rows if r[2]).most_common()],
    }


def _esco(esco, skill):
    m = esco.get(skill)
    return {"esco_uri": m["uri"], "esco_label": m["label"], "esco_match": m["match"]} if m else {}


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "radar.json")
