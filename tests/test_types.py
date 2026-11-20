"""Each source type against a tiny saved fixture. No network: net.fetch is replaced."""
import datetime as dt
import json
import unittest
from pathlib import Path
from unittest import mock

from collector import db, net, xlsx
from collector.types import csv_series, jobroom_search, link, odata_search, pxweb, rss_keywords, xlsx_series
from tests.helpers import make_xlsx

FX = Path(__file__).parent / "fixtures"


def fx(name):
    return (FX / name).read_bytes()


def fake_fetch(routes):
    """routes: {substring of url: bytes}; records calls."""
    calls = []

    def f(url, data=None, headers=None, **kw):
        calls.append((url, data))
        for key, body in routes.items():
            if key in url:
                return body, {}
        raise AssertionError(f"unexpected url {url}")
    f.calls = calls
    return f


class PxwebTest(unittest.TestCase):
    ENTRY = {"id": "t", "name": "t", "unit": "positions", "table": "https://px.example/x.px",
             "select": [{"variable": "quarter", "last": 2},
                        {"variable": "division", "values": "62|63", "limit": 2},
                        {"variable": "indicator", "values": "vacanc", "limit": 1}]}

    def test_query_built_from_rules(self):
        meta = json.loads(fx("pxweb_meta.json"))
        query, info = pxweb.build_query(meta, self.ENTRY["select"])
        by = {q["code"]: q["selection"]["values"] for q in query}
        self.assertEqual(by["Quartal"], ["2024Q2", "2024Q3"])
        self.assertEqual(by["NOGA"], ["62", "63"])
        self.assertEqual(by["Indikator"], ["1"])
        self.assertNotIn("Geschlecht", by)  # eliminable and not asked for -> total

    def test_rule_matching_nothing_is_an_error(self):
        meta = json.loads(fx("pxweb_meta.json"))
        with self.assertRaises(ValueError):
            pxweb.build_query(meta, [{"variable": "division", "values": "zzz"}])

    def test_run_stores_series(self):
        c = db.connect(":memory:")
        f = fake_fetch({"x.px": fx("pxweb_meta.json")})
        responses = [fx("pxweb_meta.json"), fx("pxweb_data.json")]
        with mock.patch.object(net, "fetch", side_effect=lambda *a, **k: (responses.pop(0), {})):
            n = pxweb.run(c, self.ENTRY)
        self.assertEqual(n, 3)  # the ".." cell is skipped
        rows = c.execute("SELECT series, period, value, unit FROM stats WHERE source='t' ORDER BY period").fetchall()
        self.assertEqual(rows[0], ("62 IT services / Job vacancies - total", "2024Q1", 100.0, "positions"))
        self.assertEqual(rows[-1][1:3], ("2024Q3", 55.0))

    def test_slow_table_timeout_is_passed_to_the_data_request(self):
        c = db.connect(":memory:")
        responses = [fx("pxweb_meta.json"), fx("pxweb_data.json")]
        with mock.patch.object(net, "fetch", side_effect=lambda *a, **k: (responses.pop(0), {})) as f:
            pxweb.run(c, dict(self.ENTRY, timeout=240))
        self.assertEqual(f.call_args_list[1].kwargs["timeout"], 240)


class CsvSeriesTest(unittest.TestCase):
    def test_csv_mapping_and_filter(self):
        entry = {"id": "c", "name": "c", "data_url": "https://x", "delimiter": ";", "period": "year", "value": "n",
                 "series": ["kind", "canton"], "where": {"kind": "^F$"}}
        rows = csv_series.parse(fx("series.csv"), entry)
        self.assertEqual(rows, [("F / ZH", "2023", 10.0), ("F / ZH", "2024", 12.0), ("F / BE", "2024", 7.0)])

    def test_non_numbers_skipped(self):
        entry = {"id": "c", "name": "c", "data_url": "https://x", "delimiter": ";", "period": "year", "value": "n",
                 "series": ["canton"]}
        self.assertNotIn(("BE", "2024", None), csv_series.parse(fx("series.csv"), entry))
        self.assertEqual(len(csv_series.parse(fx("series.csv"), entry)), 4)  # the "x" row is dropped

    def test_jsonstat(self):
        rows = csv_series.parse(fx("jsonstat.json"), {"format": "jsonstat", "name": "j"})
        self.assertIn(("Job vacancy rate", "2025-Q2", 2.2), rows)
        self.assertIn(("Job vacancies", "2025-Q3", 5200.0), rows)
        self.assertEqual(len(rows), 5)  # the missing cell is skipped

    def test_json_records(self):
        body = json.dumps({"data": {"items": [{"y": "2024", "v": "3", "k": "a"}]}}).encode()
        rows = csv_series.parse(body, {"format": "json", "records_path": "data.items", "period": "y", "value": "v",
                                       "series": ["k"], "name": "n"})
        self.assertEqual(rows, [("a", "2024", 3.0)])

    def test_run_assigns_units_by_label(self):
        c = db.connect(":memory:")
        entry = {"id": "e", "name": "e", "data_url": "https://x", "format": "jsonstat",
                 "units": {"rate": "%", "vacanc": "positions"}}
        with mock.patch.object(net, "fetch", return_value=(fx("jsonstat.json"), {})):
            csv_series.run(c, entry)
        units = dict(c.execute("SELECT DISTINCT series, unit FROM stats").fetchall())
        self.assertEqual(units, {"Job vacancy rate": "%", "Job vacancies": "positions"})


class RssAndOdataTest(unittest.TestCase):
    def test_rss_keeps_only_keyword_hits(self):
        hits = rss_keywords.parse(fx("fedlex.xml"), ["integration", "asyl"])
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0][0], "https://fedlex.example/1")
        self.assertEqual(hits[0][2], "2026-11-10")

    def test_rss_run_is_idempotent(self):
        c = db.connect(":memory:")
        entry = {"id": "fedlex", "name": "f", "feed": "https://f", "keywords": ["Integration"], "source_label": "Federal law"}
        with mock.patch.object(net, "fetch", return_value=(fx("fedlex.xml"), {})):
            self.assertEqual(rss_keywords.run(c, entry), 1)
            self.assertEqual(rss_keywords.run(c, entry), 0)

    def test_odata_date_and_run(self):
        self.assertEqual(odata_search.odata_date("/Date(1762819200000)/"), "2025-11-11")
        self.assertEqual(odata_search.odata_date("2026-11-11T00:00:00"), "2026-11-11")
        c = db.connect(":memory:")
        entry = {"id": "curia", "name": "c", "base": "https://ws.example/odata.svc/Business", "keywords": ["Asyl", "Integration"],
                 "filter": "Language eq 'DE' and substringof('{kw}',Title)",
                 "fields": {"id": "ID", "title": "Title", "date": "SubmissionDate", "status": "BusinessStatusText"},
                 "link": "https://p.example/?AffairId={id}", "source_label": "Parliament"}
        f = fake_fetch({"odata.svc": fx("curia.json")})
        with mock.patch.object(net, "fetch", side_effect=f):
            n = odata_search.run(c, entry)
        self.assertEqual(n, 1)  # same item returned for both keywords: stored once
        self.assertEqual(len(f.calls), 2)
        self.assertIn("substringof('Asyl',Title)", __import__("urllib.parse").parse.unquote(f.calls[0][0]))
        row = c.execute("SELECT id, source, date, url FROM policy").fetchone()
        self.assertEqual(row, ("curia:20260083", "Parliament", "2025-11-11", "https://p.example/?AffairId=20260083"))


class XlsxSeriesTest(unittest.TestCase):
    SHEET = [["Title", None, None], ["Canton", "Total", "Rate"], [None], ["Total", 100, 0.5], ["Zürich", 40, 0.25],
             ["Bern", "-", 0.1], ["Source: SEM"]]
    ENTRY = {"id": "x", "name": "x", "first_row": 4, "label_column": "A", "label_map": {"Total": "Switzerland"},
             "sheets": [{"name": "CH-Kt", "dimension": "Canton"}],
             "columns": {"B": {"name": "Persons", "unit": "persons"}, "C": {"name": "Rate", "unit": "share"}}}

    def test_reader(self):
        wb = xlsx.read(make_xlsx({"CH-Kt": self.SHEET}))
        self.assertEqual(wb["CH-Kt"][5]["A"], "Zürich")
        self.assertEqual(xlsx.number(wb["CH-Kt"][5]["B"]), 40.0)
        self.assertIsNone(xlsx.number("-"))

    def test_parse_rows(self):
        wb = xlsx.read(make_xlsx({"CH-Kt": self.SHEET}))
        rows = xlsx_series.parse(wb, self.ENTRY, "2026-10")
        self.assertIn(("Persons / Switzerland", "2026-10", 100.0, "persons", "Canton"), rows)
        self.assertIn(("Rate / Zürich", "2026-10", 0.25, "share", "Canton"), rows)
        self.assertFalse([r for r in rows if r[0] == "Persons / Bern"])  # "-" is no number
        self.assertEqual(len(rows), 5)

    def test_year_sheets_and_header_names(self):
        wb = xlsx.read(make_xlsx({"2024": [["t"], ["", "Quote A (%)"], ["CH", 90]], "2023": [["t"], ["", "Quote A (%)"], ["CH", 80]],
                                  "notes": [["x"]]}))
        entry = {"id": "y", "name": "y", "first_row": 3, "header_row": 2, "sheets": [{"name_regex": r"^\d{4}$", "last": 1}],
                 "columns": {"B": None}}
        self.assertEqual(xlsx_series.parse(wb, entry, None), [("Quote A (%) / CH", "2024", 90.0, None, None)])

    def test_find_link(self):
        html = fx("sem_page.html").decode()
        url = xlsx_series.find_link(html, "^6-22:", "https://www.sem.admin.ch/de/asylstatistik-oktober-2026")
        self.assertEqual(url, "https://www.sem.admin.ch/dam/de/sd-web/aaa/6-22-best-va-erwerb-2026-10-d.xlsx")
        self.assertIsNone(xlsx_series.find_link(html, "^9-99:", "https://x"))

    def test_months_back(self):
        self.assertEqual(list(xlsx_series.months_back(dt.date(2026, 2, 5), 3)), [(2026, 2), (2026, 1), (2025, 12)])

    def test_run_edition_page_end_to_end_and_skip_known(self):
        c = db.connect(":memory:")
        entry = dict(self.ENTRY, page="https://sem.example/{month_de}-{year}", file_link="^6-22:", editions=1)
        book = make_xlsx({"CH-Kt": self.SHEET})
        page = fx("sem_page.html")

        def f(url, data=None, headers=None, **kw):
            return (book if url.endswith(".xlsx") else page), {}
        today = dt.date(2026, 11, 20)
        with mock.patch.object(net, "fetch", side_effect=f), mock.patch.object(net, "fetch_cached", side_effect=f), \
                mock.patch.object(xlsx_series.dt, "date", wraps=dt.date) as d:
            d.today.return_value = today
            n = xlsx_series.run(c, entry)
            self.assertEqual(n, 5)
            periods = {r[0] for r in c.execute("SELECT period FROM stats")}
            self.assertEqual(periods, {"2026-11"})
            self.assertEqual(xlsx_series.run(c, entry), 0)  # already in the database -> nothing fetched again


class JobroomTest(unittest.TestCase):
    def test_store_ad_classifies_and_tags(self):
        c = db.connect(":memory:")
        ad = json.loads(fx("jobroom_ad.json"))
        self.assertEqual(jobroom_search.store_ad(c, ad, "2026-11-20"), 1)
        row = c.execute("SELECT roles, skills, barriers, company, url FROM ads").fetchone()
        self.assertIn("web", json.loads(row[0]))
        self.assertIn("JavaScript", json.loads(row[1]))
        self.assertIn("entry_level", json.loads(row[2]))
        self.assertEqual(row[4], "https://example.org/job")
        cols = [r[1] for r in c.execute("PRAGMA table_info(ads)")]
        self.assertNotIn("full_text", cols)  # ad text is never stored


class LinkTest(unittest.TestCase):
    def test_link_collects_nothing(self):
        self.assertEqual(link.run(db.connect(":memory:"), {"id": "l"}), 0)


if __name__ == "__main__":
    unittest.main()
