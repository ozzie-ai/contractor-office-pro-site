# Free Mac pricing database — $0/month

Contractor Office Pro now includes a **local SQLite catalog** you can run on your Mac. It is not yet connected to your phone app. No Supabase account, paid cloud, or external API key is needed to initialize it.

The Mac can run the database even when an external drive is not plugged in. Later, transfer the data directory to the drive or specify it using COP_DATA_DIR. An external drive is **storage**, not a cloud service by itself. A Mac-based server only operates while the Mac is powered on, and the current version intentionally serves the Mac itself only for security. Phone access needs an authenticated LAN API or secure private network connection, not a port opened on the public internet.

## Quick start — Mac Terminal

```sh
cd ~/contractor-office-pro-site
git pull --ff-only origin main
python3 database/local_price_server.py init
python3 database/local_price_server.py serve
```

In a second Terminal window open `http://127.0.0.1:8765/health` or run `curl http://127.0.0.1:8765/tasks`. Stop with Ctrl+C.

## External hard drive

Once plugged in, macOS usually mounts external disks under `/Volumes/<drive-name>`. Check their names:

```sh
ls /Volumes
```

Use a directory inside the drive (replace `YourDriveName` with its actual volume name):

```sh
export COP_DATA_DIR="/Volumes/YourDriveName/ContractorOfficeProData"
python3 database/local_price_server.py init
python3 database/local_price_server.py serve
```

The database file is `$COP_DATA_DIR/prices.sqlite3`. Leave it on the Mac's internal storage if you cannot guarantee the external drive stays connected. Use the drive for backups instead.

## Supported read endpoints on the Mac

- `GET /health`: running and storage location
- `GET /tasks`: original bilingual task dictionary
- `GET /reference?task=ELEC.PANEL.UPGRADE&region=US-CA-LA`: most recent verified and reusable observation, or a clear message that no such price exists

No prices have been fabricated or copied from Gordian.

## Import our own permitted data

A CSV import can hold legally reusable open source data and price observations from verified contractor records. Columns:

```
task_code,region,observed_on,labor_hours,hourly_wage,burden_factor,materials,equipment,other_cost,benchmark_bid,source_name,source_url,license,reuse_allowed,verified,notes
```

A record must identify a task code already in the catalog, region (e.g. US-CA-LA), source name, date YYYY-MM-DD, at least one numeric amount, and commercial reuse allowed = 1. A verified row uses verified = 1. A partial cost will not be advertised as a complete direct cost. A historical bid is kept as a benchmark and **not** treated as direct cost.

```sh
python3 database/local_price_server.py import-csv /path/to/your-approved-prices.csv
```

Do not copy the restricted Gordian Los Angeles CTC dataset into the new database without permission. A public webpage or downloadable PDF does not by itself grant unrestricted commercial replication rights.

## Next integrations

1. Add authenticated Mac-to-iPhone access on the same private Wi-Fi with no cloud fees.
2. Connect the mobile estimate to pricing lookups, preserving local offline drafts.
3. Import attributable open-data labor wages, applicable material quotes, and contractor-verified production hours.
4. Store regional references separately from a contractor's final selling price.

The local tool is a foundation, not an automatic pricing oracle. A complete estimate still needs job conditions and scope verification.
