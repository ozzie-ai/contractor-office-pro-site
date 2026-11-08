#!/usr/bin/env python3
"""Free local Contractor Office Pro price database. Python standard library only.

Commands:
  python3 database/local_price_server.py init
  python3 database/local_price_server.py import-csv path/to/prices.csv
  python3 database/local_price_server.py serve
SQLite file defaults to ~/ContractorOfficeProData/prices.sqlite3.
Set COP_DATA_DIR to place it on your external drive. 127.0.0.1 only by default.
"""
import argparse
import csv
import json
import hmac
import ipaddress
import secrets
import os
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DEFAULT_PATH = Path.home() / "ContractorOfficeProData"
TASKS = [
 ("ELEC.PANEL.UPGRADE","electrical","Electrical panel/service upgrade","Actualización del panel eléctrico","job"),
 ("ELEC.CIRCUIT.TRANSFER","electrical","Transfer existing branch circuit","Transferir circuito existente","each"),
 ("ELEC.BREAKER.ONLY","electrical","Install breaker only, no wiring","Instalar solamente breaker, sin cableado","each"),
 ("ELEC.PERMIT","electrical","Electrical permit allowance","Permiso eléctrico","job"),
 ("ELEC.RECESSED.LIGHT","electrical","Install recessed ceiling light","Instalar luz empotrada","each"),
 ("ELEC.GFCI","electrical","Install GFCI receptacle","Instalar tomacorriente GFCI","each"),
 ("PLUMB.FAUCET.REPLACE","plumbing","Replace existing faucet","Reemplazar grifo","each"),
 ("PAINT.INTERIOR.SF","painting","Interior painting","Pintura interior","sq ft"),
 ("CONCRETE.SLAB.CY","concrete","Place concrete slab","Colocar losa de concreto","cu yd"),
 ("HANDY.GENERAL.HR","handyman","General handyman labor","Trabajos varios","hr"),
 ("REMODEL.BATH.JOB","remodel","Bathroom renovation scope review","Revisión de remodelación de baño","job"),
 ("CLEAN.RESIDENTIAL.SF","cleaning","Residential cleaning area","Área de limpieza residencial","sq ft"),
]
SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS tasks (
 code TEXT PRIMARY KEY, trade TEXT NOT NULL, name_en TEXT NOT NULL,
 name_es TEXT NOT NULL, unit TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_code TEXT NOT NULL REFERENCES tasks(code),
 region TEXT NOT NULL, observed_on TEXT NOT NULL,
 labor_hours REAL, hourly_wage REAL, burden_factor REAL,
 materials REAL, equipment REAL, other_cost REAL,
 benchmark_bid REAL,
 source_name TEXT NOT NULL, source_url TEXT, license TEXT,
 reuse_allowed INTEGER NOT NULL DEFAULT 0,
 verified INTEGER NOT NULL DEFAULT 0,
 notes TEXT,
 created_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS obs_by_task_region ON observations(task_code,region,observed_on DESC);
"""
COLUMNS = ["task_code","region","observed_on","labor_hours","hourly_wage",
           "burden_factor","materials","equipment","other_cost","benchmark_bid",
           "source_name","source_url","license","reuse_allowed","verified","notes"]
NUMERIC = {"labor_hours","hourly_wage","burden_factor","materials","equipment","other_cost","benchmark_bid"}
BOOLS = {"reuse_allowed","verified"}

def db_path():
    return Path(os.environ.get("COP_DATA_DIR", str(DEFAULT_PATH))).expanduser() / "prices.sqlite3"

def connect():
    path = db_path()
    if str(path).startswith("/Volumes/"):
        pieces=path.parts
        if len(pieces)<4 or not os.path.ismount(str(Path(*pieces[:3]))):
            raise RuntimeError("External disk is not mounted; refusing to use a fake drive folder.")
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(SCHEMA)
    db.executemany("INSERT OR IGNORE INTO tasks VALUES (?,?,?,?,?)", TASKS)
    db.commit()
    return db

def number(value, field):
    if value is None or str(value).strip() == "":
        return None
    result = float(value)
    if result < 0 or not (result < float("inf")):
        raise ValueError(field + " must be a finite, nonnegative number")
    if field == "burden_factor" and result < 1:
        raise ValueError("burden_factor must be at least 1")
    return result

def process_row(raw):
    row = {key: (raw.get(key) or "").strip() for key in COLUMNS}
    for k in ("task_code","region","observed_on","source_name"):
        if not row[k]:
            raise ValueError(k+" is required")
    datetime.strptime(row["observed_on"], "%Y-%m-%d")
    for k in NUMERIC:
        row[k] = number(row[k], k)
    if all(row[k] is None for k in NUMERIC - {"burden_factor"}):
        raise ValueError("At least one cost or benchmark is required")
    for k in BOOLS:
        if row[k] not in ("0","1"):
            raise ValueError(k+" must be 0 or 1")
        row[k] = int(row[k])
    # Only save records we have a documented right to reuse.
    if row["verified"] and not (row["license"] or row["source_url"]):
        raise ValueError("verified data requires license or source URL")
    if not row["reuse_allowed"]:
        raise ValueError("Import requires explicit commercial reuse permission (reuse_allowed=1)")
    row["created_utc"] = datetime.now(timezone.utc).isoformat()
    return row

def import_csv(file_name):
    with connect() as db, open(file_name, newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or not set(COLUMNS).issubset(set(reader.fieldnames)):
            raise ValueError("CSV requires columns: " + ", ".join(COLUMNS))
        count = 0
        for line_no, raw in enumerate(reader, start=2):
            try:
                row = process_row(raw)
                db.execute("INSERT INTO observations (" + ",".join(COLUMNS) + ",created_utc) VALUES (" +
                           ",".join(["?"]*17) + ")", [row[k] for k in COLUMNS] + [row["created_utc"]])
                count += 1
            except Exception as exc:
                raise ValueError(f"CSV line {line_no}: {exc}") from exc
        print(f"Imported {count} independently licensed/owner-entered observations into {db_path()}")

def reference(db, task, region):
    # Exact region only; never claim an unmatched region has an accurate local price.
    items = db.execute(
      """SELECT o.*,t.name_en,t.name_es,t.unit FROM observations o
         JOIN tasks t ON t.code=o.task_code
         WHERE o.task_code=? AND o.region=? AND o.verified=1 AND o.reuse_allowed=1
         ORDER BY o.observed_on DESC,o.id DESC LIMIT 1""", (task,region)).fetchall()
    if not items:
        return {"task_code":task,"region":region,"found":False,
                "message":"No verified licensed local price. Enter contractor costs or import approved data."}
    o=dict(items[0])
    fields=("labor_hours","hourly_wage","burden_factor")
    labor = (o["labor_hours"]*o["hourly_wage"]*o["burden_factor"]
             if all(o[k] is not None for k in fields) else None)
    comps=[labor,o["materials"],o["equipment"],o["other_cost"]]
    complete = all(x is not None for x in comps)
    cost = round(sum(comps),2) if complete else None
    return {"task_code":task,"region":region,"found":True,
            "name_en":o["name_en"],"name_es":o["name_es"],"unit":o["unit"],
            "direct_cost":cost,"cost_complete":complete,
            "benchmark_bid":o["benchmark_bid"],
            "observed_on":o["observed_on"],"source_name":o["source_name"],
            "source_url":o["source_url"],"license":o["license"],
            "notes":o["notes"],"rate_is_not_customer_quote":True}

def handler(token=None):
    if token is None:
        token=os.environ.get("COP_LOCAL_API_TOKEN","").strip()
    class Handler(BaseHTTPRequestHandler):
        def respond(self, code, payload):
            body=json.dumps(payload,ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type","application/json; charset=utf-8")
            self.send_header("Content-Length",str(len(body)))
            self.send_header("Cache-Control","no-store")
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            supplied=self.headers.get("Authorization","")
            if token and not hmac.compare_digest(supplied,"Bearer "+token):
                return self.respond(401,{"error":"Authorization required"})
            u=urlparse(self.path)
            if u.path == "/health":
                return self.respond(200,{"ok":True,"storage":str(db_path()),"mode":"local"})
            if u.path == "/tasks":
                with connect() as db:
                    return self.respond(200,{"tasks":[dict(x) for x in db.execute("SELECT * FROM tasks ORDER BY trade,code")]})
            if u.path == "/reference":
                args=parse_qs(u.query)
                task=args.get("task",[""])[0]
                region=args.get("region",[""])[0]
                if not task or not region:
                    return self.respond(400,{"error":"task and region query parameters required"})
                with connect() as db:
                    return self.respond(200,reference(db,task,region))
            return self.respond(404,{"error":"Not found"})
    return Handler

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("command",choices=["init","serve","import-csv"])
    p.add_argument("csv_file",nargs="?")
    p.add_argument("--host",default="127.0.0.1",
        help="Defaults to loopback. Exposing to LAN requires adding authentication first.")
    p.add_argument("--port",type=int,default=8765)
    p.add_argument("--lan",action="store_true",
        help="Bind to private Wi-Fi with mandatory bearer token. Never forward the port on the router.")
    a=p.parse_args()
    if a.command=="init":
        with connect() as db:
            n=db.execute("SELECT count(*) FROM tasks").fetchone()[0]
        print(f"Created {db_path()} with {n} original task definitions and no invented prices.")
    elif a.command=="import-csv":
        if not a.csv_file:
            p.error("import-csv needs a CSV filename")
        import_csv(a.csv_file)
    else:
        if a.host not in ("127.0.0.1","localhost","::1") and not a.lan:
            p.error("Non-loopback binding requires --lan and COP_LOCAL_API_TOKEN")
        token=os.environ.get("COP_LOCAL_API_TOKEN","").strip()
        if a.lan and (not token or len(token)<24):
            p.error("--lan requires a secret COP_LOCAL_API_TOKEN with at least 24 characters")
        if a.lan:
            try:
                address=ipaddress.ip_address(a.host)
                if not address.is_private or address.is_loopback or address.is_unspecified:
                    p.error("Use only your Mac's private LAN IP")
            except ValueError:
                p.error("LAN host must be a private IP address")
        with connect():
            pass
        server=ThreadingHTTPServer((a.host,a.port),handler(token))
        print(f"Local database on http://{a.host}:{a.port} ; Ctrl+C to stop; token auth: {bool(token)}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.server_close()

if __name__=="__main__":
    main()
