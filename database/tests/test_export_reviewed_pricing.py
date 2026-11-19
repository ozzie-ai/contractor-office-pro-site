"""Safety gates: no unreviewed price is promoted to contractor selling rate."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


SRC = Path(__file__).resolve().parents[1] / "export_reviewed_pricing.py"
spec = importlib.util.spec_from_file_location("cop_export", SRC)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReviewedPricingExporterTests(unittest.TestCase):
    def test_only_final_reviewed_rows_and_preliminary_budgets_are_exported(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "master.sqlite"
            con = sqlite3.connect(path)
            con.executescript("""
                CREATE TABLE approved_unit_rates (
                  id text, task_code text, scope text, location text, unit text,
                  rate real, evidence_json text, reviewer text, approved_date text
                );
                CREATE TABLE cop_budget_benchmarks (
                  id text, name text, trade text, unit text, locality text,
                  low real, high real, scope text, exclusions text,
                  approved_use text, status text, reviewer text, reviewed_date text
                );
            """)
            con.executemany(
                "INSERT INTO approved_unit_rates VALUES (?,?,?,?,?,?,?,?,?)",
                [
                    ("r1", "outlet.standard", "Existing 1-gang", "LA", "each", 90,
                     '["sample-observation"]', "Reviewer", "2026-11-15"),
                    ("r2", "outlet.gfci", "Existing 1-gang", "LA", "each", 99,
                     '["sample-observation"]', "", "2026-11-15"),
                    ("r3", "outlet.gfci", "Existing 1-gang", "LA", "each", 199,
                     '[]', "Reviewer", "2026-11-15"),
                ],
            )
            con.executemany(
                "INSERT INTO cop_budget_benchmarks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [
                    ("b1", "Drywall planning", "Drywall", "sf", "National", 2, 5,
                     "General hanging", "Repairs", "Preliminary", "approved_for_preliminary_budget",
                     "Reviewer", "2026-11-15"),
                    ("b2", "Old budget", "Plumbing", "each", "National", 100, 250,
                     "Old scope", "Materials", "Preliminary", "needs_source_refresh",
                     "Reviewer", "2026-11-15"),
                ],
            )
            con.commit()
            con.close()
            result = module.export_reviewed(path)
            self.assertEqual(result["selling_rate_count"], 1)
            self.assertEqual(result["rejected_selling_rows"], 2)
            self.assertEqual(result["preliminary_budget_count"], 1)
            self.assertEqual(result["reviewed_selling_rates"][0]["task_code"], "outlet.standard")
            self.assertEqual(result["preliminary_budget_ranges"][0]["use"],
                             "preliminary_budget_range_only_not_a_customer_unit_price")
            self.assertFalse(result["selling_prices_auto_approved"])
            self.assertFalse(result["automated_cloud_upload"])

    def test_missing_approval_tables_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "empty.sqlite"
            sqlite3.connect(path).close()
            with self.assertRaises(ValueError):
                module.export_reviewed(path)


if __name__ == "__main__":
    unittest.main()
