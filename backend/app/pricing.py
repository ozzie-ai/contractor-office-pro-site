"""Deterministic pricing (CLAUDE.md: LLMs interpret, code computes).

Lookup per task: contractor's own price → reference observation for the closest region (city → metro → state)
→ unpriced. Reference prices are preliminary unless verified and fresh. Money is Decimal, rounded per line to cents."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol
from uuid import UUID

import httpx

from .catalog import BY_CODE
from .config import Settings
from .errors import ApiError
from .schemas import Ballpark, BallparkLine, PricedLine, PriceResponse, PriceTaskInput

CENT = Decimal("0.01")
STALE_AFTER = timedelta(days=548)  # ~18 months
DISCLAIMER = ("Preliminary estimate. Reference prices are planning figures, not quotes; confirm every price, "
              "quantity and site condition before sending.")
UNIT_ALIASES = {"ft": "linear ft", "feet": "linear ft", "foot": "linear ft", "lf": "linear ft", "pies": "linear ft",
                "linear feet": "linear ft", "ea": "each", "unit": "each", "units": "each", "pcs": "each",
                "sqft": "sq ft", "square feet": "sq ft", "hour": "hr", "hours": "hr", "hrs": "hr"}


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def normalize_unit(unit: str | None) -> str | None:
    if unit is None:
        return None
    u = unit.strip().lower()
    return UNIT_ALIASES.get(u, u)


@dataclass(frozen=True)
class OrgPricing:
    region_code: str
    overhead: Decimal
    profit: Decimal


@dataclass(frozen=True)
class ContractorPrice:
    task_code: str
    unit_price: Decimal
    name: str


@dataclass(frozen=True)
class Observation:
    task_code: str
    region_code: str
    source_name: str
    observed_on: date
    expires_on: date | None = None
    labor_hours: Decimal | None = None
    labor_wage: Decimal | None = None
    labor_burden: Decimal | None = None
    material: Decimal | None = None
    equipment: Decimal | None = None
    other: Decimal | None = None
    bid: Decimal | None = None
    bid_includes_markup: bool = True
    verified: bool = False
    confidence: str = "unverified"
    applies_to: str | None = None
    note: str | None = None


@dataclass
class PricingInputs:
    org: OrgPricing
    region_chain: list[str]
    contractor: dict[str, ContractorPrice] = field(default_factory=dict)
    observations: list[Observation] = field(default_factory=list)


def observation_price(obs: Observation, org: OrgPricing) -> tuple[Decimal, str] | None:
    """Selling price per unit and basis, or None if the observation can't produce one."""
    markup = (1 + org.overhead) * (1 + org.profit)
    labor = None
    if obs.labor_hours is not None:
        if obs.labor_wage is None:
            labor = None if obs.bid is not None else Decimal(-1)  # hours without wage: incomplete
        else:
            labor = obs.labor_hours * obs.labor_wage * (obs.labor_burden or Decimal(1))
    if labor is not None and labor < 0:
        return None
    parts = [p for p in (labor, obs.material, obs.equipment, obs.other) if p is not None]
    if parts:
        return money(sum(parts, Decimal(0)) * markup), "cost_build_up"
    if obs.bid is not None:
        # A finished bid usually already contains overhead and profit: never stack markup on it.
        return money(obs.bid if obs.bid_includes_markup else obs.bid * markup), "benchmark_bid"
    return None


def best_observation(code: str, inputs: PricingInputs, today: date) -> tuple[Observation, Decimal, str] | None:
    rank = {region: i for i, region in enumerate(inputs.region_chain)}
    candidates = [o for o in inputs.observations
                  if o.task_code == code and o.region_code in rank and (o.expires_on is None or o.expires_on >= today)]
    candidates.sort(key=lambda o: (rank[o.region_code], not o.verified, -o.observed_on.toordinal()))
    for obs in candidates:
        priced = observation_price(obs, inputs.org)
        if priced:
            return obs, *priced
    return None


def price_tasks(tasks: list[PriceTaskInput], inputs: PricingInputs, today: date | None = None) -> PriceResponse:
    today = today or date.today()
    lines: list[PricedLine] = []
    for task in tasks:
        quantity = Decimal(str(task.quantity)) if task.quantity is not None else None
        catalog = BY_CODE.get(task.task_code) if task.task_code else None
        unit = task.unit or (catalog.unit if catalog else None)
        notes: list[str] = []
        if catalog and task.unit and normalize_unit(task.unit) != normalize_unit(catalog.unit):
            notes.append(f"Unit differs from the catalog ({catalog.unit}); check the quantity.")
        unit_price = None
        source, basis, preliminary, confidence = "none", "none", True, "none"
        source_name = applies_to = None

        own = inputs.contractor.get(task.task_code) if task.task_code else None
        reference = best_observation(task.task_code, inputs, today) if task.task_code and not own else None
        if own:
            unit_price, source, basis, preliminary, confidence = money(own.unit_price), "contractor", "contractor_price", False, "high"
            source_name = "Your price book"
        elif reference:
            obs, unit_price, basis = reference
            fresh = today - obs.observed_on <= STALE_AFTER
            source, preliminary, confidence = "reference", not (obs.verified and fresh), obs.confidence
            source_name, applies_to = obs.source_name, obs.applies_to
            if obs.region_code != inputs.region_chain[0]:
                notes.append(f"Nearest reference region: {obs.region_code}.")
            if obs.note:
                notes.append(obs.note)
        needs = [n for n, missing in (("price", unit_price is None), ("quantity", quantity is None)) if missing]
        lines.append(PricedLine(
            task_code=task.task_code, description_en=task.description_en, description_es=task.description_es,
            quantity=quantity, unit=unit, unit_price=unit_price,
            line_total=money(quantity * unit_price) if quantity is not None and unit_price is not None else None,
            price_source=source, basis=basis, preliminary=preliminary, confidence=confidence,
            source_name=source_name, applies_to=applies_to, note=" ".join(notes) or None, needs=needs,
        ))
    subtotal = money(sum((l.line_total for l in lines if l.line_total is not None), Decimal(0)))
    return PriceResponse(
        region_code=inputs.region_chain[0], overhead_pct=inputs.org.overhead, profit_pct=inputs.org.profit,
        lines=lines, subtotal=subtotal,
        priced_lines=sum(l.line_total is not None for l in lines),
        unpriced_lines=sum(l.line_total is None for l in lines),
        preliminary=any(l.preliminary or l.needs for l in lines),
        disclaimer=DISCLAIMER,
    )


# MARK: - AI ballpark (the model estimates cost inputs; code computes the price)

# Sanity bounds on model-supplied inputs. Anything outside is dropped (the line stays "needs price").
BALLPARK_LIMITS = {"hours": (Decimal(0), Decimal(500)), "rate": (Decimal(20), Decimal(250)),
                   "material": (Decimal(0), Decimal(100_000)), "equipment": (Decimal(0), Decimal(50_000))}
BALLPARK_SOURCE = "AI ballpark"


def ballpark_requests(response: PriceResponse) -> list[BallparkLine]:
    return [BallparkLine(ref=i, task_code=l.task_code, description_en=l.description_en, unit=l.unit)
            for i, l in enumerate(response.lines) if l.unit_price is None]


def _within(value: float, key: str) -> Decimal | None:
    low, high = BALLPARK_LIMITS[key]
    d = Decimal(str(value))
    return d if low <= d <= high else None


def apply_ballpark(response: PriceResponse, ballpark: Ballpark, org: OrgPricing) -> PriceResponse:
    """Fills unpriced lines from AI cost inputs: (hours × rate + material + equipment) × overhead × profit.
    Always preliminary, low confidence, and labeled so the contractor checks it before sending."""
    markup = (1 + org.overhead) * (1 + org.profit)
    for item in ballpark.items:
        if not 0 <= item.ref < len(response.lines):
            continue
        line = response.lines[item.ref]
        if line.unit_price is not None:
            continue  # never overwrite a contractor or reference price
        hours, rate = _within(item.labor_hours_per_unit, "hours"), _within(item.labor_rate_per_hour, "rate")
        material, equipment = _within(item.material_cost_per_unit, "material"), _within(item.equipment_cost_per_unit, "equipment")
        if None in (hours, rate, material, equipment):
            continue
        direct = hours * rate + material + equipment
        if direct <= 0:
            continue
        line.unit_price = money(direct * markup)
        line.line_total = money(line.quantity * line.unit_price) if line.quantity is not None else None
        line.price_source, line.basis, line.preliminary, line.confidence = "ai_estimate", "ai_ballpark", True, "low"
        line.source_name = BALLPARK_SOURCE
        basis = " ".join(item.basis_en.split())[:160]
        line.note = " ".join(filter(None, [f"AI ballpark: {basis}." if basis else "AI ballpark.",
                                           "Check this price before sending.", line.note]))
        line.needs = [n for n in line.needs if n != "price"]
    response.subtotal = money(sum((l.line_total for l in response.lines if l.line_total is not None), Decimal(0)))
    response.priced_lines = sum(l.line_total is not None for l in response.lines)
    response.unpriced_lines = sum(l.line_total is None for l in response.lines)
    response.preliminary = any(l.preliminary or l.needs for l in response.lines)
    return response


# MARK: - Data access

class PricingRepository(Protocol):
    async def inputs(self, org_id: UUID, task_codes: set[str], region_override: str | None) -> PricingInputs: ...


def _dec(value) -> Decimal | None:
    return None if value is None else Decimal(str(value))


class SupabasePricingRepository:
    def __init__(self, settings: Settings, http: httpx.AsyncClient, region_ttl: float = 600):
        self._s, self._http, self._ttl = settings, http, region_ttl
        self._regions: tuple[float, dict[str, str | None]] | None = None

    async def _get(self, path: str, params: dict[str, str]) -> list[dict]:
        key = self._s.supabase_service_key
        headers = {"apikey": key} if key.startswith("sb_") else {"apikey": key, "Authorization": f"Bearer {key}"}
        r = await self._http.get(f"{self._s.supabase_url}/rest/v1/{path}", params=params, headers=headers, timeout=15)
        if r.status_code != 200:
            raise ApiError(503, "pricing_unavailable", "Pricing data is unavailable. Try again.")
        return r.json()

    async def _region_parents(self) -> dict[str, str | None]:
        if self._regions and time.monotonic() - self._regions[0] < self._ttl:
            return self._regions[1]
        rows = await self._get("price_regions", {"select": "region_code,parent_region_code"})
        parents = {r["region_code"]: r["parent_region_code"] for r in rows}
        self._regions = (time.monotonic(), parents)
        return parents

    async def inputs(self, org_id: UUID, task_codes: set[str], region_override: str | None) -> PricingInputs:
        orgs = await self._get("organizations", {"id": f"eq.{org_id}", "select": "region_code,overhead_pct,profit_pct"})
        if not orgs:
            raise ApiError(403, "no_business", "Set up your business in the app first.")
        o = orgs[0]
        parents = await self._region_parents()
        region = region_override or o.get("region_code") or "US-CA-LA"
        if region not in parents:
            raise ApiError(400, "unknown_region", "That pricing region isn't available.")
        chain, cursor = [], region
        while cursor and cursor not in chain:
            chain.append(cursor)
            cursor = parents.get(cursor)
        inputs = PricingInputs(org=OrgPricing(region, _dec(o["overhead_pct"]) or Decimal(0), _dec(o["profit_pct"]) or Decimal(0)),
                               region_chain=chain)
        if not task_codes:
            return inputs
        codes = ",".join(sorted(task_codes))
        for row in await self._get("price_book_items", {
                "org_id": f"eq.{org_id}", "task_code": f"in.({codes})", "deleted_at": "is.null",
                "select": "task_code,unit_price,name_en", "order": "updated_at.desc"}):
            inputs.contractor.setdefault(row["task_code"], ContractorPrice(row["task_code"], _dec(row["unit_price"]), row["name_en"]))
        for row in await self._get("unit_cost_observations", {
                "task_code": f"in.({codes})", "region_code": f"in.({','.join(chain)})",
                "select": "*,price_sources(name)"}):
            inputs.observations.append(Observation(
                task_code=row["task_code"], region_code=row["region_code"],
                source_name=(row.get("price_sources") or {}).get("name", "Reference"),
                observed_on=date.fromisoformat(row["observed_on"]),
                expires_on=date.fromisoformat(row["expires_on"]) if row.get("expires_on") else None,
                labor_hours=_dec(row["labor_hours_per_unit"]), labor_wage=_dec(row["labor_wage_per_hour"]),
                labor_burden=_dec(row["labor_burden_factor"]), material=_dec(row["material_cost_per_unit"]),
                equipment=_dec(row["equipment_cost_per_unit"]), other=_dec(row["other_cost_per_unit"]),
                bid=_dec(row["observed_unit_bid"]), bid_includes_markup=row["bid_includes_markup"],
                verified=row["verified"], confidence=row["confidence"], applies_to=row.get("applies_to"),
                note=row.get("provenance_note")))
        return inputs
