import unittest
from src.generate_iran_drones import include

class DroneSelectionTests(unittest.TestCase):
    def row(self, attack, title, summary=''):
        return {'attackType': attack, 'title': title, 'summary': summary}
    def test_explicit_state_drone(self):
        self.assertTrue(include(self.row('drone', 'Iranian drones target a power plant')))
    def test_missile_only_excluded(self):
        self.assertFalse(include(self.row('missile', 'Iranian missiles target a power plant')))
    def test_proxy_excluded(self):
        self.assertFalse(include(self.row('drone', 'Iran-backed Houthis claim drone strike')))
    def test_unknown_actor_excluded(self):
        self.assertFalse(include(self.row('drone', 'Drone strike at airport')))
    def test_suspected_excluded(self):
        self.assertFalse(include(self.row('drone', 'Suspected Iranian drone strike')))
