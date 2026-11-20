"""type "xlsx_series": numbers out of an Excel file (SEM asylum/foreigner statistics, BFS tables).

Where the file comes from (one of):
  file_url   a fixed address of the .xlsx
  page       a web page that links to the file. The file is the link whose text matches "file_link" (a regex).
             If "page" contains {year}, {month} (01..12) or {month_de} (januar..dezember), it is an edition page
             (SEM publishes one page per month, with new file addresses each time): the newest "editions" months
             are read, newest first, and months already in the database are skipped.
  file_link  regex on the link text, e.g. "^6-22:"
  period_from  for a single "page"/"file_url" without {month}: regex with 2 groups (year, month) applied to the file
             address, e.g. "(\\d{4})-(\\d{2})-d\\.xlsx"
Which cells:
  sheets     list of {"name": "CH-Kt", "dimension": "Kanton"} (dimension = what the rows are, shown in the dashboard).
             Instead of "name": {"name_regex": "^\\d{4}$", "last": 3} takes the last 3 sheets and uses the sheet
             name as the period (BFS publishes one sheet per year).
  label_column  column with the row names (default "A")
  first_row  first data row (default 1); rows without a name or without any number are ignored
  header_row optional: row whose cell text names a column when the spec below gives no name
  columns    {"B": {"name": "Total persons", "unit": "persons"}, "E": "Employment rate"}  (a plain text = name only);
             {"B": null} takes the name from header_row
  label_map  optional {"Total": "Switzerland"} to rename rows
  skip_known false to re-read months that are already in the database
"""
import datetime as dt
import html
import re
import urllib.error
import urllib.parse

from .. import net, xlsx
from ..db import has_period, put_stat

REQUIRED = ["sheets", "columns"]
MONTHS_DE = ["januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober",
             "november", "dezember"]


def find_link(page_html: str, link_regex: str, base: str):
    """Address of the .xlsx whose link text matches link_regex, else None."""
    rx = re.compile(link_regex)
    for m in re.finditer(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', page_html, re.S):
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        if ".xlsx" in m.group(1).lower() and rx.search(text):
            return urllib.parse.urljoin(base, html.unescape(m.group(1)))
    return None


def months_back(today, n):
    y, m = today.year, today.month
    for _ in range(n):
        yield y, m
        m -= 1
        if m == 0:
            y, m = y - 1, 12


def editions(c, entry, today=None):
    """-> iterator of (period or None, xlsx address)."""
    if entry.get("file_url"):
        yield None, entry["file_url"]
        return
    page = entry["page"]
    if "{" not in page:
        body = net.fetch_cached(page, headers={"Accept": "text/html"})[0].decode("utf-8", "replace")
        url = find_link(body, entry["file_link"], page)
        if url:
            m = re.search(entry.get("period_from", r"(\d{4})-(\d{2})"), url)
            yield (f"{m.group(1)}-{m.group(2)}" if m else None), url
        return
    wanted, found = int(entry.get("editions", 1)), 0
    for y, mo in months_back(today or dt.date.today(), wanted + 2):  # +2: the newest month is usually not out yet
        if found >= wanted:
            return
        period = f"{y}-{mo:02d}"
        if entry.get("skip_known", True) and has_period(c, entry["id"], period):
            found += 1
            continue
        url_page = page.format(year=y, month=f"{mo:02d}", month_de=MONTHS_DE[mo - 1])
        try:
            body = net.fetch_cached(url_page, headers={"Accept": "text/html"})[0].decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue  # edition not published (yet)
            raise
        url = find_link(body, entry["file_link"], url_page)
        if url:
            found += 1
            yield period, url
        else:
            print(f"  {entry['id']}: no link matching /{entry['file_link']}/ on {url_page}")


def _spec(spec):
    if isinstance(spec, dict):
        return spec.get("name"), spec.get("unit")
    return spec, None


def parse(workbook, entry, period):
    """-> [(series, period, value, unit, dimension)] for one workbook."""
    out = []
    label_col = entry.get("label_column", "A")
    first = int(entry.get("first_row", 1))
    rename = entry.get("label_map", {})
    for sh in entry["sheets"]:
        if "name_regex" in sh:
            names = [n for n in workbook if re.search(sh["name_regex"], n)][: int(sh.get("last", 1))]
        else:
            names = [sh["name"]] if sh["name"] in workbook else []
        for name in names:
            rows = workbook[name]
            per = name if "name_regex" in sh else period
            header = rows.get(int(entry["header_row"]), {}) if entry.get("header_row") else {}
            for r in sorted(rows):
                if r < first:
                    continue
                cells = rows[r]
                label = re.sub(r"\s+", " ", cells.get(label_col, "")).strip()
                if not label:
                    continue
                label = rename.get(label, label)
                for col, spec in entry["columns"].items():
                    cname, unit = _spec(spec)
                    cname = cname or re.sub(r"\s+", " ", header.get(col, col)).strip()
                    v = xlsx.number(cells.get(col))
                    if v is not None:
                        out.append((f"{cname} / {label}", per, v, unit or entry.get("unit"), sh.get("dimension")))
    return out


def run(c, entry):
    n = 0
    for period, url in editions(c, entry):
        try:
            wb = xlsx.read(net.fetch(url, headers={"Accept": "*/*"})[0])
        except Exception as e:
            print(f"  {entry['id']} {period or ''}: {e}")
            continue
        rows = parse(wb, entry, period)
        for series, per, v, unit, dim in rows:
            put_stat(c, entry["id"], series, per, v, unit, dim)
        c.commit()
        n += len(rows)
        print(f"  {entry['id']} {period or ''}: {len(rows)} rows")
    return n
