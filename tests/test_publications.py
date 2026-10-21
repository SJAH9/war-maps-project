import io
import json
import unittest
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from src.generate_publications import ROOT, SELECTION, fit_page, connected_poster, frontmatter
from src.generate_network_print import fonts
from src.publication_brand import SITE,REPO
from src.generate_death_circle import circle_points


class PublicationTests(unittest.TestCase):
    def test_selection_excludes_withheld_documents(self):
        selection=json.loads(SELECTION.read_text())
        self.assertEqual(len(selection['pdfs']),12)
        self.assertFalse(any('ephemeris' in s or s=='war-networks.pdf' or s=='war-maps-conflict-networks-2026.pdf' for s in selection['pdfs']))
        for source in selection['pdfs'].values():self.assertTrue((ROOT/source).exists())

    def test_scaled_page_keeps_content_and_qr_links(self):
        fonts();buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=(1296,1728));c.drawString(100,100,'Test source');c.showPage();c.save()
        poster=connected_poster(PdfReader(buf).pages[0]);page=fit_page(poster,612,792)
        self.assertIn('The War Maps Project',poster.extract_text())
        self.assertIn('Test source',poster.extract_text())
        self.assertEqual(tuple(map(float,page.mediabox[2:])),(612,792))
        urls={a.get_object()['/A']['/URI'] for a in page['/Annots']}
        self.assertTrue({SITE,REPO}<=urls)
        for a in page['/Annots']:
            rect=list(map(float,a.get_object()['/Rect']))
            self.assertTrue(0<=rect[0]<rect[2]<=612)
            self.assertTrue(0<=rect[1]<rect[3]<=792)

    def test_about_sources_in_frontmatter(self):
        fonts();data=frontmatter(json.loads(SELECTION.read_text()))
        content=' '.join(p.extract_text() for p in PdfReader(io.BytesIO(data)).pages)
        for expected in ('Origins and purpose','Principal Investigator','Uppsala Conflict Data Program','Varieties of Democracy','Partial offline access'):
            self.assertIn(expected,content)

    def test_circle_exact_count_sorted_and_unique(self):
        p=circle_points(55700)
        self.assertEqual(len(p),55700);self.assertEqual(len(set(p)),55700)
        self.assertEqual(p,sorted(p,key=lambda point:(-point[1],point[0])))

    def test_mobile_shell_scope(self):
        manifest=json.loads((ROOT/'web/manifest.webmanifest').read_text())
        self.assertEqual(manifest['scope'],'./');self.assertEqual(manifest['display'],'standalone')
        for icon in manifest['icons']:self.assertTrue((ROOT/'web'/icon['src']).exists())
