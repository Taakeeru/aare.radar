import datetime as dt
import os
import unittest
from unittest import mock

from collector import collect, db, types


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

    def test_old_names_still_work(self):
        self.assertEqual(collect.ALIASES["jobs"], ["jobroom"])
        self.assertEqual(collect.ALIASES["policy"], ["curia", "fedlex"])


if __name__ == "__main__":
    unittest.main()
