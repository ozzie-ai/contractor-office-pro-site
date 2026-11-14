"""Authenticated contractor pricing service. Do not expose a service-role key."""
from __future__ import annotations

import os
from dataclasses import dataclass

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query

from .pricing import EstimateRequest, EstimateResult, price_estimate
from .interpret import InterpretRequest, InterpretResponse, interpret_description
from .pricebook import (PriceBookCreate, PriceBookEntry, list_pricebook,
                        create_pricebook_entry, resolve_ratebook_ids, normalized_unit)

app = FastAPI(title="Contractor Office Pro API", version="0.1.0")


@dataclass(frozen=True)
class Principal:
    user_id: str
    org_id: str


async def require_principal(authorization: str | None = Header(default=None)) -> Principal:
    """Verify bearer token with Supabase Auth, then resolve membership using RLS.

    Client-supplied org_id is never trusted. Calls use the caller's JWT and
    public anon key; never a service-role secret.
    """
    if not authorization or not authorization.startswith("Bearer ") or not authorization[7:].strip():
        raise HTTPException(status_code=401, detail={"error": "access_denied"})
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_ANON_KEY", "")
    if not url.startswith("https://") or not key:
        raise HTTPException(status_code=503, detail={"error": "auth_not_configured"})
    token = authorization[7:].strip()
    headers = {"apikey": key, "Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=False) as client:
            auth = await client.get(f"{url}/auth/v1/user", headers=headers)
            if auth.status_code != 200:
                raise HTTPException(status_code=401, detail={"error": "access_denied"})
            uid = auth.json().get("id")
            if not isinstance(uid, str) or not uid:
                raise HTTPException(status_code=401, detail={"error": "access_denied"})
            member = await client.get(
                f"{url}/rest/v1/members", headers=headers,
                params={"select": "org_id", "user_id": f"eq.{uid}", "deleted_at": "is.null", "limit": "2"},
            )
            if member.status_code != 200:
                raise HTTPException(status_code=503, detail={"error": "membership_unavailable"})
            rows = member.json()
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail={"error": "auth_unavailable"}) from None
    if not isinstance(rows, list) or len(rows) == 0:
        raise HTTPException(status_code=403, detail={"error": "membership_required"})
    if len(rows) > 1:
        raise HTTPException(status_code=409, detail={"error": "multiple_businesses_not_yet_supported"})
    org_id = rows[0].get("org_id") if isinstance(rows[0], dict) else None
    if not isinstance(org_id, str) or not org_id:
        raise HTTPException(status_code=403, detail={"error": "membership_required"})
    return Principal(user_id=uid, org_id=org_id)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "component": "pricing_api"}


@app.post("/v1/estimate/price", response_model=EstimateResult)
async def estimate_price(
    request: EstimateRequest,
    authorization: str | None = Header(default=None),
    principal: Principal = Depends(require_principal),
) -> EstimateResult:
    # Resolve only explicitly selected pricebook IDs in the authenticated org.
    ids = list({str(item.price_book_item_id) for item in request.items if item.price_book_item_id})
    if ids:
        if not authorization:
            raise HTTPException(status_code=401, detail={"error": "access_denied"})
        rates = await resolve_ratebook_ids(principal.org_id, authorization, ids)
        adjusted = []
        for item in request.items:
            if item.price_book_item_id is None:
                adjusted.append(item)
                continue
            rate = rates.get(str(item.price_book_item_id))
            if rate is None:
                raise HTTPException(status_code=404, detail={"error": "pricebook_item_not_found"})
            if normalized_unit(rate.unit) != normalized_unit(item.unit):
                raise HTTPException(status_code=422, detail={"error": "pricebook_unit_mismatch"})
            # Stored unit_price is already a contractor SELLING price.
            adjusted.append(item.model_copy(update={
                "unit_selling_price_override": rate.unit_price,
                "price_book_item_id": None,
            }))
        request = request.model_copy(update={"items": adjusted})
    return price_estimate(request)


@app.post("/v1/interpret", response_model=InterpretResponse)
async def interpret_job(request: InterpretRequest, principal: Principal = Depends(require_principal)) -> InterpretResponse:
    return await interpret_description(request.description)

@app.get("/v1/pricebook", response_model=list[PriceBookEntry])
async def get_pricebook(
    limit: int = Query(default=50, ge=1, le=200),
    authorization: str = Header(),
    principal: Principal = Depends(require_principal),
) -> list[PriceBookEntry]:
    return await list_pricebook(principal.org_id, authorization, limit)


@app.post("/v1/pricebook", response_model=PriceBookEntry, status_code=201)
async def add_pricebook_entry(
    entry: PriceBookCreate,
    authorization: str = Header(),
    principal: Principal = Depends(require_principal),
) -> PriceBookEntry:
    return await create_pricebook_entry(principal.org_id, authorization, entry)
