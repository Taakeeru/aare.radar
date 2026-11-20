"""type "pxweb": any PxWeb table (BFS and many cantonal/federal statistics offices use PxWeb).

Params:
  table   the API address of the table, ends in .px  (BFS: https://www.pxweb.bfs.admin.ch/api/v1/en/<id>/<id>.px)
  select  list of rules, one per variable you care about. A rule has
            "variable"  a regex matched (case-insensitive) against the variable's name or code
            "values"    optional regex matched against the value names/codes; matching values are selected
            "limit"     optional: keep at most this many matches
            "last"      optional: keep only the last N values (for time variables: the latest N periods)
          Variables without a rule: left out if the table allows it (total), else the first value.
  unit    optional text shown next to the numbers ("persons", "%", ...)
  timeout optional: seconds to wait for the data answer (default 60). Some BFS tables take about two minutes to answer.
  label_skip  optional regex: variables whose name matches are not repeated in the series label
The series label is the chosen value names joined by " / ". The period is the time variable's code (2024, 2024Q3).
"""
import json
import re

from .. import net
from ..db import put_stat

REQUIRED = ["table", "select"]
TIME_WORDS = re.compile(r"quarter|year|time|month|period|jahr|quartal|monat", re.I)


def build_query(meta, rules):
    """-> (query list, info per variable) from the table metadata and the config rules."""
    query, info = [], {}
    for v in meta["variables"]:
        codes, texts = v["values"], v["valueTexts"]
        rule = next((r for r in rules if re.search(r["variable"], v["text"], re.I) or re.search(r["variable"], v["code"], re.I)), None)
        is_time = bool(v.get("time")) or bool(TIME_WORDS.search(v["text"]))
        if rule is None:
            if v.get("elimination"):
                continue  # not selected -> the API returns the total
            sel = codes[-40:] if is_time else codes[:1]
        else:
            pairs = list(zip(codes, texts))
            if rule.get("values"):
                pairs = [(cd, t) for cd, t in pairs if re.search(rule["values"], t, re.I) or re.search(rule["values"], cd, re.I)]
                if not pairs:
                    raise ValueError(f"no value of '{v['text']}' matches /{rule['values']}/")
            if rule.get("limit"):
                pairs = pairs[: int(rule["limit"])]
            if rule.get("last"):
                pairs = pairs[-int(rule["last"]):]
            sel = [cd for cd, _ in pairs]
        query.append({"code": v["code"], "selection": {"filter": "item", "values": sel}})
        info[v["code"]] = {"time": is_time, "text": v["text"], "names": dict(zip(codes, texts))}
    return query, info


def parse(data, info, entry):
    """-> [(series label, period, value)] from a PxWeb json response."""
    codes = [x["code"] for x in data["columns"] if x["type"] != "c"] if "type" in data["columns"][0] else list(info)
    codes = [c for c in codes if c in info]
    skip = re.compile(entry["label_skip"], re.I) if entry.get("label_skip") else None
    rows = []
    for row in data["data"]:
        key = dict(zip(codes, row["key"]))
        period = next((key[c] for c in codes if info[c]["time"]), row["key"][-1])
        label = " / ".join(info[c]["names"].get(k, k) for c, k in key.items()
                           if not info[c]["time"] and not (skip and skip.search(info[c]["text"])))
        try:
            val = float(row["values"][0])
        except (ValueError, TypeError):
            continue  # "..", "." = no value
        rows.append((label or entry["name"], period, val))
    return rows


def run(c, entry):
    meta = json.loads(net.fetch(entry["table"])[0])
    query, info = build_query(meta, entry["select"])
    data = json.loads(net.fetch(entry["table"], {"query": query, "response": {"format": "json"}},
                          timeout=int(entry.get("timeout", 60)))[0])
    rows = parse(data, info, entry)
    for label, period, val in rows:
        put_stat(c, entry["id"], label, period, val, entry.get("unit"))
    c.commit()
    print(f"  {entry['id']}: {len(rows)} rows")
    return len(rows)
