"""Collect Swiss IT job ads, labour-market statistics and policy items into data/radar.db.

Run daily from a home/office IP (job-room may block datacenter IPs):
    python3 -m collector.collect            # all sources
    python3 -m collector.collect jobs       # one source
The first run backfills ~60 days of job-room ads (the API's maximum look-back).
"""
import datetime as dt
import html
import json
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from .roles import BARRIERS, IT_GUARD, ROLES, SKILLS, classify

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "radar.db"
UA = {"User-Agent": "powercoders-radar/0.1 (hackathon prototype)", "Accept": "application/json"}

POLICY_TERMS = ["vorläufig aufgenommen", "Status F", "Status S", "Schutzstatus", "Flüchtling", "Asyl",
                "Ausländer- und Integration", "Integration", "Erwerbstätigkeit", "Arbeitsbewilligung",
                "Stellenmeldepflicht", "Fachkräfte", "Arbeitsmarkt"]


def http(url, data=None, tries=3, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    h = dict(UA, **(headers or {}))
    if body:
        h["Content-Type"] = "application/json"
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers=h, method="POST" if body else "GET")
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read(), dict(r.headers)
        except Exception as e:  # network hiccups: retry, then give up loudly
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS ads(
      id TEXT PRIMARY KEY, title TEXT, company TEXT, canton TEXT, city TEXT, published TEXT, ends TEXT,
      reporting_obligation INT, occupation TEXT, workload_min INT, workload_max INT, lang TEXT, url TEXT,
      roles TEXT, skills TEXT, barriers TEXT, first_seen TEXT, last_seen TEXT);
    CREATE TABLE IF NOT EXISTS snapshots(day TEXT, role TEXT, live INT, PRIMARY KEY(day, role));
    CREATE TABLE IF NOT EXISTS stats(source TEXT, series TEXT, period TEXT, value REAL, PRIMARY KEY(source, series, period));
    CREATE TABLE IF NOT EXISTS policy(id TEXT PRIMARY KEY, source TEXT, title TEXT, date TEXT, status TEXT, url TEXT,
      matched TEXT, first_seen TEXT);
    """)
    cols = [r[1] for r in c.execute("PRAGMA table_info(ads)")]
    if "tagged" not in cols:
        c.execute("ALTER TABLE ads ADD COLUMN tagged INT")
    if "full_text" in cols:  # earlier prototype stored ad text; it may name recruiters, so it goes
        c.execute("UPDATE ads SET tagged=1 WHERE full_text IS NOT NULL")
        c.execute("ALTER TABLE ads DROP COLUMN full_text")
        c.commit()
        c.execute("VACUUM")
    return c


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


# ---------- job-room.ch (SECO) ----------
SEARCH = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search?page={p}&size=200&sort=date_desc"


def collect_jobs(c):
    today = dt.date.today().isoformat()
    seen, kept = set(), 0
    for rid, (_, keywords, _) in ROLES.items():
        for p in range(0, 25):
            raw, hdr = http(SEARCH.format(p=p), {"keywords": keywords, "onlineSince": 60})
            page = json.loads(raw)
            for item in page:
                ad = item["jobAdvertisement"]
                if ad["id"] in seen:
                    continue
                seen.add(ad["id"])
                kept += store_ad(c, ad, today)
            total = int(hdr.get("x-total-count") or hdr.get("X-Total-Count") or 0)
            if len(page) < 200 or (p + 1) * 200 >= total:
                break
            time.sleep(0.5)
    # live count per role today = ads seen today whose publication window covers today
    for rid in list(ROLES) + ["all"]:
        like = "%" if rid == "all" else f'%"{rid}"%'
        n = c.execute("SELECT count(*) FROM ads WHERE last_seen=? AND roles LIKE ? AND roles!='[]'", (today, like)).fetchone()[0]
        c.execute("INSERT OR REPLACE INTO snapshots VALUES(?,?,?)", (today, rid, n))
    c.commit()
    print(f"jobs: {len(seen)} fetched, {kept} matched a role")
    fetch_full_text(c)


DETAIL = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/{id}"


def fetch_full_text(c, everything=False):
    """The search only returns a ~300-char snippet; skills and barriers need the whole ad.
    The text is read, tagged and DROPPED: only the derived tags are stored. Job ads name recruiters (names, mails,
    phones) and the challenge rules allow aggregate data only. `everything` re-reads all matched ads (retag)."""
    where = "roles!='[]'" + ("" if everything else " AND tagged IS NULL")
    todo = c.execute(f"SELECT id, title FROM ads WHERE {where}").fetchall()
    for i, (aid, title) in enumerate(todo):
        try:
            d = json.loads(http(DETAIL.format(id=aid))[0])
        except Exception as e:
            print("detail failed", aid, e)
            continue
        desc = strip((d["jobContent"].get("jobDescriptions") or [{}])[0].get("description"))
        text = f"{title} {desc}".lower()
        c.execute("UPDATE ads SET tagged=1, skills=?, barriers=? WHERE id=?",
                  (json.dumps([k for k, rx in SKILLS.items() if rx.search(text)]),
                   json.dumps([k for k, rx in BARRIERS.items() if rx.search(text)]), aid))
        if i % 50 == 0:
            c.commit()
            print(f"  full text {i}/{len(todo)}")
        time.sleep(0.3)
    c.commit()


def store_ad(c, ad, today):
    jc = ad["jobContent"]
    d = (jc.get("jobDescriptions") or [{}])[0]
    title, desc = strip(d.get("title")), strip(d.get("description"))
    roles = classify(title) if IT_GUARD.search(title) else []
    text = f"{title} {desc}".lower()
    skills = [k for k, rx in SKILLS.items() if rx.search(text)]
    barriers = [k for k, rx in BARRIERS.items() if rx.search(text)]
    loc, emp, pub = jc.get("location") or {}, jc.get("employment") or {}, ad.get("publication") or {}
    occ = (jc.get("occupations") or [{}])[0].get("avamOccupationCode")
    url = jc.get("externalUrl") or f"https://www.job-room.ch/job-search/{ad['id']}"
    if url and not url.startswith("http"):
        url = "https://" + url
    # skills/barriers from the snippet are only a placeholder until fetch_full_text fills the whole ad
    c.execute("""INSERT INTO ads(id, title, company, canton, city, published, ends, reporting_obligation, occupation,
        workload_min, workload_max, lang, url, roles, skills, barriers, first_seen, last_seen)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, roles=excluded.roles, ends=excluded.ends""",
              (ad["id"], title, (jc.get("company") or {}).get("name"), loc.get("cantonCode"), loc.get("city"),
               pub.get("startDate"), pub.get("endDate"), int(bool(ad.get("reportingObligation"))), occ,
               _int(emp.get("workloadPercentageMin")), _int(emp.get("workloadPercentageMax")),
               d.get("languageIsoCode"), url, json.dumps(roles), json.dumps(skills), json.dumps(barriers), today, today))
    return 1 if roles else 0


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ---------- BFS JOBSTAT: open positions, IT services (NOGA 62-63), quarterly since 1992 ----------
BFS = "https://www.pxweb.bfs.admin.ch/api/v1/en/px-x-0602000000_103/px-x-0602000000_103.px"


def collect_bfs(c):
    meta = json.loads(http(BFS)[0])
    query, picked = [], {}
    for v in meta["variables"]:
        codes, texts = v["values"], v["valueTexts"]
        if v.get("time") or re.search(r"quarter|year|time", v["text"], re.I):
            sel = codes[-24:]  # last 6 years
        elif re.search(r"divis|noga|economic", v["text"], re.I):
            sel = [cd for cd, t in zip(codes, texts) if re.search(r"62|63|information service|computer programming", t, re.I)][:2] or codes[:1]
        else:
            sel = [cd for cd, t in zip(codes, texts) if re.search(r"open position|vacanc|offene", t, re.I)][:1] or codes[:1]
        picked[v["code"]] = (sel, dict(zip(codes, texts)))
        query.append({"code": v["code"], "selection": {"filter": "item", "values": sel}})
    data = json.loads(http(BFS, {"query": query, "response": {"format": "json"}})[0])
    cols = [x["code"] for x in data["columns"]]
    for row in data["data"]:
        key = dict(zip([x for x in cols if x in picked], row["key"]))
        period = next((k for k in row["key"] if re.match(r"^\d{4}", k)), row["key"][-1])
        series = " / ".join(picked[k][1].get(v, v) for k, v in key.items() if not re.match(r"^\d{4}", v))
        try:
            val = float(row["values"][0])
        except ValueError:
            continue
        c.execute("INSERT OR REPLACE INTO stats VALUES('bfs_jobstat',?,?,?)", (series, period, val))
    c.commit()
    print(f"bfs: {len(data['data'])} rows")


# ---------- Policy: Curia Vista (parliament) + Fedlex RSS (federal law) ----------
def collect_policy(c):
    today = dt.date.today().isoformat()
    n = 0
    for term in ["vorläufig", "Asyl", "Status S", "Ausländer", "Integration", "Fachkräfte", "Stellenmeldepflicht"]:
        q = (f"$filter=Language eq 'DE' and substringof('{term}',Title)"
             f"&$orderby=SubmissionDate desc&$top=40&$format=json")
        url = "https://ws.parlament.ch/odata.svc/Business?" + urllib.parse.quote(q, safe="=&$',()")
        try:
            items = json.loads(http(url)[0])["d"]
        except Exception as e:
            print("curia vista failed for", term, e)
            continue
        items = items.get("results", items) if isinstance(items, dict) else items
        for b in items:
            ms = re.search(r"\d+", b.get("SubmissionDate") or "")
            date = dt.datetime.fromtimestamp(int(ms.group()) / 1000, dt.timezone.utc).date().isoformat() if ms else None
            bid = f"curia:{b['ID']}"
            link = f"https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista/geschaeft?AffairId={b['ID']}"
            n += c.execute("INSERT OR IGNORE INTO policy VALUES(?,?,?,?,?,?,?,?)",
                           (bid, "Parliament (Curia Vista)", b.get("Title"), date, b.get("BusinessStatusText"),
                            link, term, today)).rowcount
    try:
        root = ET.fromstring(http("https://fedlex.data.admin.ch/api/rss-de.xml", headers={"Accept": "application/xml"})[0])
        for it in root.iter("item"):
            title = (it.findtext("title") or "") + " " + (it.findtext("description") or "")
            hit = next((t for t in POLICY_TERMS if t.lower() in title.lower()), None)
            if not hit:
                continue
            link = it.findtext("link")
            n += c.execute("INSERT OR IGNORE INTO policy VALUES(?,?,?,?,?,?,?,?)",
                           (f"fedlex:{link}", "Federal law (Fedlex)", strip(it.findtext("title")),
                            _rssdate(it.findtext("pubDate")), None, link, hit, today)).rowcount
    except Exception as e:
        print("fedlex failed", e)
    c.commit()
    print(f"policy: {n} new items")


def _rssdate(s):
    try:
        return dt.datetime.strptime(s[:16], "%a, %d %b %Y").date().isoformat()
    except Exception:
        return None


def retag(c):
    """After a change in roles.py: re-match roles from stored titles, then re-read every matched ad's text
    (network, ~5 min; the text itself is never stored)."""
    for aid, title in c.execute("SELECT id, title FROM ads").fetchall():
        c.execute("UPDATE ads SET roles=? WHERE id=?",
                  (json.dumps(classify(title) if IT_GUARD.search(title) else []), aid))
    c.commit()
    fetch_full_text(c, everything=True)
    print("retag: done")


if __name__ == "__main__":
    con = db()
    want = set(sys.argv[1:]) or {"jobs", "bfs", "policy"}
    if "retag" in want:
        retag(con)
    for name, fn in [("jobs", collect_jobs), ("bfs", collect_bfs), ("policy", collect_policy)]:
        if name in want:
            try:
                fn(con)
            except Exception as e:
                print(f"{name} FAILED: {e!r}")
