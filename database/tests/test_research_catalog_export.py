"""Reproducible, read-only research export gate (no cloud credentials required)."""
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

EXPORTER = Path(__file__).resolve().parents[2] / 'database' / 'export_research_catalog.py'


class ResearchImportTests(unittest.TestCase):
    def test_export_keeps_unreviewed_rates_out_of_customer_quotes(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            db = folder / 'master.sqlite'
            con = sqlite3.connect(db)
            con.execute('''CREATE TABLE cop_service_pricebook (
              id TEXT, trade TEXT, service TEXT, unit TEXT, locality TEXT, low REAL,
              high REAL, planning_rate REAL, method TEXT, status TEXT, cost_basis TEXT,
              scope TEXT, exclusions TEXT, source_date TEXT, checked_date TEXT,
              evidence_json TEXT, budget_usable INTEGER, automatic_final_quote INTEGER)''')
            con.execute('''CREATE TABLE cop_supplier_price_references (
              id TEXT, source_id TEXT, service TEXT, locality TEXT, unit TEXT,
              currency TEXT, low REAL, high REAL, price_kind TEXT, scope_json TEXT,
              source_locator TEXT, checked_date TEXT, review_status TEXT)''')
            con.execute('CREATE TABLE approved_unit_rates (id TEXT)')
            con.execute('''INSERT INTO cop_service_pricebook
              (id, trade, service, unit, locality, low, high, method, status,
               cost_basis, scope, checked_date, budget_usable, automatic_final_quote)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              ('ID-1', 'Plumbing', "O'Brien toilet repair", 'each', 'Los Angeles', 40, 120,
               'contractor model', 'planning', 'labor', 'Existing line', '2026-11-16', 1, 1))
            con.execute('''INSERT INTO cop_supplier_price_references
              (id, service, locality, unit, currency, low, high, review_status)
              VALUES (?,?,?,?,?,?,?,?)''',
              ('SUP-1', 'Sink faucet', 'Los Angeles', 'each', 'USD', 30, 60, 'needs_review'))
            con.commit(); con.close()
            before = hashlib.sha256(db.read_bytes()).hexdigest()
            out = folder / 'export'
            subprocess.run([sys.executable, str(EXPORTER), '--db', str(db),
                            '--out-dir', str(out)], check=True, capture_output=True, text=True)
            self.assertEqual(before, hashlib.sha256(db.read_bytes()).hexdigest())
            manifest = json.loads((out / 'cop_research_import_manifest.json').read_text())
            self.assertEqual(manifest['service_records'], 1)
            self.assertEqual(manifest['supplier_records'], 1)
            self.assertEqual(manifest['auto_final_selling_rates'], 0)
            self.assertEqual(manifest['approved_unit_rates'], 0)
            sql = (out / 'cop_research_batch_01.sql').read_text()
            self.assertIn("O''Brien", sql)
            self.assertIn("'market_reference',TRUE,FALSE)", sql)
            self.assertIn("'reference_only',FALSE,FALSE)", sql)
            self.assertNotIn('DROP TABLE', sql)
            self.assertTrue(sql.rstrip().endswith('ON CONFLICT (reference_id) DO NOTHING;'))


if __name__ == '__main__':
    unittest.main()