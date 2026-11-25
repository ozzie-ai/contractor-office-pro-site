"""Server-side admin for reference pricing data (uses the service key; never ship to the app).

  python -m app.admin sync-catalog                 # upsert trade_tasks from app/catalog.py
  python -m app.admin import-observations FILE.csv # add reference prices (validated)

CSV columns: task_code, region_code, source_name, observed_on, [expires_on], and at least one of
labor_hours_per_unit+labor_wage_per_hour[, labor_burden_factor], material_cost_per_unit, equipment_cost_per_unit,
other_cost_per_unit, observed_unit_bid[, bid_includes_markup]; optional verified, confidence, applies_to, provenance_note.
Sources must already exist in price_sources AND allow commercial reuse (no restricted catalogs such as Gordian)."""
from __future__ import annotations

import csv
import json
import sys
import urllib.request
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .catalog import BY_CODE, CATALOG
from .config import Settings

NUMERIC = ["labor_hours_per_unit", "labor_wage_per_hour", "labor_burden_factor", "material_cost_per_unit",
           "equipment_cost_per_unit", "other_cost_per_unit", "observed_unit_bid"]


def validate_rows(rows: list[dict[str, str]], regions: set[str], sources: dict[str, dict]) -> tuple[list[dict], list[str]]:
    """Returns (clean rows ready to insert, errors). Pure function: easy to test."""
    clean, errors = [], []
    for n, row in enumerate(rows, start=2):  # header is line 1
        where = f"line {n}"
        code, region, source = row.get("task_code", "").strip(), row.get("region_code", "").strip(), row.get("source_name", "").strip()
        if code not in BY_CODE:
            errors.append(f"{where}: unknown task_code {code!r}"); continue
        if region not in regions:
            errors.append(f"{where}: unknown region_code {region!r}"); continue
        src = sources.get(source)
        if not src:
            errors.append(f"{where}: unknown source {source!r} (add it to price_sources first)"); continue
        if not src["commercial_reuse_allowed"]:
            errors.append(f"{where}: source {source!r} does not allow commercial reuse"); continue
        try:
            observed = date.fromisoformat(row["observed_on"].strip())
            expires = date.fromisoformat(row["expires_on"].strip()) if row.get("expires_on", "").strip() else None
        except (KeyError, ValueError):
            errors.append(f"{where}: observed_on/expires_on must be YYYY-MM-DD"); continue
        numbers: dict[str, str] = {}
        try:
            for col in NUMERIC:
                value = row.get(col, "").strip()
                if value:
                    if Decimal(value) < 0:
                        raise InvalidOperation
                    numbers[col] = value
        except InvalidOperation:
            errors.append(f"{where}: {col} must be a non-negative number"); continue
        has_labor = "labor_hours_per_unit" in numbers and "labor_wage_per_hour" in numbers
        if not (has_labor or numbers.keys() & {"material_cost_per_unit", "equipment_cost_per_unit",
                                               "other_cost_per_unit", "observed_unit_bid"}):
            errors.append(f"{where}: needs a price basis (labor hours + wage, a cost, or an observed bid)"); continue
        clean.append({
            "task_code": code, "region_code": region, "source_id": src["id"], "observed_on": observed.isoformat(),
            "expires_on": expires.isoformat() if expires else None, **numbers,
            "bid_includes_markup": row.get("bid_includes_markup", "true").strip().lower() != "false",
            "verified": row.get("verified", "").strip().lower() == "true",
            "confidence": row.get("confidence", "").strip() or "unverified",
            "applies_to": row.get("applies_to", "").strip() or None,
            "provenance_note": row.get("provenance_note", "").strip() or None,
        })
    return clean, errors


def _rest(settings: Settings, method: str, path: str, body=None, prefer: str | None = None):
    key = settings.supabase_service_key
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{settings.supabase_url}/rest/v1/{path}", method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        text = r.read().decode()
        return json.loads(text) if text else None


def main(argv: list[str]) -> int:
    settings = Settings.from_env()
    if argv[:1] == ["sync-catalog"]:
        rows = [{"code": t.code, "trade": t.trade, "title_en": t.title_en, "title_es": t.title_es,
                 "unit": t.unit, "guidance": t.guidance} for t in CATALOG]
        _rest(settings, "POST", "trade_tasks?on_conflict=code", rows, prefer="resolution=merge-duplicates")
        print(f"synced {len(rows)} catalog tasks")
        return 0
    if argv[:1] == ["import-observations"] and len(argv) == 2:
        rows = list(csv.DictReader(Path(argv[1]).open(newline="")))
        regions = {r["region_code"] for r in _rest(settings, "GET", "price_regions?select=region_code")}
        sources = {s["name"]: s for s in _rest(settings, "GET", "price_sources?select=id,name,commercial_reuse_allowed")}
        clean, errors = validate_rows(rows, regions, sources)
        for e in errors:
            print("ERROR", e)
        if errors:
            print("nothing imported; fix the errors above")
            return 1
        if clean:
            _rest(settings, "POST", "unit_cost_observations", clean)
        print(f"imported {len(clean)} observations")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
