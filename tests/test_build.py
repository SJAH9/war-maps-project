import json
import unittest

from src.build_atlas import OUTPUT, ROOT, build


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

    def test_conflict_temporal_bounds_support_network_models(self):
        current = next(item for item in self.data["conflicts"] if item["id"] == "ucdp-candidate-16905")
        closed = next(item for item in self.data["conflicts"] if not item["active_at_source_boundary"])
        self.assertEqual(current["start_date"], "2026-02-28")
        self.assertIsNone(current["end_date"])
        self.assertIsNotNone(closed["end_date"])
        self.assertGreaterEqual(closed["end_date"], closed["start_date"])

    def test_network_inputs_retain_sides_locations_and_observations(self):
        focal_id = "ucdp-candidate-16905"
        events = [item for item in self.data["events"] if item["conflict_id"] == focal_id]
        self.assertTrue(events)
        self.assertTrue(all(item["country"] for item in events))
        self.assertTrue(any(item["side_a_states"] and item["side_b_states"] for item in events))
        self.assertTrue(ROOT.joinpath("web/network.html").exists())
        self.assertTrue(ROOT.joinpath("web/network.js").exists())
        network_source = ROOT.joinpath("web/network.js").read_text(encoding="utf-8")
        self.assertIn("ForceGraph3D", network_source)
        self.assertIn("onNodeDragEnd", network_source)
        self.assertIn("selectGraphNode", network_source)
        self.assertIn("renderSVG3D", network_source)
        self.assertIn("network-label-layer", network_source)
        self.assertIn("graph2ScreenCoords", network_source)
        self.assertIn("paintedBins", network_source)
        self.assertIn("AUTO_ROTATE_IDLE_MS", network_source)
        self.assertIn("autoRotate", network_source)
        self.assertIn("nodeThreeObject", network_source)
        self.assertIn("linkBaseColor", network_source)
        self.assertIn("linkBaseWidth", network_source)
        self.assertIn("return 3.1", network_source)
        self.assertIn("analyzeGraph", network_source)
        self.assertIn("betweenness", network_source)
        self.assertIn("degreeCentrality", network_source)
        self.assertIn("connectedComponents", network_source)
        network_page = ROOT.joinpath("web/network.html").read_text(encoding="utf-8")
        self.assertIn('class="conflict"', network_page)
        self.assertIn('class="actor"', network_page)
        self.assertIn("graphology-library", network_page)

    def test_life_and_death_map_uses_event_fatalities_and_geometry(self):
        page = ROOT.joinpath("web/life-death.html")
        source = ROOT.joinpath("web/life-death.js")
        health = ROOT.joinpath("web/life-death-data.js")
        birth_rate = ROOT.joinpath("web/crude-birth-rate-data.js")
        population = ROOT.joinpath("web/population-data.js")
        self.assertTrue(page.exists())
        self.assertTrue(source.exists())
        self.assertTrue(ROOT.joinpath("data/raw/ne_110m_admin_0_countries.geojson").exists())
        map_source = source.read_text(encoding="utf-8")
        self.assertIn("THREE.ShapeGeometry", map_source)
        self.assertIn("candidate-event", page.read_text(encoding="utf-8"))
        self.assertIn("event.fatalities", map_source)
        self.assertIn("blockCount", map_source)
        self.assertTrue(health.exists())
        self.assertIn("window.LIFE_DEATH_METRICS", health.read_text(encoding="utf-8"))
        self.assertTrue(birth_rate.exists())
        self.assertIn("window.CRUDE_BIRTH_RATE_DATA", birth_rate.read_text(encoding="utf-8"))
        self.assertTrue(population.exists())
        self.assertIn("window.POPULATION_DATA", population.read_text(encoding="utf-8"))
        birth_payload = json.loads(birth_rate.read_text(encoding="utf-8").removeprefix("window.CRUDE_BIRTH_RATE_DATA=").removesuffix(";\n"))
        population_payload = json.loads(population.read_text(encoding="utf-8").removeprefix("window.POPULATION_DATA=").removesuffix(";\n"))
        self.assertNotIn("WLD", {item["iso3"] for item in birth_payload["locations"]})
        self.assertNotIn("AFE", {item["iso3"] for item in population_payload["locations"]})
        self.assertTrue(population_payload["global"])
        self.assertEqual(population_payload["global"][-1][0], 2025)
        self.assertIn("data-metric=\"mortality\"", page.read_text(encoding="utf-8"))
        self.assertIn("data-metric=\"fertility\"", page.read_text(encoding="utf-8"))
        self.assertIn("data-metric=\"birth\"", page.read_text(encoding="utf-8"))
        self.assertIn("data-metric=\"population\"", page.read_text(encoding="utf-8"))
        self.assertIn("data-metric=\"conflict\"", page.read_text(encoding="utf-8"))
        self.assertIn("blockHeight", map_source)
        self.assertIn("addIVMField", map_source)
        self.assertIn("addCompassRose", map_source)
        self.assertIn("birthByMap", map_source)
        self.assertIn("metricRailRows", map_source)
        self.assertIn("THREE.CanvasTexture", map_source)
        self.assertIn("minAzimuthAngle", map_source)
        self.assertIn("maxAzimuthAngle", map_source)
        self.assertIn("minAzimuthAngle=azimuth-Math.PI/2", map_source)
        self.assertIn("maxAzimuthAngle=azimuth+Math.PI/2", map_source)
        self.assertIn("enablePan=false", map_source)
        self.assertIn("value:format(mean('fertility'),2)", map_source)
        self.assertNotIn("DISPLAYED MEAN", map_source)
        self.assertIn("state.metricRailOrder.push(metric)", map_source)
        self.assertIn("state.metricRailOrder=state.metricRailOrder.filter(item=>item!==metric)", map_source)
        self.assertIn("easeMetricRail", map_source)
        self.assertIn("slideMetricRail", map_source)
        self.assertIn("THREE.MathUtils.lerp", map_source)
        self.assertIn("eased*Math.PI/2", map_source)
        self.assertIn("metricRailGroup.position.set(0,MAP_Y+7,-90)", map_source)
        self.assertNotIn('id="mortality-scale"', page.read_text(encoding="utf-8"))
        totals = {}
        for event in self.data["events"]:
            country = event["country"]
            totals[country] = totals.get(country, 0) + event["fatalities"]["best"]
        self.assertTrue(totals)
        self.assertGreater(max(totals.values()), 0)

    def test_information_architecture_and_shared_map_semantics(self):
        pages = {
            "information.html", "about.html", "method.html", "data-conflict.html",
            "data-governance.html", "data-health.html", "coverage.html", "sources.html",
            "color-legend.html",
        }
        for name in pages:
            page = ROOT / "web" / name
            self.assertTrue(page.exists(), name)
            markup = page.read_text(encoding="utf-8")
            self.assertIn('href="information.html"', markup)
            self.assertIn('href="about.html"', markup)
        about = (ROOT / "web/about.html").read_text(encoding="utf-8")
        self.assertIn("Sid J.A. Hubbard", about)
        self.assertIn("MIT License", about)
        self.assertIn("github.com/SJAH9/war-maps-project", about)
        legend = (ROOT / "web/color-legend.html").read_text(encoding="utf-8")
        self.assertIn("Side A", legend)
        self.assertIn("Side B", legend)
        self.assertIn("#657078", legend)
        self.assertIn("#722b20", legend)

    def test_world_map_joins_health_and_governance_without_extrapolation(self):
        page = (ROOT / "web/index.html").read_text(encoding="utf-8")
        source = (ROOT / "web/app.js").read_text(encoding="utf-8")
        self.assertIn('id="health-layer"', page)
        self.assertIn('min="1980" max="2023"', page)
        self.assertIn('id="transition-toggle"', page)
        self.assertIn("healthByMap", source)
        self.assertIn("regimeAtYear", source)
        self.assertIn("renderRegimeHealth", source)
        network_page = (ROOT / "web/network.html").read_text(encoding="utf-8")
        network_source = (ROOT / "web/network.js").read_text(encoding="utf-8")
        self.assertIn('id="network-locale-map"', network_page)
        self.assertIn("renderLocaleMap", network_source)

    def test_claims_use_recursive_enclosures(self):
        for claim in self.data["claims"]:
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
