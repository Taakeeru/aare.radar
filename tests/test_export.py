"""Export contract: the fields the dashboard already reads must stay; new fields may be added."""
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


if __name__ == "__main__":
    unittest.main()
