"""Research-only import safety tests with tiny synthetic tables (no owner data)."""
import hashlib
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'export_research_staging.py'
spec = importlib.util.spec_from_file_location('research_exporter', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ResearchCatalogExportTests(unittest.TestCase):
    def fixture(self, path: Path):
        con = sqlite3.connect(path)
        con.executescript('''
            create table approved_unit_rates(id text);
            create table cop_service_pricebook(
              id text,trade text,service text,unit text,locality text,
              low real,high real,planning_rate real,method text,status text,
              cost_basis text,scope text,exclusions text,checked_date text,
              budget_usable integer,automatic_final_quote integer);
            create table cop_supplier_price_references(
              id text,service text,locality text,unit text,currency text,
              low real,high real,price_kind text,review_status text,checked_date text);
        ''')
        con.executemany('insert into cop_service_pricebook values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
          ('R1','Plumbing',"O'Brien's toilet repair",'each','LA',20,50,None,'average','review','labor',
           'Existing position','Fixtures excluded','2026-11-16',1,0),
          ('R2','Electrical','Missing source amounts','hour','LA',None,None,None,'','', 'labor',
           'Investigate','Unknown', '2026-11-16',1,0),
          ('R3','Painting','','job','LA',10,20,None,'','','','','','2026-11-16',1,0),
        ])
        con.executemany('insert into cop_supplier_price_references values (?,?,?,?,?,?,?,?,?,?)',[
          ('P1','Mini skid steer rental','LA','day','USD',200,300,'rental','verified','2026-11-16'),
          ('P2','Foreign currency quotation','BC','week','CAD',100,150,'rental','review','2026-11-16'),
        ])
        con.commit();con.close()

    def test_export_preserves_master_and_never_approves_selling_price(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'master.sqlite';dest=Path(tmp)/'out'
            self.fixture(source)
            digest=lambda:hashlib.sha256(source.read_bytes()).hexdigest()
            before=digest()
            result=module.export_research(source,dest,batch_size=3)
            self.assertEqual(before,digest(), 'master must not be written to')
            self.assertEqual(result['total_rows'],4)
            self.assertEqual(result['service_records'],2)
            self.assertEqual(result['supplier_records'],2)
            self.assertEqual(result['budget_usable_service_refs'],1)
            self.assertEqual(result['auto_final_selling_rates'],0)
            self.assertEqual(result['batches'],2)
            sql='\n'.join(p.read_text() for p in sorted(dest.glob('cop_research_batch_*.sql')))
            self.assertIn("O''Brien''s",sql)
            self.assertIn("'service:R2'",sql)
            self.assertIn("'supplier:P2'",sql)
            self.assertIn("'service:R2','service_market'",sql)
            self.assertNotIn('service:R3',sql)
            self.assertIn('FALSE,FALSE',sql)

    def test_missing_schema_or_invalid_batch_size_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'empty.sqlite';sqlite3.connect(source).close()
            with self.assertRaises(ValueError):module.export_research(source,Path(tmp)/'out')
            with self.assertRaises(ValueError):module.export_research(source,Path(tmp)/'out',batch_size=0)


if __name__=='__main__':unittest.main()