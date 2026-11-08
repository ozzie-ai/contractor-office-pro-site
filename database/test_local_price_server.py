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
              "materials":"600","verified":"1","reuse_allowed":"0","license":"owner_created"}
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


    def test_server_access_requires_private_token(self):
        from local_price_server import handler
        from http.server import ThreadingHTTPServer
        from threading import Thread
        from urllib.request import Request, urlopen
        from urllib.error import HTTPError
        server=ThreadingHTTPServer(("127.0.0.1",0),handler("strong-local-test-token-123456789"))
        thread=Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            address="http://127.0.0.1:"+str(server.server_port)
            with self.assertRaises(HTTPError) as denied:
                urlopen(address+"/tasks",timeout=2)
            self.assertEqual(denied.exception.code,401)
            request=Request(address+"/tasks",headers={"Authorization":"Bearer strong-local-test-token-123456789"})
            with urlopen(request,timeout=2) as response:
                import json
                rows=json.load(response)["tasks"]
            self.assertEqual(len(rows),len(TASKS))
        finally:
            server.shutdown()
            thread.join(timeout=3)
            server.server_close()

    def test_sqlite_backup_and_integrity(self):
        from backup_local_database import backup
        backupdir=Path(self.folder.name)/"backups"
        backupdir.mkdir()
        with connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0],len(TASKS))
        saved=backup(str(backupdir))
        import sqlite3
        with sqlite3.connect(saved) as check:
            self.assertEqual(check.execute("PRAGMA integrity_check").fetchone()[0],"ok")
            self.assertEqual(check.execute("SELECT COUNT(*) FROM tasks").fetchone()[0],len(TASKS))

if __name__ == "__main__":
    unittest.main()
