"""Research-only residential pricing: JWT-scoped access, never an automatic final quote."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .pricebook import config_headers


class ResearchReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference_id: str
    reference_kind: Literal["reviewed_budget", "service_market", "supplier_market"]
    trade: str
    service: str
    unit: str
    locality: str
    low_usd: Decimal | None = Field(default=None, ge=0)
    high_usd: Decimal | None = Field(default=None, ge=0)
    planning_rate_usd: Decimal | None = Field(default=None, ge=0)
    cost_basis: str | None = None
    scope: str | None = None
    exclusions: str | None = None
    evidence_note: str | None = None
    checked_on: date | None = None
    recheck_on: date | None = None
    review_status: Literal["reviewed_preliminary_budget", "market_reference",
                           "needs_source_refresh", "reference_only"]
    budget_usable: bool
    automatic_final_quote: Literal[False]


async def list_research_references(token: str, limit: int, budget_only: bool,
                                   trade: str | None = None) -> list[ResearchReference]:
    """Fetch only allowlisted fields, using authenticated caller's own RLS JWT."""
    url, headers = config_headers(token)
    params = {"select": ",".join(ResearchReference.model_fields),
              "order": "trade.asc,service.asc", "limit": str(limit)}
    if budget_only:
        params["budget_usable"] = "eq.true"
    if trade:
        if not trade[0].isalpha() or any(not (x.isalpha() or x in " /&-") for x in trade):
            raise HTTPException(status_code=422, detail={"error": "invalid_trade"})
        params["trade"] = "ilike." + trade
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client:
            response = await client.get(
                f"{url}/rest/v1/cop_research_references", headers=headers, params=params)
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail={"error": "reference_catalog_unavailable"}) from None
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail={"error": "reference_catalog_unavailable"})
    try:
        data = response.json()
        if not isinstance(data, list) or len(data) > limit:
            raise ValueError("Unexpected research catalog result")
        return [ResearchReference.model_validate(item) for item in data]
    except (ValueError, TypeError):
        raise HTTPException(status_code=503, detail={"error": "reference_catalog_invalid"}) from None
