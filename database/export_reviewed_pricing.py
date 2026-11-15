"""Export ONLY explicitly reviewed residential rate data from the local master SQLite.

This is a staging/audit export, NOT a Supabase upload and NOT an automatic quote.
No client information or unapproved catalog, wage, fuel, scenario, or rental rows
are published. Run against the local master database in read-only mode.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from decimal import Decimal, InvalidOperation
from pathlib import Path


def valid_money(value: object) -> str | None:
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount <= 0:
            return None
        return format(amount.quantize(Decimal("0.01")), "f")
    except (InvalidOperation, ValueError, TypeError):
        return None


def export_reviewed(db_path: Path) -> dict:
    if not db_path.is_file():
        raise FileNotFoundError(f"Pricing database not found: {db_path}")
    # Read-only URI: this process never writes to the original SQLite database.
    con = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro")
    con.row_factory = sqlite3.Row
    try:
        required = {"approved_unit_rates", "cop_budget_benchmarks"}
        found = {row[0] for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN "
            "('approved_unit_rates','cop_budget_benchmarks')"
        )}
        if found != required:
            raise ValueError("Master database is missing required approval tables")
        selling_rows = []
        rejected_selling_rows = 0
        for row in con.execute(
            "SELECT id,task_code,scope,location,unit,rate,evidence_json,"
            " reviewer,approved_date FROM approved_unit_rates ORDER BY id"
        ):
            value = valid_money(row["rate"])
            if not all(str(row[k] or "").strip() for k in (
                "task_code", "scope", "location", "unit", "reviewer", "approved_date", "evidence_json"
            )) or value is None:
                rejected_selling_rows += 1
                continue
            try:
                evidence = json.loads(row["evidence_json"])
                if not isinstance(evidence, (list, dict)) or not evidence:
                    raise ValueError("Empty evidence")
            except (TypeError, ValueError):
                rejected_selling_rows += 1
                continue
            selling_rows.append({
                "id": row["id"], "task_code": row["task_code"],
                "scope": row["scope"], "location": row["location"], "unit": row["unit"],
                "reviewed_selling_rate": value, "reviewer": row["reviewer"],
                "approved_date": row["approved_date"], "evidence": evidence,
                "use": "contractor_review_required_before_customer_quote",
            })
        budgets = []
        for row in con.execute(
            "SELECT id,name,trade,unit,locality,low,high,scope,exclusions,"
            "approved_use,status,reviewer,reviewed_date FROM cop_budget_benchmarks ORDER BY id"
        ):
            if row["status"] != "approved_for_preliminary_budget":
                continue
            low, high = valid_money(row["low"]), valid_money(row["high"])
            if low is None or high is None or Decimal(low) > Decimal(high):
                continue
            if not all(str(row[k] or "").strip() for k in (
                "name", "trade", "unit", "locality", "scope", "exclusions",
                "reviewer", "reviewed_date", "approved_use"
            )):
                continue
            budgets.append({
                "id": row["id"], "name": row["name"], "trade": row["trade"],
                "unit": row["unit"], "locality": row["locality"],
                "low": low, "high": high, "scope": row["scope"],
                "exclusions": row["exclusions"], "reviewed_date": row["reviewed_date"],
                "use": "preliminary_budget_range_only_not_a_customer_unit_price",
            })
        return {
            "format": "cop-reviewed-pricing-stage-v1",
            "selling_prices_auto_approved": False,
            "selling_rate_count": len(selling_rows),
            "rejected_selling_rows": rejected_selling_rows,
            "preliminary_budget_count": len(budgets),
            "reviewed_selling_rates": selling_rows,
            "preliminary_budget_ranges": budgets,
            "automated_cloud_upload": False,
        }
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True, help="Path to local master SQLite")
    parser.add_argument("--out", type=Path, required=True, help="Local JSON staging output")
    args = parser.parse_args()
    data = export_reviewed(args.db)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Reviewed selling rates: {data['selling_rate_count']}")
    print(f"Preliminary budgets: {data['preliminary_budget_count']}")
    print("No customer quote rates were auto-approved or uploaded.")


if __name__ == "__main__":
    main()
