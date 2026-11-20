"""type "jobroom_search": Swiss job ads from job-room.ch (SECO), classified into the roles of roles.py.

Run from a home/office IP only, never from a server (job-room may block datacenter IPs and the terms are for
normal use). Params: online_since_days (max 60, the API limit), page_size, max_pages.
The first run backfills ~60 days; the search only returns a snippet, so full ad text is read once to tag skills and
barriers and is then dropped (aggregate data only, no recruiter names or contact data are stored).
"""
import datetime as dt
import html
import json
import re

from .. import net
from ..roles import BARRIERS, IT_GUARD, ROLES, SKILLS, classify

REQUIRED = []
SEARCH = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search?page={p}&size={size}&sort=date_desc"
DETAIL = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/{id}"


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def run(c, entry):
    today = dt.date.today().isoformat()
    size = int(entry.get("page_size", 200))
    since = int(entry.get("online_since_days", 60))
    seen, kept = set(), 0
    for rid, (_, keywords, _) in ROLES.items():
        for p in range(0, int(entry.get("max_pages", 25))):
            raw, hdr = net.fetch(SEARCH.format(p=p, size=size), {"keywords": keywords, "onlineSince": since})
            page = json.loads(raw)
            for item in page:
                ad = item["jobAdvertisement"]
                if ad["id"] in seen:
                    continue
                seen.add(ad["id"])
                kept += store_ad(c, ad, today)
            total = int(hdr.get("x-total-count") or hdr.get("X-Total-Count") or 0)
            if len(page) < size or (p + 1) * size >= total:
                break
    # live count per role today = ads seen today whose publication window covers today
    for rid in list(ROLES) + ["all"]:
        like = "%" if rid == "all" else f'%"{rid}"%'
        n = c.execute("SELECT count(*) FROM ads WHERE last_seen=? AND roles LIKE ? AND roles!='[]'", (today, like)).fetchone()[0]
        c.execute("INSERT OR REPLACE INTO snapshots VALUES(?,?,?)", (today, rid, n))
    c.commit()
    print(f"  jobroom: {len(seen)} fetched, {kept} matched a role")
    fetch_full_text(c)
    return len(seen)


def fetch_full_text(c, everything=False):
    """The text is read, tagged and DROPPED: only the derived tags are stored. Job ads name recruiters (names, mails,
    phones) and the challenge rules allow aggregate data only. `everything` re-reads all matched ads (retag)."""
    where = "roles!='[]'" + ("" if everything else " AND tagged IS NULL")
    todo = c.execute(f"SELECT id, title FROM ads WHERE {where}").fetchall()
    for i, (aid, title) in enumerate(todo):
        try:
            d = json.loads(net.fetch(DETAIL.format(id=aid))[0])
        except Exception as e:
            print("  detail failed", aid, e)
            continue
        desc = strip((d["jobContent"].get("jobDescriptions") or [{}])[0].get("description"))
        text = f"{title} {desc}".lower()
        c.execute("UPDATE ads SET tagged=1, skills=?, barriers=? WHERE id=?",
                  (json.dumps([k for k, rx in SKILLS.items() if rx.search(text)]),
                   json.dumps([k for k, rx in BARRIERS.items() if rx.search(text)]), aid))
        if i % 50 == 0:
            c.commit()
            print(f"  full text {i}/{len(todo)}")
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


def retag(c):
    """After a change in roles.py: re-match roles from stored titles, then re-read every matched ad's text
    (network, ~5 min; the text itself is never stored)."""
    for aid, title in c.execute("SELECT id, title FROM ads").fetchall():
        c.execute("UPDATE ads SET roles=? WHERE id=?",
                  (json.dumps(classify(title) if IT_GUARD.search(title) else []), aid))
    c.commit()
    fetch_full_text(c, everything=True)
    print("retag: done")
