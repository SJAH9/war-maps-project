import json
import unittest

from src.refresh_sources import validate_csv, validate_wb


class RefreshValidationTests(unittest.TestCase):
    def test_csv_rejects_error_page_and_empty_file(self):
        for data in (b'<html>Error</html>', b'id,date_start,date_end\n'):
            with self.assertRaises(ValueError):
                validate_csv(data, ['id', 'date_start', 'date_end'])

    def test_csv_accepts_source_schema(self):
        validate_csv(b'id,date_start,date_end\n1,2026-01-01,2026-01-02\n', ['id', 'date_start', 'date_end'])

    def test_world_bank_requires_complete_response(self):
        validate_wb(json.dumps([{'pages': 1}, [{'value': 5}]]).encode())
        for data in ([{'pages': 2}, [{'value': 5}]], [{'pages': 1}, []], {'error': 'unavailable'}):
            with self.assertRaises(ValueError):
                validate_wb(json.dumps(data).encode())
