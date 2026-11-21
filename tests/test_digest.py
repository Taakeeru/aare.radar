import datetime as dt
import json
import unittest

from collector import db
from collector.digest import build_digest

TODAY = dt.date(2026, 11, 21)


def add(c, id, title, roles, first_seen, ends=None):
    c.execute("INSERT INTO ads(id, title, company, city, url, roles, first_seen, ends) VALUES(?,?,?,?,?,?,?,?)",
              (id, title, "Acme", "Bern", f"https://x.ch/{id}", json.dumps(roles), first_seen, ends))


class DigestTest(unittest.TestCase):
    def setUp(self):
        self.c = db.connect(":memory:")
        add(self.c, "a", "Late", ["web"], "2026-11-15", "2026-12-30")
        add(self.c, "b", "Early", ["web"], "2026-11-10", "2026-12-01")
        add(self.c, "c", "NoEnd", ["web"], "2026-11-12")
        add(self.c, "d", "Old", ["web"], "2026-10-01", "2026-12-01")
        add(self.c, "e", "NoRole", [], "2026-11-15", "2026-12-01")
        add(self.c, "f", "Help", ["support"], "2026-11-20", "2026-12-05")

    def test_counts_and_period(self):
        d = build_digest(self.c, TODAY)
        self.assertIn("Web developer (3)", d["text"])
        self.assertIn("IT support (1)", d["text"])
        self.assertIn("Data analyst (0)", d["text"])
        self.assertIn("No new postings", d["text"])
        self.assertNotIn("Old", d["text"])
        self.assertNotIn("NoRole", d["text"])
        self.assertEqual(d["subject"], "AareRadar: new job postings from 7 November 2026 to 21 November 2026")

    def test_sort_and_no_end(self):
        t = build_digest(self.c, TODAY)["text"]
        self.assertLess(t.index("Early"), t.index("Late"))
        self.assertLess(t.index("Late"), t.index("NoEnd"))
        self.assertIn("Early, Acme, Bern, until 1 December 2026, https://x.ch/b", t)
        self.assertIn("NoEnd, Acme, Bern, no end date given", t)

    def test_german(self):
        d = build_digest(self.c, TODAY, locale="de")
        self.assertIn("Webentwicklung (3)", d["text"])
        self.assertIn("Keine neuen Stellen", d["text"])
        self.assertIn("bis 1. Dezember 2026", d["text"])
        self.assertIn("kein Enddatum angegeben", d["text"])
        self.assertTrue(d["subject"].startswith("AareRadar: neue Stellen von 7. November 2026 bis"))
        self.assertNotIn("ß", d["text"] + d["subject"])


if __name__ == "__main__":
    unittest.main()
