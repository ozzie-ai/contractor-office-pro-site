"""Deterministic estimate math. No language model is permitted to price a job."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CENT = Decimal("0.01")
RateSource = Literal["contractor_entered", "planning_allowance"]


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DirectCost(StrictModel):
    labor_hours_per_unit: Decimal = Field(ge=0)
    loaded_labor_rate: Decimal = Field(ge=0)
    material_cost_per_unit: Decimal = Field(ge=0)
    equipment_cost_per_unit: Decimal = Field(default=Decimal(0), ge=0)
    other_cost_per_unit: Decimal = Field(default=Decimal(0), ge=0)
    source: RateSource
    source_note: str | None = Field(default=None, max_length=240)

    @model_validator(mode="after")
    def labor_basis(self) -> DirectCost:
        if self.labor_hours_per_unit > 0 and self.loaded_labor_rate == 0:
            raise ValueError("A positive labor quantity needs a labor rate")
        return self


class WorkItem(StrictModel):
    task_code: str = Field(min_length=3, max_length=100)
    scope_id: str | None = Field(default=None, max_length=100)  # distinguish rooms/locations
    description_en: str = Field(min_length=3, max_length=400)
    description_es: str | None = Field(default=None, max_length=400)
    quantity: Decimal | None = Field(default=None, gt=0)
    unit: Literal["each", "job", "sq ft", "linear ft", "cu yd", "hr", "day"]
    direct_cost: DirectCost | None = None
    unit_selling_price_override: Decimal | None = Field(default=None, gt=0)
    excluded: bool = False

    @model_validator(mode="after")
    def exclusive_pricing_modes(self) -> WorkItem:
        if self.direct_cost is not None and self.unit_selling_price_override is not None:
            raise ValueError("Choose direct costs OR a selling-price override, not both")
        return self


class EstimateRequest(StrictModel):
    items: list[WorkItem] = Field(min_length=1, max_length=100)
    overhead_pct: Decimal = Field(default=Decimal(0), ge=0, le=100)
    profit_pct: Decimal = Field(default=Decimal(0), ge=0, le=100)
    mobilization_direct_cost: Decimal = Field(default=Decimal(0), ge=0)
    mobilization_source: RateSource | None = None
    region_code: str | None = Field(default=None, max_length=40)
    customer_language: Literal["en", "es"] = "en"

    @model_validator(mode="after")
    def validate_mobilization(self) -> EstimateRequest:
        if self.mobilization_direct_cost > 0 and self.mobilization_source is None:
            raise ValueError("Mobilization requires a declared price source")
        return self


class PriceLine(StrictModel):
    task_code: str
    quantity: Decimal | None
    unit: str
    description_en: str
    description_es: str | None
    direct_total: Decimal | None
    selling_total: Decimal | None
    source: str | None
    preliminary: bool = True
    missing: list[str]


class EstimateResult(StrictModel):
    status: Literal["incomplete", "ready_for_contractor_review"]
    preliminary: bool = True
    currency: Literal["USD"] = "USD"
    customer_language: Literal["en", "es"] = "en"
    lines: list[PriceLine]
    mobilization_selling_total: Decimal | None
    direct_total: Decimal | None
    selling_total: Decimal | None
    missing: list[str]
    warning: str = "Planning estimate only; contractor approval and current costs required."


def price_estimate(request: EstimateRequest) -> EstimateResult:
    """Compute monetary totals strictly from contractor-entered costs.

    All sources are unverified until checked against an authenticated pricebook;
    no line in this version can be advertised as live-retailer verified.
    """
    markup = (Decimal(1) + request.overhead_pct / 100) * (Decimal(1) + request.profit_pct / 100)
    lines: list[PriceLine] = []
    missing: list[str] = []
    seen: set[tuple[str, str | None]] = set()
    missing_direct_cost = False
    direct_sum = Decimal(0)
    sell_sum = Decimal(0)
    complete = True

    for item in request.items:
        if item.excluded:
            continue
        blockers: list[str] = []
        identity = (item.task_code, item.scope_id)
        if identity in seen:
            blockers.append("Duplicate task code: review for double counting")
        seen.add(identity)
        if item.quantity is None:
            blockers.append("Confirm quantity")
        if item.direct_cost is None and item.unit_selling_price_override is None:
            blockers.append("Enter contractor cost or selling price")
        direct = None
        selling = None
        source = None
        if not blockers:
            assert item.quantity is not None
            if item.unit_selling_price_override is not None:
                # Override is already a SELLING price: never apply margins twice.
                selling = money(item.quantity * item.unit_selling_price_override)
                source = "contractor_selling_price_override"
                missing_direct_cost = True
            else:
                assert item.direct_cost is not None
                basis = item.direct_cost
                unit_direct = (
                    basis.labor_hours_per_unit * basis.loaded_labor_rate
                    + basis.material_cost_per_unit
                    + basis.equipment_cost_per_unit
                    + basis.other_cost_per_unit
                )
                direct = money(item.quantity * unit_direct)
                selling = money(direct * markup)
                source = basis.source
            if selling <= 0:
                blockers.append("Selling price must be positive")
                selling = None
                direct = None
        if blockers:
            complete = False
            missing.extend(f"{item.task_code}: {entry}" for entry in blockers)
        else:
            if direct is not None:
                direct_sum += direct
            if selling is not None:
                sell_sum += selling
        lines.append(PriceLine(
            task_code=item.task_code, quantity=item.quantity, unit=item.unit,
            description_en=item.description_en, description_es=item.description_es,
            direct_total=direct, selling_total=selling, source=source, missing=blockers,
        ))

    if not lines:
        missing.append("No included work items")
        complete = False
    mobilization_selling = money(request.mobilization_direct_cost * markup) if request.mobilization_direct_cost else None
    if mobilization_selling is not None:
        direct_sum += money(request.mobilization_direct_cost)
        sell_sum += mobilization_selling
    return EstimateResult(
        status="ready_for_contractor_review" if complete else "incomplete",
        lines=lines, mobilization_selling_total=mobilization_selling,
        customer_language=request.customer_language,
        direct_total=money(direct_sum) if complete and not missing_direct_cost else None,
        selling_total=money(sell_sum) if complete else None,
        missing=missing,
    )


def customer_projection(result: EstimateResult, approved: bool) -> dict:
    """Allowlist-only customer projection. Do not copy raw private fields."""
    if not approved or result.status != "ready_for_contractor_review":
        raise ValueError("Contractor approval and complete pricing required")
    return {
        "document_type": "preliminary_estimate",
        "currency": "USD",
        "scope": [
            {"description": (line.description_es or line.description_en) if result.customer_language == "es" else line.description_en,
             "quantity": str(line.quantity), "unit": line.unit}
            for line in result.lines
        ],
        "total": str(result.selling_total),
        "notice": "Preliminary estimate only; not a home-improvement contract.",
    }
