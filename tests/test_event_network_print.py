import unittest
from src.generate_event_network_print import compile_events, mortality, partition
from tests.test_network_print import event
from unittest.mock import patch
from src.conflict_networks import compile_networks, top_ten_mortality
from src.generate_event_network_print import render_large_five, fonts
import gzip
import json
import tempfile
from pathlib import Path
from pypdf import PdfReader


class EventPosterTests(unittest.TestCase):
    def test_large_five_preserves_ranked_records_and_poster_size(self):
        rows=[event(f'{i}-{j}',2026,conflict=str(i)) for i in range(7) for j in range(i+1)]
        groups=compile_events(rows,2026)
        fonts()
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            render_large_five(groups,out)
            payload=json.loads(gzip.decompress((out/'maps-5-large-event-networks-2026.json.gz').read_bytes()))
            self.assertEqual(payload['conflicts'],groups[:5])
            self.assertEqual(payload['event_count'],25)
            pdf=PdfReader(out/'maps-5-large-event-networks-2026.pdf')
            self.assertEqual(len(pdf.pages),1)
            self.assertEqual(tuple(pdf.pages[0].mediabox),(0,0,1296,1728))

    def test_mortality_ranking_uses_all_years_without_quality_filter(self):
        rows=[dict(event("old",1990,conflict="1"),best="100"),
              dict(event("new",2026,conflict="1"),best="3"),
              dict(event("other",2026,conflict="2"),best="50")]
        with patch("src.conflict_networks.event_rows",return_value=iter(rows)):
            ranked=top_ten_mortality(compile_networks({"conflict_years":[]}))
        self.assertEqual([g["deaths_best"] for g in ranked],[103,50])
        self.assertFalse(ranked[0]["eligible"])

    def test_filter_mortality_and_endpoints(self):
        old = event("old",1990)
        new = dict(event("new",2026),best="3",_source="ucdp-candidate-26")
        other = dict(event("other",2026,typ="2"),best="0")
        groups = compile_events([old,new,other],2026)
        self.assertEqual(sum(len(g["events"]) for g in groups),2)
        self.assertEqual(len(groups),2)
        self.assertEqual(len(compile_events([old,new,other])[0]["events"]),2)
        e = next(e for g in groups for e in g["events"] if e["id"]=="new")
        self.assertEqual(e["best"],3)
        self.assertEqual(e["sides"],["Government of Example","Group B"])
        self.assertEqual(e["nation"],"Example")
        self.assertIsNone(mortality(old))
        self.assertEqual(mortality(other),0)

    def test_partition_retains_every_conflict(self):
        groups=compile_events([event(str(i),2026,conflict=str(i)) for i in range(31)])
        tiles=partition(groups,(0,0,1200,1000))
        self.assertEqual(len(tiles),31)
        self.assertAlmostEqual(sum(w*h for _,(_,_,w,h) in tiles),1200000)
        self.assertTrue(all(w>0 and h>0 for _,(_,_,w,h) in tiles))
