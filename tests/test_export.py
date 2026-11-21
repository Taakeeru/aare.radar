"""Export contract: the fields the dashboard already reads must stay; new fields may be added."""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from collector import config, db, export

# frozen from the contract in collector/export.py as of the first dashboard version: never remove or rename these
OLD_TOP = {"generated_at", "window_days", "sources", "roles", "sector", "policy"}
OLD_SOURCE = {"id", "name", "url", "what", "updated"}
OLD_ROLE = {"id", "label", "ads", "weekly", "skills", "barriers", "entry_level_share", "employers", "agencies",
            "agency_share", "cantons", "reporting_obligation_share", "examples"}
OLD_SKILL = {"skill", "count", "share"}
OLD_POLICY = {"source", "title", "date", "status", "url", "matched"}
OLD_SOURCE_IDS = ["jobroom", "bfs", "curia", "fedlex"]


def build_db(path):
    c = db.connect(path)
    for i in range(3):
        c.execute("""INSERT INTO ads(id,title,company,canton,city,published,reporting_obligation,url,roles,skills,barriers,
                     first_seen,last_seen,tagged) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)""",
                  (f"a{i}", "Web Developer", "Beispiel AG", "ZH", "Zürich", "2999-01-01", 0, "https://x/" + str(i),
                   '["web"]', '["JavaScript", "Docker"]', '["entry_level"]', "2026-11-01", "2026-11-20"))
    db.put_stat(c, "bfs", "Job vacancies - total / 62-63", "2024Q1", 100.0, "positions")
    db.put_stat(c, "sem_erwerb_status_s", "Status S: employment rate / Switzerland", "2026-09", 0.38, "share", "Canton")
    db.put_stat(c, "sem_erwerb_status_s", "Status S: employment rate / Switzerland", "2026-10", 0.39, "share", "Canton")
    db.put_stat(c, "sem_erwerb_status_s", "Status S: employment rate / Zürich", "2026-10", 0.45, "share", "Canton")
    c.execute("INSERT INTO policy VALUES('curia:1','Parliament (Curia Vista)','T','2026-11-11','open','https://p','Asyl','2026-11-20')")
    for e in config.load():
        db.record_run(c, e["id"], e["type"] != "pxweb" or e["id"] != "bfs_population_permit", 1)
    c.commit()
    c.close()


class ExportContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = Path(cls.tmp.name) / "radar.db"
        build_db(cls.db)
        out = Path(cls.tmp.name) / "radar.json"
        export.main(out, db=cls.db)
        cls.doc = json.loads(out.read_text())

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_old_fields_unchanged(self):
        d = self.doc
        self.assertTrue(OLD_TOP <= set(d))
        self.assertTrue(all(OLD_SOURCE <= set(s) for s in d["sources"]))
        self.assertEqual([s["id"] for s in d["sources"]][:4], OLD_SOURCE_IDS)
        self.assertEqual([r["id"] for r in d["roles"]], ["web", "support", "data"])
        for r in d["roles"]:
            self.assertTrue(OLD_ROLE <= set(r))
            self.assertTrue(all(OLD_SKILL <= set(s) for s in r["skills"]))
        self.assertTrue(all(OLD_POLICY <= set(p) for p in d["policy"]))
        self.assertEqual(d["roles"][0]["ads"], 3)
        self.assertEqual(d["sector"], [{"series": "Job vacancies - total / 62-63", "period": "2024Q1", "value": 100.0}])

    def test_sample_fixture_still_has_every_old_key(self):
        sample = json.loads((Path(__file__).parent.parent / "fixtures" / "radar.sample.json").read_text())
        self.assertTrue(OLD_TOP <= set(sample))
        self.assertTrue(OLD_ROLE <= set(sample["roles"][0]))

    def test_sources_come_from_config(self):
        ids = [s["id"] for s in self.doc["sources"]]
        self.assertEqual(ids, [e["id"] for e in config.load()])
        s = next(s for s in self.doc["sources"] if s["id"] == "sem_erwerb_status_s")
        self.assertEqual(s["questions"], ["D"])
        self.assertEqual(s["latest_period"], "2026-10")
        self.assertEqual(s["status"], "ok")
        self.assertRegex(s["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(next(s for s in self.doc["sources"] if s["type"] == "link")["status"], "reference")

    def test_series_grouped_by_question(self):
        block = self.doc["series"]["D"][0]
        self.assertEqual(block["source"], "sem_erwerb_status_s")
        self.assertTrue(block["url"] and block["updated"])
        top = block["series"][0]
        self.assertEqual(top["label"], "Status S: employment rate / Zürich")  # ranked by latest value
        self.assertEqual(top["dimension"], "Canton")
        ch = next(s for s in block["series"] if s["label"].endswith("Switzerland"))
        self.assertEqual(ch["points"], [{"period": "2026-09", "value": 0.38}, {"period": "2026-10", "value": 0.39}])
        self.assertEqual(ch["unit"], "share")
        self.assertIn("A", self.doc["series"])  # JOBSTAT is a numeric source for question A
        self.assertEqual(self.doc["questions"]["D"], "Target group")

    def test_esco_fields_only_where_mapped(self):
        skills = {s["skill"]: s for s in self.doc["roles"][0]["skills"]}
        self.assertTrue(skills["JavaScript"]["esco_uri"].startswith("http://data.europa.eu/esco/skill/"))
        self.assertIn(skills["JavaScript"]["esco_match"], ("exact", "broader"))
        self.assertNotIn("esco_uri", skills["Docker"])  # ESCO has no Docker concept

    def test_esco_mapping_file(self):
        m = json.loads(export.ESCO.read_text())
        from collector.roles import SKILLS
        self.assertEqual(set(m), set(SKILLS))  # every skill decided: a mapping or an explicit null
        mapped = [v for v in m.values() if v]
        self.assertGreaterEqual(len(mapped), 20)
        for v in mapped:
            self.assertRegex(v["uri"], r"^http://data\.europa\.eu/esco/skill/[0-9a-f-]{36}$")
            self.assertIn(v["match"], ("exact", "broader"))


class MonthlyTest(unittest.TestCase):
    TODAY = dt.date(2026, 11, 20)

    def export(self, ads):
        """ads: [(id, published, roles_json)] -> exported doc."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "radar.db"
            c = db.connect(path)
            for i, pub, roles in ads:
                c.execute("""INSERT INTO ads(id,title,company,canton,city,published,reporting_obligation,url,roles,skills,
                             barriers,first_seen,last_seen,tagged) VALUES(?,?,?,?,?,?,0,?,?,'[]','[]',?,?,1)""",
                          (i, "T", "C", "ZH", "Zürich", pub, "https://x/" + i, roles, "2026-11-01", "2026-11-20"))
            c.commit()
            c.close()
            return export.main(Path(tmp) / "radar.json", db=path, today=self.TODAY)

    def test_old_ad_counts_in_monthly_not_in_ads(self):
        old = (self.TODAY - dt.timedelta(days=90)).isoformat()
        doc = self.export([("a", old, '["web"]'), ("b", "2026-11-10", '["web"]')])
        web = doc["roles"][0]
        self.assertEqual(web["ads"], 1)
        self.assertEqual(sum(m["new_ads"] for m in web["monthly"]), 2)
        self.assertEqual(web["monthly"][0]["month"], old[:7])

    def test_ad_in_two_roles_counts_once_in_market(self):
        doc = self.export([("a", "2026-11-10", '["web", "data"]'), ("b", "2026-11-11", '["support"]')])
        self.assertEqual(doc["market"]["ads"], 2)
        self.assertEqual(doc["market"]["monthly"], [{"month": "2026-11", "new_ads": 2, "partial": True}])
        self.assertEqual(sum(r["ads"] for r in doc["market"]["roles"]), 3)
        self.assertEqual(doc["market"]["roles"][0]["ads"], 1)

    def test_empty_month_between_shows_zero(self):
        doc = self.export([("a", "2026-08-15", '["web"]'), ("b", "2026-10-02", '["web"]')])
        self.assertEqual([(m["month"], m["new_ads"]) for m in doc["roles"][0]["monthly"]],
                         [("2026-08", 1), ("2026-09", 0), ("2026-10", 1), ("2026-11", 0)])

    def test_current_month_is_partial_and_range_is_capped(self):
        doc = self.export([("o", "2020-01-05", '["web"]'), ("a", "2024-12-05", '["web"]'),
                           ("b", "2026-11-02", '["web"]')])
        m = doc["roles"][0]["monthly"]
        self.assertEqual(len(m), 24)
        self.assertEqual(m[0]["month"], "2024-12")
        self.assertEqual([x["partial"] for x in m], [False] * 23 + [True])
        self.assertEqual(m[-1], {"month": "2026-11", "new_ads": 1, "partial": True})


class EntrySkillsTest(unittest.TestCase):
    TODAY = dt.date(2026, 11, 20)

    def export(self, ads):
        """ads: [(id, published, skills_json, barriers_json)], all role web, full text -> exported doc."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "radar.db"
            c = db.connect(path)
            for i, pub, skills, barriers in ads:
                c.execute("""INSERT INTO ads(id,title,company,canton,city,published,reporting_obligation,url,roles,skills,
                             barriers,first_seen,last_seen,tagged) VALUES(?,?,?,?,?,?,0,?,'["web"]',?,?,?,?,1)""",
                          (i, "T", "C", "ZH", "Zürich", pub, "https://x/" + i, skills, barriers, "2026-11-01", "2026-11-20"))
            c.commit()
            c.close()
            return export.main(Path(tmp) / "radar.json", db=path, today=self.TODAY)

    def test_entry_ad_counts_and_senior_ad_does_not(self):
        doc = self.export([("a", "2026-11-10", '["Python", "SQL"]', '["entry_level"]'),
                           ("b", "2026-11-11", '["Python", "Java"]', '["senior_experience"]')])
        web = doc["roles"][0]
        self.assertEqual(web["entry_ads"], 1)
        got = {s["skill"]: s for s in web["entry_skills"]}
        self.assertEqual(set(got), {"Python", "SQL"})
        self.assertEqual(got["Python"]["count"], 1)
        self.assertEqual(got["Python"]["share"], 1.0)
        self.assertEqual({s["skill"] for s in web["skills"]}, {"Python", "SQL", "Java"})

    def test_role_without_entry_ads_gives_empty_list_and_zero(self):
        doc = self.export([("b", "2026-11-11", '["Python"]', '["senior_experience"]')])
        self.assertEqual(doc["roles"][0]["entry_skills"], [])
        self.assertEqual(doc["roles"][0]["entry_ads"], 0)

    def test_skills_monthly_twelve_points_zero_month_and_partial_current(self):
        doc = self.export([("a", "2026-08-10", '["Python"]', '[]'), ("b", "2026-08-12", '["SQL"]', '[]'),
                           ("c", "2026-11-02", '["Python"]', '[]')])
        series = {s["skill"]: s["points"] for s in doc["roles"][0]["skills_monthly"]}
        self.assertEqual(set(series), {"Python", "SQL"})
        py = series["Python"]
        self.assertEqual(len(py), 12)
        self.assertEqual(py[0]["month"], "2025-12")
        self.assertEqual(py[-1], {"month": "2026-11", "count": 1, "share": 1.0, "partial": True})
        self.assertEqual([p["partial"] for p in py], [False] * 11 + [True])
        aug = next(p for p in py if p["month"] == "2026-08")
        self.assertEqual((aug["count"], aug["share"]), (1, 0.5))
        sep = next(p for p in py if p["month"] == "2026-09")
        self.assertEqual((sep["count"], sep["share"]), (0, 0))


if __name__ == "__main__":
    unittest.main()
