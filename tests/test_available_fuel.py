import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from src.refresh_available_fuel import refresh, parse


class AvailableFuelTests(unittest.TestCase):
    def test_missing_sources_and_invalid_prices_preserve_rows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'docs').mkdir()
            output = root/'fuel.js'
            row = dict(source='aaa', name='Test', date='2026-10-16', gasoline=3, currency='USD')
            payload = dict(observations=[row], source_updates={
                'accc': {'observation_date': '2026-10-14'},
                'nz': {'observation_date': '2026-09-27'}},
                fx_date='2026-10-16', taiwan_fx_date='2026-10-16',
                usd_per_eur=1.1, currency_per_eur={'USD': 1.1, 'TWD': 35})
            output.write_text('window.GAS_PRICE_DATA='+json.dumps(payload)+';\n')
            with patch('src.refresh_available_fuel.ROOT', root), patch(
                'src.refresh_available_fuel.parse', return_value=('2026-10-19', {'Test': {'gasoline': float('nan')}})):
                refresh(root, '2026-10-19', output)
            result = json.JSONDecoder().raw_decode(output.read_text().split('=', 1)[1])[0]
            self.assertEqual(result['observations'], [row])
            self.assertEqual(result['fx_date'], '2026-10-16')
            self.assertEqual(result['refresh_audit'][0]['status'], 'retained')

    def test_taiwan_selects_latest_complete_schedule(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'taiwan.html').write_text('<table><tr><td>2026/10/19</td><td>31.2</td><td>32.7</td><td>34.7</td><td>29.9</td></tr><tr><td>2026/10/20</td><td></td><td></td><td></td><td></td></tr></table>')
            dated, prices = parse('taiwan', root)
            self.assertEqual(dated, '2026-10-19')
            self.assertEqual(prices['Taiwan (CPC schedule)'], dict(gasoline=31.2, diesel=29.9))
