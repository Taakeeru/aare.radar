"""type "rss_keywords": an RSS feed, keeping only items that mention one of your keywords (title + description).

Params:
  feed          feed address
  keywords      list of words/phrases (case-insensitive)
  source_label  how the dashboard names this source in the policy list
Hits land in the policy table.
"""
import datetime as dt
import html
import re
import xml.etree.ElementTree as ET

from .. import net

REQUIRED = ["feed", "keywords", "source_label"]


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def rssdate(s):
    try:
        return dt.datetime.strptime(s[:16], "%a, %d %b %Y").date().isoformat()
    except Exception:
        return None


def parse(xml_bytes, keywords):
    """-> [(link, title, date, matched keyword)]"""
    out = []
    for it in ET.fromstring(xml_bytes).iter("item"):
        text = (it.findtext("title") or "") + " " + (it.findtext("description") or "")
        hit = next((k for k in keywords if k.lower() in text.lower()), None)
        if hit and it.findtext("link"):
            out.append((it.findtext("link"), strip(it.findtext("title")), rssdate(it.findtext("pubDate")), hit))
    return out


def run(c, entry):
    today = dt.date.today().isoformat()
    body = net.fetch(entry["feed"], headers={"Accept": "application/xml"})[0]
    n = 0
    for link, title, date, hit in parse(body, entry["keywords"]):
        n += c.execute("INSERT OR IGNORE INTO policy VALUES(?,?,?,?,?,?,?,?)",
                       (f"{entry['id']}:{link}", entry["source_label"], title, date, None, link, hit, today)).rowcount
    c.commit()
    print(f"  {entry['id']}: {n} new items")
    return n
