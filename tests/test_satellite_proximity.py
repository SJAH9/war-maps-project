import unittest
from datetime import datetime,timedelta
from bs4 import BeautifulSoup
from src.generate_satellite_proximity import build,epoch
from src.homepage_carousel import insert
class SatelliteProximityTests(unittest.TestCase):
 def test_snapshot_cutoff_and_month(self):
  d=build();end=datetime.fromisoformat(d['end']);start=datetime.fromisoformat(d['start'])
  self.assertEqual(end-start,timedelta(days=30))
  self.assertEqual(end,min(epoch(o['elements']['EPOCH']) for o in d['objects']))
  self.assertEqual({o['elements']['OBJECT_NAME'] for o in d['objects']},{'ICEYE-X36','COSMOS 2612'})
  self.assertIn('Not an observed position history',d['method'])
 def test_carousel_is_repeatable_and_accessible(self):
  soup=BeautifulSoup('<html><head></head><body><main><h1>War Maps</h1></main></body></html>','html.parser')
  insert(soup);insert(soup)
  self.assertEqual(len(soup.select('#view-carousel')),1)
  self.assertEqual(len(soup.select('.view-slide')),4)
  self.assertEqual(len(soup.select('.view-slide:not([hidden])')),1)
  self.assertEqual(len(soup.select('button[data-view-index]')),4)
  self.assertEqual(len(soup.select('script[src="homepage-carousel.js"]')),1)
