"""Native equipment-cost inputs must be included exactly once by pricing engine."""
from decimal import Decimal
from app.pricing import DirectCost, EstimateRequest, WorkItem, price_estimate


def test_equipment_labor_and_materials_all_included():
    draft = EstimateRequest(
        items=[WorkItem(task_code="painting.scrape", description_en="Scrape wall",
            quantity=Decimal("2"), unit="each",
            direct_cost=DirectCost(labor_hours_per_unit=Decimal("1"),
                loaded_labor_rate=Decimal("50"),
                material_cost_per_unit=Decimal("10"),
                equipment_cost_per_unit=Decimal("20"),
                source="contractor_entered"))],
        overhead_pct=Decimal("10"), profit_pct=Decimal("20"),
    )
    result = price_estimate(draft)
    assert result.status == "ready_for_contractor_review"
    assert result.direct_total == Decimal("160.00")
    assert result.selling_total == Decimal("211.20")
    assert result.lines[0].selling_total == Decimal("211.20")
    assert result.missing == []
