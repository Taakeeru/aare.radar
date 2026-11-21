"""Requirement details (21.11.2026): the language level belongs to its own clause; degree types; years asked."""
import unittest

from collector.roles import requirement_tags as r


class RequirementTagsTest(unittest.TestCase):
    def test_levels_per_language(self):
        self.assertEqual(r("Deutsch C1, Englisch B2, Französisch von Vorteil"), ["lang:de:C1", "lang:en:B2", "lang:fr:B1"])
        self.assertIn("lang:en:B2", r("Sehr gute Deutschkenntnisse (C1) und gute Englischkenntnisse"))
        self.assertIn("lang:de:C2", r("Muttersprache Deutsch"))

    def test_degrees_and_years(self):
        t = r("Abschluss FH oder EFZ. Mindestens 3 Jahre Berufserfahrung.")
        self.assertIn("degree:bachelor", t)
        self.assertIn("degree:vocational", t)
        self.assertIn("exp:3", t)
        self.assertIn("exp:5", r("5+ years of experience in Java"))
        self.assertEqual(r("Wir bieten ein tolles Team."), [])


if __name__ == "__main__":
    unittest.main()
