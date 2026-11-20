"""type "odata_search": keyword search on an OData service (built for Curia Vista, the parliament's business database).

Params:
  base       the OData collection, e.g. https://ws.parlament.ch/odata.svc/Business
  filter     OData $filter with {kw} where each keyword goes, e.g. "Language eq 'DE' and substringof('{kw}',Title)"
  keywords   list of search words (one request each)
  fields     which OData field holds: id, title, date, status
  link       address of one item, {id} is replaced
  orderby / top   optional (default: newest first, 40 per keyword)
  source_label    how the dashboard names this source in the policy list
Hits land in the policy table (id prefix = source id, so the same item is never stored twice).
"""
import datetime as dt
import json
import re
import urllib.parse

from .. import net

REQUIRED = ["base", "filter", "keywords", "fields", "link", "source_label"]


def odata_date(v):
    """'/Date(1699660800000)/' or '2026-11-11T00:00:00' -> '2026-11-11'."""
    if not v:
        return None
    ms = re.search(r"/Date\((-?\d+)", v)
    if ms:
        return dt.datetime.fromtimestamp(int(ms.group(1)) / 1000, dt.timezone.utc).date().isoformat()
    return v[:10]


def items_of(payload):
    d = payload["d"] if "d" in payload else payload.get("value", payload)
    return d.get("results", d) if isinstance(d, dict) else d


def run(c, entry):
    today = dt.date.today().isoformat()
    f, n = entry["fields"], 0
    for kw in entry["keywords"]:
        q = (f"$filter={entry['filter'].format(kw=kw)}&$orderby={entry.get('orderby', f['date'] + ' desc')}"
             f"&$top={entry.get('top', 40)}&$format=json")
        url = entry["base"] + "?" + urllib.parse.quote(q, safe="=&$',()")
        try:
            items = items_of(json.loads(net.fetch(url)[0]))
        except Exception as e:
            print(f"  {entry['id']} failed for '{kw}': {e}")
            continue
        for b in items:
            n += c.execute("INSERT OR IGNORE INTO policy VALUES(?,?,?,?,?,?,?,?)",
                           (f"{entry['id']}:{b[f['id']]}", entry["source_label"], b.get(f["title"]),
                            odata_date(b.get(f["date"])), b.get(f["status"]), entry["link"].format(id=b[f["id"]]),
                            kw, today)).rowcount
    c.commit()
    print(f"  {entry['id']}: {n} new items")
    return n
