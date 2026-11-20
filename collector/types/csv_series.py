"""type "csv_series": a CSV, JSON or JSON-stat file at a fixed address -> time series.

Params (common):
  data_url address of the file (put filters into it when the provider supports them, e.g. Eurostat)
  format   "csv" (default), "json" or "jsonstat"
  headers  optional request headers, e.g. {"Accept": "application/vnd.sdmx.data+csv;version=1.0.0"}
  unit     optional text shown next to the numbers; or "units": {regex on the series label: unit} when they differ
  series_prefix  optional text put in front of every series label
format "csv" and "json" (a list of records, optionally below "records_path" like "data.items"):
  period   column holding the period (2024, 2024-Q3, 2024-11 ...)
  value    column holding the number
  series   list of columns whose values name the series (joined by " / ")
  where    optional {column: regex}: keep only matching rows
  delimiter  optional, csv only (default ",")
format "jsonstat" (Eurostat, BFS, many others): series are all dimensions except time; period_dim defaults to "time".
"""
import csv
import io
import json
import re

from .. import net
from ..db import put_stat

REQUIRED = ["data_url"]


def _num(v):
    try:
        return float(str(v).replace("'", "").replace(",", ".") if v not in (None, "") else "x")
    except ValueError:
        return None


def parse_records(records, entry):
    where = {k: re.compile(v, re.I) for k, v in (entry.get("where") or {}).items()}
    out = []
    for r in records:
        if any(not rx.search(str(r.get(k, ""))) for k, rx in where.items()):
            continue
        val = _num(r.get(entry["value"]))
        if val is None:
            continue
        label = " / ".join(str(r.get(k, "")) for k in entry["series"]) or entry["name"]
        out.append((label, str(r[entry["period"]]), val))
    return out


def parse_jsonstat(doc, entry):
    """JSON-stat 2.0 dataset -> [(label, period, value)]. Missing cells are skipped."""
    ids, size = doc["id"], doc["size"]
    tdim = entry.get("period_dim", "time")
    cats = {}
    for d in ids:
        c = doc["dimension"][d]["category"]
        index = c["index"]
        order = sorted(index, key=index.get) if isinstance(index, dict) else list(index)
        cats[d] = [(code, (c.get("label") or {}).get(code, code)) for code in order]
    values = doc["value"]
    items = values.items() if isinstance(values, dict) else enumerate(values)
    out = []
    for pos, v in items:
        if v is None:
            continue
        pos, key = int(pos), {}
        for d, n in zip(reversed(ids), reversed(size)):
            key[d] = cats[d][pos % n]
            pos //= n
        varying = [d for d in ids if d != tdim and size[ids.index(d)] > 1]  # constant dimensions are not worth a label
        label = " / ".join(key[d][1] for d in varying) or entry["name"]
        out.append((label, key[tdim][0], float(v)))
    return out


def parse(body: bytes, entry):
    fmt = entry.get("format", "csv")
    if fmt == "csv":
        text = body.decode("utf-8-sig")
        return parse_records(csv.DictReader(io.StringIO(text), delimiter=entry.get("delimiter", ",")), entry)
    doc = json.loads(body)
    if fmt == "jsonstat":
        return parse_jsonstat(doc, entry)
    for part in filter(None, (entry.get("records_path") or "").split(".")):
        doc = doc[part]
    return parse_records(doc, entry)


def run(c, entry):
    body = net.fetch(entry["data_url"], headers=entry.get("headers"))[0]
    rows = parse(body, entry)
    prefix = entry.get("series_prefix")
    for label, period, val in rows:
        unit = next((u for rx, u in (entry.get("units") or {}).items() if re.search(rx, label, re.I)), entry.get("unit"))
        put_stat(c, entry["id"], f"{prefix} / {label}" if prefix else label, period, val, unit)
    c.commit()
    print(f"  {entry['id']}: {len(rows)} rows")
    return len(rows)
