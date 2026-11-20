import tempfile
import unittest
from pathlib import Path
from bs4 import BeautifulSoup
from src.neutrality_footer import generate, insert


class NeutralityFooterTests(unittest.TestCase):
    def test_rebuild_is_idempotent_and_preserves_existing_footer(self):
        soup = BeautifulSoup('<html><head></head><body><footer>Existing credits</footer></body></html>', 'html.parser')
        insert(soup)
        insert(soup)
        self.assertEqual(len(soup.select('.neutrality-footer')), 1)
        self.assertEqual(len(soup.select('#neutrality-footer-style')), 1)
        self.assertIn('Existing credits', soup.get_text())
        self.assertFalse(soup.select_one('.neutrality-footer details').has_attr('open'))
        self.assertIn('not an intelligence product or a tactical data source', soup.get_text())

    def test_fullscreen_view_has_reachable_footer(self):
        soup = BeautifulSoup('<html><head></head><body><div id="navigator"></div></body></html>', 'html.parser')
        insert(soup)
        self.assertIsNotNone(soup.select_one('.neutrality-overlay details summary'))

    def test_nested_pages_link_to_root_source_register(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'player').mkdir()
            page = root/'player/index.html'
            page.write_text('<html><head></head><body>Player</body></html>')
            generate(root)
            soup = BeautifulSoup(page.read_text(), 'html.parser')
            self.assertEqual(soup.select_one('[data-source-register]')['href'], '../sources.html')
