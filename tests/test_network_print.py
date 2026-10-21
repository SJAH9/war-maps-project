import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.conflict_networks import active_in, add_actor, compile_networks, top_five
import networkx as nx
from src.generate_war_ephemeris import digest, records
from src.restore_ephemeris import verify


def event(identifier,year,typ="1",conflict="42"):
    return dict(id=identifier,date_start=f"{year}-01-01",date_end=f"{year}-01-02",
                type_of_violence=typ,conflict_new_id=conflict,conflict_name="Example",
                side_a="Government of Example",side_b="Group B",country="Example",
                adm_1="North",source_headline="A source",_source="ucdp-ged-26.1")


class NetworkPrintTests(unittest.TestCase):
    def test_civilians_are_not_one_global_actor(self):
        graph=nx.Graph()
        a=add_actor(graph,"Civilians","Country A")
        b=add_actor(graph,"Civilians","Country B")
        self.assertNotEqual(a,b)
        self.assertEqual(graph.nodes[a]["kind"],"Civilian category")

    def test_interval_overlap(self):
        self.assertTrue(active_in(dict(date_start="2025-12-31",date_end="2026-01-02"),2026))
        self.assertFalse(active_in(event("a",2025),2026))
        self.assertFalse(active_in(dict(date_start="",date_end=""),2026))

    def test_lifetime_and_type_safe_annual_join(self):
        rows=[event("old",1990),event("new",2026),event("other-type",2026,"2")]
        annual=dict(conflict_id="ucdp-42",year=1960,side_a="Government of Example",
                    side_b="Group B",side_a_secondary=["Government of Ally"],side_b_secondary=[])
        with patch("src.conflict_networks.event_rows",return_value=iter(rows)):
            models=compile_networks({"conflict_years":[annual]})
        a=next(m for m in models if m["key"]==["1","42"])
        b=next(m for m in models if m["key"]==["2","42"])
        self.assertEqual(set(a["years"]),{1960,1990,2026})
        self.assertEqual(a["event_ids"],["old","new"])
        self.assertEqual(a["annual"],1)
        self.assertEqual(b["annual"],0)
        self.assertEqual(b["event_ids"],["other-type"])
        self.assertEqual(a["complete"],2)
        self.assertFalse(any(n.startswith("conflict:") for n in a["graph"]))
        self.assertEqual(a["graph"]["actor:Government of Example"]["actor:Group B"]["counts"],
                         {"coded sides":2,"annual coded sides":1})

    def test_poster_ranking_not_restricted_to_2026(self):
        models=[dict(key=["1",str(i)],score=i,eligible=True,active_2026=False) for i in range(7)]
        self.assertEqual([m["score"] for m in top_five(models)],[6,5,4,3,2])
        self.assertEqual(top_five([dict(key=["1","99"],score=100,eligible=False)]),[])

    def test_table_preserves_unknowns_and_full_arrays(self):
        obj={"items":[{"value":None,"zero":0,"series":list(range(200))}]}
        result=list(records(obj))
        self.assertEqual(result,[("$.items[0]",obj["items"][0])])
        chunks=list(records(list(range(205))))
        self.assertEqual([v for _,chunk in chunks for v in chunk],list(range(205)))

    def test_capsule_hash_verification(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);blob=b"recover me"
            (root/"input.json").write_bytes(blob)
            (root/"MANIFEST.json").write_text(json.dumps({"format":"war-maps-recovery-1","files":[
                {"path":"input.json","bytes":len(blob),"sha256":digest(blob)}]}))
            self.assertEqual(verify(root),1)
            (root/"input.json").write_bytes(b"tampered")
            with self.assertRaises(ValueError):verify(root)


if __name__=="__main__":
    unittest.main()
