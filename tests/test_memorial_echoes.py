import unittest
from src.generate_memorial_echoes import death_groups


class MemorialCountsTests(unittest.TestCase):
    def test_sides_not_location_or_nationality(self):
        r=dict(side_a='Government of Ukraine',side_b='Government of Russia (Soviet Union)',
               deaths_a='2',deaths_b='3',deaths_civilians='4',deaths_unknown='1',best='10',country='Ukraine')
        self.assertEqual(death_groups(r),dict(ukrainian_side=2,russian_side=3,unattributed=5))

    def test_unrecognized_side_is_unattributed(self):
        self.assertEqual(death_groups(dict(side_a='Other',deaths_a='2',best='2'))['unattributed'],2)

    def test_inconsistent_total_rejected(self):
        with self.assertRaises(ValueError):death_groups(dict(best='2',deaths_unknown='1'))
