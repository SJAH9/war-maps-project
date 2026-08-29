import json
import unittest

from src.build_atlas import OUTPUT, build


class WarMapsBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = build()

    def test_postwar_coverage(self):
        self.assertEqual(self.data["coverage"]["start_year"], 1946)
        self.assertGreater(self.data["summary"]["historical_conflicts"], 250)
        self.assertGreater(self.data["summary"]["conflict_years"], 2000)

    def test_current_iran_focal_conflict(self):
        focal = next(item for item in self.data["conflicts"] if item["id"] == "ucdp-candidate-16905")
        self.assertEqual(focal["historical_link"], "ucdp-14609")
        self.assertGreater(focal["event_count"], 0)
        self.assertIn("Government of Iran", focal["parties_a"])

    def test_claims_use_recursive_enclosures_not_truth_flags(self):
        for claim in self.data["claims"]:
            self.assertNotIn("truth", claim)
            self.assertNotIn("disposition", claim)
            enclosure = claim["enclosure"]
            self.assertEqual(enclosure["function"], "E")
            self.assertEqual(enclosure["outer"]["function"], "E")
            self.assertEqual(enclosure["inner"]["function"], "E")
            self.assertTrue(enclosure["departure"]["id"])
            self.assertIn("join_keys", enclosure["departure"])

    def test_vdem_is_retained_as_conditions_not_war_score(self):
        self.assertGreater(self.data["summary"]["vdem_state_years"], 10000)
        sample = self.data["state_conditions"][0]
        self.assertIn("conditions", sample)
        self.assertNotIn("score", sample)

    def test_revision_one_projection_branches(self):
        classes = {item.get("branch_class") for item in self.data["prompted_projections"]}
        self.assertIn("alleged_backchannel", classes)
        self.assertIn("plausible_alternative_history", classes)
        for item in self.data["prompted_projections"]:
            self.assertNotIn("truth", item)

    def test_output_is_machine_readable(self):
        loaded = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(loaded["summary"], self.data["summary"])


if __name__ == "__main__":
    unittest.main()
