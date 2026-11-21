import datetime as dt
import os
import unittest
from unittest import mock

from collector import collect, db, types
from collector.roles import IT_GUARD, classify


class CollectTest(unittest.TestCase):
    def test_due_follows_schedule(self):
        c = db.connect(":memory:")
        e = {"id": "s", "schedule": "weekly"}
        self.assertTrue(collect.due(c, e))  # never ran
        db.record_run(c, "s", True, 1)
        today = dt.date.today()
        self.assertFalse(collect.due(c, e, today + dt.timedelta(days=3)))
        self.assertTrue(collect.due(c, e, today + dt.timedelta(days=7)))

    def test_failing_source_is_recorded_and_does_not_raise(self):
        c = db.connect(":memory:")
        with mock.patch.object(types, "get") as get:
            get.return_value.run.side_effect = RuntimeError("boom")
            collect.run_entry(c, {"id": "bad", "type": "pxweb", "schedule": "daily"})
        row = c.execute("SELECT status, last_ok, note FROM source_runs WHERE source='bad'").fetchone()
        self.assertEqual(row[0], "error")
        self.assertIsNone(row[1])
        self.assertIn("boom", row[2])

    def test_failed_run_keeps_the_previous_success_date(self):
        c = db.connect(":memory:")
        db.record_run(c, "x", True, 5)
        ok = c.execute("SELECT last_ok FROM source_runs").fetchone()[0]
        db.record_run(c, "x", False, 0, "later failure")
        self.assertEqual(c.execute("SELECT last_ok, status FROM source_runs").fetchone(), (ok, "error"))

    def test_home_ip_source_is_skipped_on_a_server(self):
        c = db.connect(":memory:")
        with mock.patch.dict(os.environ, {"RADAR_SERVER": "1"}), mock.patch.object(types, "get") as get:
            collect.run_entry(c, {"id": "jobroom", "type": "jobroom_search", "home_ip_only": True, "schedule": "daily"})
        get.assert_not_called()
        self.assertIsNone(c.execute("SELECT 1 FROM source_runs").fetchone())

    def test_home_ip_source_runs_on_a_server_with_the_override(self):
        c = db.connect(":memory:")
        env = {"RADAR_SERVER": "1", "RADAR_ALLOW_SERVER": "1"}
        with mock.patch.dict(os.environ, env), mock.patch.object(types, "get") as get:
            get.return_value.run.return_value = 3
            collect.run_entry(c, {"id": "x", "type": "link", "home_ip_only": True, "schedule": "daily"})
        get.assert_called_once()

    def test_jobroom_is_not_home_ip_only(self):
        from collector import config
        jobroom = [e for e in config.load() if e["id"] == "jobroom"][0]
        self.assertFalse(jobroom.get("home_ip_only"))

    def test_old_names_still_work(self):
        self.assertEqual(collect.ALIASES["jobs"], ["jobroom"])
        self.assertEqual(collect.ALIASES["policy"], ["curia", "fedlex"])

    def test_new_roles_by_title(self):
        for title, role in [("Junior DevOps Engineer", "devops"), ("Netzwerktechniker EFZ", "network"),
                            ("Cyber Security Analyst", "security"), ("Software Tester", "qa"),
                            ("Projektleiter ICT", "itpm"), ("Business Analyst Banking", "business"),
                            ("UX Designer", "ux"), ("SAP Berater", "erp")]:
            self.assertIn(role, classify(title), title)
            self.assertTrue(IT_GUARD.search(title), title)
        self.assertNotIn("data", classify("Cyber Security Analyst"))

    def test_non_programming_tech_roles_by_title(self):
        for title, role in [("People Analyst (m/w/d)", "people"), ("Digital Product Manager", "product"),
                            ("Online Marketing Manager SEO", "marketing"),
                            ("Customer Success Manager SaaS", "techsales"), ("IT Recruiter 80-100%", "recruiting")]:
            self.assertIn(role, classify(title), title)
            self.assertTrue(IT_GUARD.search(title), title)
        self.assertFalse(IT_GUARD.search("Pflegefachperson Station"))
        self.assertFalse(IT_GUARD.search("Verkaufsberater Detailhandel"))

    def test_old_roles_keep_their_titles(self):
        self.assertIn("web", classify("Web Developer"))
        self.assertIn("support", classify("IT Supporter"))
        self.assertIn("data", classify("Data Analyst"))

    def test_non_it_title_has_no_role(self):
        self.assertEqual(classify("Pflegefachperson 80%"), [])


if __name__ == "__main__":
    unittest.main()
