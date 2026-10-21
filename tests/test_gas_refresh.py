import unittest
from src.refresh_gas_prices import tax_breakdown, australian_tables

class FuelRefreshTests(unittest.TestCase):
    def test_tax_difference_and_validation(self):
        value=tax_breakdown(2.5,1.4,"published","source","2026-10-12")
        self.assertAlmostEqual(value["amount"],1.1)
        self.assertEqual(value["pre_tax"],1.4)
        for net in [-1,3]:
            with self.assertRaises(ValueError):tax_breakdown(2.5,net,"published","source","2026-10-12")

    def test_australian_column_is_latest_not_change(self):
        text="""Table 6 – Daily average retail petrol prices
Sydney 165.2 257.4 238.9 242.4 77.2 -15.0 3.5
Victoria
Sale* 170.0 250.0 230.0 240.0 70.0 -10.0 10.0
Table 7 – Daily average retail regular diesel prices
Sydney 174.3 321.8 280.4 277.8 103.5 -44.0 -2.6
"""
        rows=australian_tables(text)
        self.assertEqual(rows["Sydney"],{"gasoline":2.424,"diesel":2.778})
        self.assertEqual(rows["Sale, Victoria"]["gasoline"],2.4)
