import json
import unittest
from pathlib import Path
from src.generate_drone_layer import selected

class DroneLayerTests(unittest.TestCase):
    def test_selection(self):
        self.assertTrue(selected({'attackType':'drone','title':'Iranian drone strike','summary':''}))
        for attack,title in [('missile','Iran missile strike'),('mixed_wave','Iran missile and drone strike'),('drone','Iran-backed Houthi drone strike'),('drone','Suspected Iranian drone strike')]:
            self.assertFalse(selected({'attackType':attack,'title':title,'summary':''}))
    def test_snapshot(self):
        d=json.loads((Path(__file__).resolve().parents[1]/'web/assets/drone-event-layer.json').read_text())
        self.assertEqual(d['license'],'CC BY 4.0')
        self.assertEqual(len({r['id'] for r in d['incidents']}),len(d['incidents']))
        self.assertTrue(all(selected(r) and r['primaryArticleUrl'].startswith('https://') for r in d['incidents']))
