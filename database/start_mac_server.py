#!/usr/bin/env python3
"""Start the $0 Contractor Office Pro pricing API on the Mac's private Wi-Fi.

Generates a persistent access token the first time. Requires Python 3.9+.
No external libraries, internet account, or cloud fee.
"""
import ipaddress
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
from local_price_server import connect, db_path, handler
from http.server import ThreadingHTTPServer

CONFIG=Path.home()/".contractor-office-pro"
TOKEN_FILE=CONFIG/"local-api-token"
PORT=8765

def private_ip():
    # Prefer the actual macOS Wi-Fi IP, not an arbitrary outbound route.
    for iface in ("en0","en1"):
        try:
            result=subprocess.run(["ipconfig","getifaddr",iface],capture_output=True,text=True,timeout=3)
            ip=result.stdout.strip()
            if result.returncode==0 and ipaddress.ip_address(ip).is_private and not ipaddress.ip_address(ip).is_loopback:
                return ip
        except (OSError,ValueError,subprocess.TimeoutExpired):
            pass
    raise RuntimeError("No private Wi-Fi IPv4 address found. Connect the Mac to your home Wi-Fi.")

def get_or_create_token():
    CONFIG.mkdir(mode=0o700,parents=True,exist_ok=True)
    if TOKEN_FILE.exists():
        token=TOKEN_FILE.read_text(encoding="utf-8").strip()
        if len(token)<24:raise RuntimeError("Existing token is too short; replace it securely.")
        return token
    token=secrets.token_urlsafe(32)
    # Exclusive creation, owner-readable only. Never commit this file to GitHub.
    descriptor=os.open(str(TOKEN_FILE),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(descriptor,"w",encoding="utf-8") as f:f.write(token+"\n")
    return token

def main():
    token=get_or_create_token()
    ip=private_ip()
    with connect():
        pass
    print("\nContractor Office Pro — Mac pricing server",flush=True)
    print("Database:",db_path(),flush=True)
    print("In iPhone Business Settings, enter:",flush=True)
    print("  Mac URL: http://"+ip+":"+str(PORT),flush=True)
    print("  Region: US-CA-LA (change for actual work location)",flush=True)
    print("  Private access token:",token,flush=True)
    print("The token is saved on this Mac at",TOKEN_FILE,flush=True)
    print("Same trusted Wi-Fi only. Do not open router ports. Ctrl+C to stop.",flush=True)
    server=ThreadingHTTPServer((ip,PORT),handler(token))
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=="__main__":
    try:main()
    except (RuntimeError,OSError) as exc:
        print("Unable to start:",exc,file=sys.stderr)
        sys.exit(1)
