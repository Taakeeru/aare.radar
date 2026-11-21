"""Summary email v2 (21.11.2026): beginner IT ads first, by field; senior titles never count as beginner ads."""
import datetime as dt
import tempfile
import unittest
from pathlib import Path

from collector import db, digest
from collector.roles import is_entry_ad


class DigestV2Test(unittest.TestCase):
    def test_senior_titles_are_not_beginner_ads(self):
        self.assertFalse(is_entry_ad("Senior Cyber Security Engineer", ["entry_level"], None))
        self.assertFalse(is_entry_ad("IT-Projektleiter/-in", ["entry_level"], None))
        self.assertTrue(is_entry_ad("Junior Developer", ["entry_level"], None))
        self.assertTrue(is_entry_ad("ICT Supporter", [], "NO_EXPERIENCE"))
        self.assertFalse(is_entry_ad("ICT Supporter", [], "MORE_THAN_3_YEARS"))

    def test_fields_dedupe_and_order(self):
        with tempfile.TemporaryDirectory() as d:
            c = db.connect(Path(d) / "t.db")
            today = dt.date(2026, 11, 21)
            rows = [("a", "Junior Software Engineer", "X AG", "Bern", "2026-12-01", "101350", '["entry_level"]'),
                    ("b", "Senior Software Engineer", "X AG", "Bern", "2026-12-01", "101350", '["entry_level"]'),
                    ("c", "ICT Supporter", "Y AG", "Zug", "2026-11-25", "101782", '["entry_level"]'),
                    ("d", "ICT Supporter", "Y AG", "Zug", "2026-11-25", "101782", '["entry_level"]'),   # same ad, other language
                    ("e", "Old ad", "Z AG", "Zug", "2026-11-30", "101350", '["entry_level"]')]
            for aid, title, comp, city, ends, occ, tags in rows:
                seen = "2026-10-01" if aid == "e" else "2026-11-20"
                c.execute("""INSERT INTO ads(id,title,company,city,ends,occupation,roles,skills,barriers,first_seen,last_seen)
                             VALUES(?,?,?,?,?,?,'[]','[]',?,?,?)""", (aid, title, comp, city, ends, occ, tags, seen, seen))
            c.commit()
            g = digest.build_digest_v2(c, today)
            self.assertEqual(g["ads"], 3)
            self.assertEqual(g["entry_ads"], 2)
            by = {f["group"]: f for f in g["fields"]}
            self.assertEqual([i["title"] for i in by["251"]["items"]], ["Junior Software Engineer"])
            self.assertTrue(by["251"]["items"][0]["url"].startswith("https://www.job-room.ch/job-search/"))
            for loc in ("en", "de"):
                r = digest.render_v2(g, loc)
                self.assertIn("{ AARE.RADAR }", r["subject"])
                self.assertNotIn("ß", r["text"] + r["subject"])
                self.assertIn("<a href=", r["html"])
                self.assertIn("#3eafaf", r["html"])           # the wordmark's braces in Aare turquoise
            only = digest.render_v2(g, "en", fields=["351"])
            self.assertIn("ICT Supporter", only["text"])
            self.assertNotIn("Junior Software Engineer", only["text"])   # a category the reader did not choose
            self.assertIn("1 new entry-level", only["text"])
            c.execute("INSERT INTO policy VALUES('p1','Parliament (Curia Vista)','Integration of status S','2026-11-15','open','https://p',"
                      "'Status S','2026-11-15')")
            c.commit()
            g = digest.build_digest_v2(c, today)
            self.assertEqual([p["title"] for p in g["policy"]], ["Integration of status S"])
            self.assertIn("New in parliament", digest.render_v2(g, "en")["text"])
            self.assertNotIn("New in parliament", digest.render_v2(g, "en", fields=["351"])["text"])
            self.assertIn("stop", digest.render_v2(g, "en", scheduled=True)["text"])


if __name__ == "__main__":
    unittest.main()
