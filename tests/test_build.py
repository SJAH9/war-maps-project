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

    def test_all_current_events_and_conflicts_are_available(self):
        self.assertEqual(self.data["coverage"]["candidate_through"], "2026-07-31")
        self.assertEqual(self.data["summary"]["candidate_events_2026"], 11867)
        self.assertEqual(self.data["summary"]["candidate_conflicts"], 485)
        conflict_ids = {item["id"] for item in self.data["conflicts"]}
        self.assertTrue(all(event["conflict_id"] in conflict_ids for event in self.data["events"]))
        self.assertEqual(len({event["id"] for event in self.data["events"]}), len(self.data["events"]))
        self.assertIn("ucdp-candidate-ged-2026-07", {event["source_id"] for event in self.data["events"]})

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
        self.assertIn(sample["regime"]["code"], {0, 1, 2, 3, None})

    def test_nation_profiles_join_time_relations_and_regimes(self):
        iran = next(item for item in self.data["nations"] if item["country"] == "Iran")
        israel = next(item for item in self.data["nations"] if item["country"] == "Israel")
        self.assertIn("Israel", {item["country"] for item in iran["opposing_states"]})
        self.assertIn("Iran", {item["country"] for item in israel["opposing_states"]})
        self.assertTrue(iran["regime_periods"])
        self.assertEqual(len(iran["centroid"]), 2)
        self.assertIn("best", iran["candidate_event_fatalities_in_territory"])

    def test_united_states_uses_continental_map_record(self):
        nation = next(item for item in self.data["nations"] if item["country"] == "United States of America")
        self.assertEqual(nation["map_name"], "United States of America")
        self.assertLess(nation["centroid"][0], -90)
        self.assertGreater(nation["centroid"][1], 30)

    def test_revision_one_projection_branches(self):
        classes = {item.get("branch_class") for item in self.data["prompted_projections"]}
        self.assertIn("alleged_backchannel", classes)
        self.assertIn("plausible_alternative_history", classes)
        for item in self.data["prompted_projections"]:
            self.assertNotIn("truth", item)

    def test_satellite_geometry_is_separate_from_conflict_relation(self):
        relation = next(item for item in self.data["satellite_constellations"] if item["constellation_id"] == "iceye-ukraine-support")
        self.assertGreaterEqual(relation["object_count"], 40)
        self.assertEqual(relation["relation_class"], "documented_constellation_support")
        self.assertIn("does not establish", relation["individual_asset_boundary"])
        self.assertTrue(all("conflict_ids" not in item for item in relation["objects"]))
        self.assertTrue(all(item["NORAD_CAT_ID"] for item in relation["objects"]))

    def test_output_is_machine_readable(self):
        loaded = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(loaded["summary"], self.data["summary"])


if __name__ == "__main__":
    unittest.main()
