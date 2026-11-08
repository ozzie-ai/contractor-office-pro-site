import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from local_price_server import connect, db_path, process_row, reference, TASKS

class LocalPricingTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.environment=patch.dict(os.environ,{"COP_DATA_DIR":self.folder.name})
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.folder.cleanup()

    def test_create_local_catalog_without_invented_rates(self):
        with connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM tasks").fetchone()[0],len(TASKS))
            self.assertEqual(db.execute("SELECT count(*) FROM observations").fetchone()[0],0)
            self.assertFalse(reference(db,"ELEC.PANEL.UPGRADE","US-CA-LA")["found"])
        self.assertTrue(db_path().exists())

    def test_reject_restricted_or_invalid_data(self):
        base={"task_code":"ELEC.PANEL.UPGRADE","region":"US-CA-LA",
              "observed_on":"2026-11-08","source_name":"Internal",
              "materials":"600","verified":"1","reuse_allowed":"0"}
        with self.assertRaisesRegex(ValueError,"permission"):
            process_row(base)
        base["reuse_allowed"]="1"
        row=process_row(base)
        self.assertEqual(row["materials"],600)
        self.assertEqual(row["verified"],1)

    def test_reference_distinguishes_partial_cost_and_bid(self):
        with connect() as db:
            db.execute("""INSERT INTO observations
                (task_code,region,observed_on,benchmark_bid,source_name,reuse_allowed,verified,created_utc)
                VALUES (?,?,?,?,?,?,?,?)""",
                ("ELEC.PANEL.UPGRADE","US-CA-LA","2026-11-08",1800,"Internal",1,1,"2026-11-08T00:00:00Z"))
            r=reference(db,"ELEC.PANEL.UPGRADE","US-CA-LA")
            self.assertTrue(r["found"])
            self.assertIsNone(r["direct_cost"])
            self.assertEqual(r["benchmark_bid"],1800)
            self.assertFalse(reference(db,"ELEC.PANEL.UPGRADE","US-ID")["found"])

if __name__ == "__main__":
    unittest.main()
