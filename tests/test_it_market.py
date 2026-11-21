"""All IT jobs (21.11.2026): ads in an IT occupation code count, whatever their title; others do not."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from collector import db, export
from collector.types.jobroom_search import it_occupations


class ItMarketTest(unittest.TestCase):
    def test_codes_are_ict_groups_only(self):
        it = it_occupations()
        self.assertGreaterEqual(len(it["occupations"]), 50)
        for code, o in it["occupations"].items():
            self.assertRegex(code, r"^\d{6}$")
            self.assertIn(o["group"], it["groups"])
            self.assertRegex(o["group"], r"^(25|35)\d$")
            self.assertNotIn("/in", o["en"], f"{code}: German label on the English page")

    def test_counts_by_occupation_code(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "t.db"
            c = db.connect(path)
            rows = [("a", "Software Engineer", "101350"), ("b", "Systemtechniker", "101353"),
                    ("c", "Software Engineer", "101350"), ("d", "Pflegefachfrau", "999999")]
            for aid, title, occ in rows:
                c.execute("""INSERT INTO ads(id,title,published,occupation,roles,skills,barriers,first_seen,last_seen)
                             VALUES(?,?,?,?,'[]','[]','[]','2999-01-01','2999-01-01')""", (aid, title, "2999-01-01", occ))
            c.commit()
            m = export.build_it_market(sqlite3.connect(path), "2000-01-01")
            self.assertEqual(m["ads"], 3)
            self.assertEqual([(o["code"], o["ads"]) for o in m["occupations"]], [("101350", 2), ("101353", 1)])
            self.assertEqual(sum(g["ads"] for g in m["groups"]), 3)
            json.dumps(m)
            self.assertIn("overview", m)
            self.assertEqual(set(m["overview"]["requirements"]),
                             {"senior_experience", "german_required", "french_required", "degree_required", "english_ok"})


if __name__ == "__main__":
    unittest.main()
