import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ConflictSidesShareTests(unittest.TestCase):
    def test_conflict_share_permalink_and_preview_metadata(self):
        page = (ROOT / "web/conflict-sides.html").read_text(encoding="utf-8")
        source = (ROOT / "web/conflict-sides.js").read_text(encoding="utf-8")

        self.assertIn('id="share-view"', page)
        self.assertIn('property="og:image"', page)
        self.assertIn("conflict-sides-preview.png", page)
        self.assertIn("navigator.share", source)
        self.assertIn("navigator.clipboard", source)
        self.assertIn("url.searchParams.set('conflict',active)", source)
        self.assertIn("initialParams.get('conflict')", source)

    def test_social_preview_is_a_1200_by_630_png(self):
        preview = ROOT / "web/assets/share/conflict-sides-preview.png"
        self.assertTrue(preview.exists())
        with preview.open("rb") as handle:
            self.assertEqual(handle.read(8), b"\x89PNG\r\n\x1a\n")
            length = struct.unpack(">I", handle.read(4))[0]
            self.assertEqual(handle.read(4), b"IHDR")
            width, height = struct.unpack(">II", handle.read(8))
        self.assertGreaterEqual(length, 13)
        self.assertEqual((width, height), (1200, 630))


if __name__ == "__main__":
    unittest.main()
