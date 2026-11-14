"""Private business-owned ratebook backed by Derek's Supabase phase-0 table.

No privileged service-role credentials. Supabase RLS is always applied with
this contractor's own bearer token. These are manually entered contractor
rates, NOT automatically verified store or regional market observations.
"""
from __future__ import annotations

import os
from decimal import Decimal
from typing import Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PriceBookCreate(StrictModel):
    kind: Literal["labor", "material", "markup", "other"]
    name_en: str = Field(min_length=2, max_length=180)
    name_es: str | None = Field(default=None, max_length=180)
    unit: str = Field(min_length=1, max_length=24)
    unit_cost: Decimal = Field(ge=0)
    unit_price: Decimal = Field(gt=0)
    category: str | None = Field(default=None, max_length=80)


class PriceBookEntry(PriceBookCreate):
    id: str
    source: Literal["contractor_entered"] = "contractor_entered"


def allowed_entry(row: dict) -> PriceBookEntry:
    """Project only public ratebook fields, never internal database columns."""
    if not isinstance(row, dict):
        raise ValueError("Invalid ratebook item")
    keys = set(PriceBookEntry.model_fields) - {"source"}
    return PriceBookEntry.model_validate({key: row[key] for key in keys if key in row})


def config_headers(token: str) -> tuple[str, dict[str, str]]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_ANON_KEY", "")
    if not url.startswith("https://") or not key:
        raise HTTPException(status_code=503, detail={"error": "ratebook_not_configured"})
    return url, {"apikey": key, "Authorization": token}


async def list_pricebook(org_id: str, token: str, limit: int) -> list[PriceBookEntry]:
    url, headers = config_headers(token)
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            resp = await client.get(
                f"{url}/rest/v1/price_book_items", headers=headers,
                params={"select": "id,kind,name_en,name_es,unit,unit_cost,unit_price,category",
                        "org_id": f"eq.{org_id}", "deleted_at": "is.null", "order": "updated_at.desc", "limit": str(limit)},
            )
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail={"error": "ratebook_unavailable"}) from None
    if resp.status_code != 200:
        raise HTTPException(status_code=503, detail={"error": "ratebook_unavailable"})
    try:
        return [allowed_entry(row) for row in resp.json()]
    except (ValueError, TypeError):
        raise HTTPException(status_code=503, detail={"error": "ratebook_invalid_response"}) from None


async def create_pricebook_entry(org_id: str, token: str, entry: PriceBookCreate) -> PriceBookEntry:
    url, headers = config_headers(token)
    headers = {**headers, "Prefer": "return=representation", "Content-Type": "application/json"}
    payload = entry.model_dump(mode="json")
    # User may not forge org_id; membership was resolved by the verified token.
    payload["org_id"] = org_id
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            resp = await client.post(f"{url}/rest/v1/price_book_items", headers=headers, json=payload)
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail={"error": "ratebook_unavailable"}) from None
    if resp.status_code not in (200, 201):
        # Do not forward PostgREST internals, SQL details, or submitted business data.
        raise HTTPException(status_code=403 if resp.status_code in (401, 403) else 503,
                            detail={"error": "ratebook_write_denied"})
    try:
        rows = resp.json()
        if not isinstance(rows, list) or len(rows) != 1:
            raise ValueError("Expected one inserted rate")
        return allowed_entry(rows[0])
    except (ValueError, TypeError):
        raise HTTPException(status_code=503, detail={"error": "ratebook_invalid_response"}) from None
