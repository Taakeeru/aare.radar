import unittest

from collector import config, types


class ConfigTest(unittest.TestCase):
    def setUp(self):
        self.entries = config.load()

    def test_sources_file_is_valid(self):
        self.assertEqual(config.validate(self.entries), [])

    def test_required_keys_ids_unique_questions_valid(self):
        ids = [e["id"] for e in self.entries]
        self.assertEqual(len(ids), len(set(ids)))
        for e in self.entries:
            for k in config.REQUIRED:
                self.assertTrue(e.get(k), f"{e.get('id')}: {k}")
            self.assertTrue(set(e["questions"]) <= set(config.QUESTIONS), e["id"])
            self.assertIn(e["schedule"], config.SCHEDULE_DAYS)
            self.assertIn(e["type"], types.NAMES)

    def test_every_question_has_a_source(self):
        covered = {q for e in self.entries for q in e["questions"]}
        self.assertEqual(covered, set(config.QUESTIONS))

    def test_every_type_module_has_run_and_required(self):
        for name in types.NAMES:
            mod = types.get(name)
            self.assertTrue(callable(mod.run), name)
            self.assertIsInstance(mod.REQUIRED, list, name)

    def test_validator_catches_mistakes(self):
        bad = [{"id": "x", "name": "n", "url": "http://insecure", "what": "w", "questions": ["Z"], "type": "nope",
                "schedule": "hourly"}, {"id": "x"}]
        problems = " | ".join(config.validate(bad))
        for expect in ("https://", "unknown question 'Z'", "unknown type 'nope'", "schedule must be", "used twice"):
            self.assertIn(expect, problems)

    def test_type_specific_params_are_checked(self):
        e = dict(self.entries[0])
        e.update(id="y", type="pxweb")
        e.pop("table", None)
        self.assertTrue(any("needs 'table'" in p for p in config.validate([e])))

    def test_one_sector_source_and_d_has_numbers(self):
        self.assertEqual(sum(1 for e in self.entries if e.get("sector")), 1)
        d_numeric = [e for e in self.entries if "D" in e["questions"] and e["type"] != "link"]
        self.assertGreaterEqual(len(d_numeric), 5)



class DocsExamplesTest(unittest.TestCase):
    def test_worked_examples_in_the_docs_are_valid_blocks(self):
        import json
        import re
        from pathlib import Path
        text = (Path(__file__).parent.parent / "docs" / "adding-a-source.md").read_text()
        blocks = [json.loads(b) for b in re.findall(r"```json\n(.*?)```", text, re.S)]
        self.assertGreaterEqual(len(blocks), 2)
        self.assertEqual(config.validate(config.load() + blocks), [])


if __name__ == "__main__":
    unittest.main()
