import json
import unittest
from pathlib import Path
from src.generate_hormuz_terrain import decode, pixel

class TerrainTests(unittest.TestCase):
    def test_terrarium(self):
        self.assertEqual(decode((128,0,0)),0)
        self.assertAlmostEqual(decode((137,219,68)),2523.265625)
    def test_north_is_lower_pixel_y(self):
        self.assertLess(pixel(56,30)[1],pixel(56,22)[1])
    def test_grid(self):
        d=json.loads((Path(__file__).resolve().parents[1]/'web/assets/hormuz-terrain.json').read_text())
        self.assertEqual(len(d['metres']),d['width']*d['height'])
        self.assertEqual(d['bounds'],[40,10,61,30])
        self.assertEqual((d['width'],d['height']),(421,401))
        self.assertGreater(max(d['metres']),3000)
        self.assertTrue(all(-11000<v<9000 for v in d['metres']))
