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
     "monthly": [{"month": "2026-11", "new_ads": n, "partial": bool}],   # NEW: the role's ads by published month over the
                                                 # WHOLE ads table (not only the window), last 24 months, oldest first,
                                                 # empty months 0, the current month partial
     "skills": [{"skill", "count", "share",     # share of the role's ads with full text, 0..1, top 15
                 "esco_uri", "esco_label", "esco_match"}],   # NEW, only when ESCO has a concept ("exact" | "broader")
     "entry_ads": n,                             # NEW: the role's full-text ads in the window whose barriers hold "entry_level"
     "entry_skills": [{"skill", "count", "share",   # NEW: like skills, counted only over those entry-level ads, top 15,
                       "esco_uri", "esco_label", "esco_match"}],   # share = count / entry_ads; no such ads -> [] and 0
     "skills_monthly": [{"skill",                # NEW: one series for each of the role's top 8 skills, WHOLE ads table,
                         "points": [{"month": "2026-11", "count", "share", "partial"}]}],   # last 12 months, oldest first,
                                                 # empty months 0, current month partial; share = ads with the skill /
                                                 # the role's ads with skills data in that month
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
  "market": {"ads": n,                           # NEW: distinct ads of any role in the window
             "monthly": [{"month", "new_ads", "partial"}],   # all IT ads together, an ad in two roles counts once
             "roles": [{"id", "ads"}]},          # the roles by ads in the window, most first
  "digest": {"from", "to", "days", "ads", "entry_ads",   # NEW 21.11.: the two-weekly summary email (collector/digest.py v2)
             "fields": [{"group", "label_en", "label_de", "ads", "entry_ads",
                         "items": [{"title", "company", "city", "ends", "url"}]}]},
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
from .roles import AGENCY, BARRIERS, ROLES, is_entry_ad

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "radar.db"
ESCO = Path(__file__).resolve().parent / "esco_skills.json"
WINDOW = 60
MAX_MONTHS = 24   # monthly history per role and for the market
SKILL_MONTHS = 12   # skills_monthly history per role
MAX_SERIES = 60  # per source and dimension; override with "export_max_series" in the source entry



def _latest(v):
    return v if v is not None else -1e18


def monthly(dates, today, months=MAX_MONTHS):
    """Published dates (YYYY-MM-DD...) -> [{"month", "new_ads", "partial"}], oldest first, at most `months` months
    ending with the current one, months without ads in between 0. Dates after today are ignored; no ads -> []."""
    this = today.year * 12 + today.month - 1
    count = collections.Counter()
    for d in dates:
        if d and len(d) >= 7 and d[:4].isdigit() and d[5:7].isdigit():
            m = int(d[:4]) * 12 + int(d[5:7]) - 1
            if this - months < m <= this:
                count[m] += 1
    if not count:
        return []
    return [{"month": f"{m // 12}-{m % 12 + 1:02d}", "new_ads": count[m], "partial": m == this}
            for m in range(min(count), this + 1)]


def skills_monthly(ads, skills, today, months=SKILL_MONTHS):
    """ads: [(published, [skills])] of one role -> one series per skill over the last `months` months (oldest first,
    ending with the current one). share = ads with the skill / ads with skills data that month; empty months 0."""
    this = today.year * 12 + today.month - 1
    total = collections.Counter()
    have = collections.Counter()
    for d, sk in ads:
        if sk and d and len(d) >= 7 and d[:4].isdigit() and d[5:7].isdigit():
            m = int(d[:4]) * 12 + int(d[5:7]) - 1
            if this - months < m <= this:
                total[m] += 1
                for s in set(sk):
                    have[(s, m)] += 1
    return [{"skill": s, "points": [
        {"month": f"{m // 12}-{m % 12 + 1:02d}", "count": have[(s, m)],
         "share": round(have[(s, m)] / total[m], 3) if total[m] else 0, "partial": m == this}
        for m in range(this - months + 1, this + 1)]} for s in skills]


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


def main(out: Path, db=None, entries=None, esco_path=None, today=None):
    c = sqlite3.connect(f"file:{db or DB}?mode=ro", uri=True)
    entries = entries if entries is not None else config.load()
    esco = json.loads(Path(esco_path or ESCO).read_text()) if Path(esco_path or ESCO).exists() else {}
    today = today or dt.date.today()
    since = (today - dt.timedelta(days=WINDOW)).isoformat()
    rows = c.execute("""SELECT title, company, city, canton, published, url, roles, skills, barriers,
                               reporting_obligation, tagged IS NOT NULL
                        FROM ads WHERE roles != '[]' AND published >= ? ORDER BY published DESC""", (since,)).fetchall()
    history = c.execute("SELECT published, roles, skills FROM ads WHERE roles != '[]' AND published IS NOT NULL").fetchall()
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
        entry = [r for r in R if r[10] and "entry_level" in json.loads(r[8])]
        entry_skills = collections.Counter(s for r in entry for s in json.loads(r[7]))
        top = [dict({"skill": k, "count": v, "share": round(v / nf, 3)}, **_esco(esco, k))
               for k, v in skills.most_common(15)]
        roles.append({
            "id": rid, "label": label, "ads": n,
            "weekly": [{"week": k, "new_ads": v} for k, v in sorted(weekly.items())],
            "monthly": monthly([h[0] for h in history if rid in json.loads(h[1])], today),
            "skills": top,
            "entry_ads": len(entry),
            "entry_skills": [dict({"skill": k, "count": v, "share": round(v / len(entry), 3)}, **_esco(esco, k))
                             for k, v in entry_skills.most_common(15)],
            "skills_monthly": skills_monthly([(h[0], json.loads(h[2])) for h in history if rid in json.loads(h[1])],
                                             [s["skill"] for s in top[:8]], today),
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
    from .digest import build_digest_v2
    digest = build_digest_v2(c, dt.date.today())
    market = {"ads": len(rows), "monthly": monthly([h[0] for h in history], today),
              "roles": sorted(({"id": r["id"], "ads": r["ads"]} for r in roles), key=lambda r: -r["ads"])}
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
           "questions": config.QUESTIONS, "sources": sources, "roles": roles, "market": market, "it_market": it_market, "digest": digest,
           "sector": sector, "policy": policy,
           "series": build_series(c, entries)}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB): " + ", ".join(f"{r['id']} {r['ads']}" for r in roles))
    return doc


def build_it_market(c, since):
    """Every ad whose job-room occupation code is an IT occupation (collector/it_occupations.json), in the window."""
    from .types.jobroom_search import it_occupations
    it = it_occupations()
    occ, groups = it["occupations"], it["groups"]
    marks = ",".join("?" * len(occ)) or "''"
    cols = {r[1] for r in c.execute("PRAGMA table_info(ads)")}
    exp_col = "experience" if "experience" in cols else "NULL"
    rows = c.execute(f"""SELECT occupation, published, canton, barriers, reporting_obligation, tagged, {exp_col}, title,
                                company, skills FROM ads
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
    is_entry = lambda r: is_entry_ad(r[7], json.loads(r[3] or "[]"), r[6])  # noqa: E731
    entry_n = lambda R: sum(1 for r in R if is_entry(r))  # noqa: E731
    entry = lambda R: round(entry_n(R) / max(len(R), 1), 3)  # noqa: E731
    by_group = collections.Counter(occ[r[0]]["group"] for r in rows)

    def weeks(R):
        w = collections.Counter()
        for r in R:
            if r[1]:
                y, k, _ = dt.date.fromisoformat(r[1][:10]).isocalendar()
                w[f"{y}-W{k:02d}"] += 1
        return [{"week": k, "new_ads": v} for k, v in sorted(w.items())]

    def skills(R, top=10):
        full = [r for r in R if r[5]]
        cnt = collections.Counter(s for r in full for s in json.loads(r[9] or "[]"))
        return [{"skill": k, "count": v, "share": round(v / max(len(full), 1), 3)} for k, v in cnt.most_common(top)], len(full)

    def employers(R, top=8):
        cnt = collections.Counter(r[8] for r in R if r[8] and not AGENCY.search(r[8]))
        return [{"company": k, "ads": v} for k, v in cnt.most_common(top)]

    def detail(R):
        sk, nf = skills(R)
        return {"weekly": weeks(R), "skills": sk, "skills_basis": nf, "employers": employers(R),
                "entry_employers": employers([r for r in R if is_entry(r)], 6)}
    return {
        "ads": n,
        "read_in_full": sum(1 for r in rows if r[5]),
        "entry_ads": entry_n(rows),
        "entry_level_share": entry(rows),
        "reporting_obligation_share": round(sum(r[4] or 0 for r in rows) / max(n, 1), 3),
        **detail(rows),
        "groups": [{"group": g, "label_en": groups[g]["en"], "label_de": groups[g]["de"], "ads": by_group[g]}
                   for g in sorted(groups, key=lambda g: -by_group[g]) if by_group[g]],
        "occupations": [{"code": k, "label_en": occ[k]["en"], "label_de": occ[k]["de"], "group": occ[k]["group"],
                         "ads": len(R), "entry_ads": entry_n(R), "entry_level_share": entry(R), **detail(R)}
                        for k, R in sorted(by_occ.items(), key=lambda kv: -len(kv[1]))],
        "cantons": [{"canton": k, "count": v} for k, v in collections.Counter(r[2] for r in rows if r[2]).most_common()],
    }


def _esco(esco, skill):
    m = esco.get(skill)
    return {"esco_uri": m["uri"], "esco_label": m["label"], "esco_match": m["match"]} if m else {}


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "radar.json")
