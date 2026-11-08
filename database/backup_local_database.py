#!/usr/bin/env python3
"""Hot-safe, free SQLite backup to a user-selected directory (e.g. external drive).
Call: python3 database/backup_local_database.py "/Volumes/MyDrive/COPBackups"
"""
from datetime import datetime,timezone
import os
from pathlib import Path
import sqlite3
import sys
from local_price_server import db_path

def backup(destination):
    source=db_path().resolve()
    if not source.is_file():
        raise RuntimeError("No database file yet. Run local_price_server.py init first.")
    outdir=Path(destination).expanduser().resolve()
    if not outdir.exists() or not outdir.is_dir():
        raise RuntimeError("The destination directory must already exist (external drive connected).")
    if outdir == source.parent:
        raise RuntimeError("Use a different backup directory, ideally an external disk.")
    stamp=datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output=outdir/("contractor-office-pro-prices-"+stamp+".sqlite3")
    with sqlite3.connect(source.as_uri()+"?mode=ro",uri=True) as src:
        with sqlite3.connect(output) as dest:
            src.backup(dest)
            integrity=dest.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity!="ok":raise RuntimeError("Backup validation failed: "+integrity)
    os.chmod(output,0o600)
    print("Verified SQLite backup:",output)
    return output

if __name__=="__main__":
    if len(sys.argv)!=2:
        print("Usage: python3 database/backup_local_database.py /Volumes/DriveName/Backups",file=sys.stderr)
        sys.exit(2)
    try:backup(sys.argv[1])
    except (OSError,sqlite3.Error,RuntimeError) as exc:
        print("Backup failed:",exc,file=sys.stderr)
        sys.exit(1)
