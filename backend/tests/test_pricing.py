from datetime import date
from decimal import Decimal

import pytest

from app.admin import validate_rows
from app.pricing import ContractorPrice, Observation, OrgPricing, PricingInputs, price_tasks
from app.schemas import PriceTaskInput

TODAY = date(2026, 11, 13)
ORG = OrgPricing("US-CA-SANTA-MONICA", Decimal("0.10"), Decimal("0.20"))
CHAIN = ["US-CA-SANTA-MONICA", "US-CA-LA", "US-CA"]


def task(code, qty=1, unit=None, desc="x"):
    return PriceTaskInput(task_code=code, description_en=desc, quantity=qty, unit=unit)


def obs(code="ELEC.GFCI", region="US-CA-LA", **kw):
    kw.setdefault("observed_on", date(2026, 10, 1))
    return Observation(code, region, kw.pop("source", "Ref"), **kw)


def one(tasks, observations=(), contractor=None):
    return price_tasks(tasks, PricingInputs(ORG, CHAIN, contractor or {}, list(observations)), TODAY)


def test_contractor_price_beats_reference_and_is_not_preliminary():
    r = one([task("ELEC.GFCI", 3)], [obs(bid=Decimal("150"))],
            {"ELEC.GFCI": ContractorPrice("ELEC.GFCI", Decimal("185"), "GFCI")})
    line = r.lines[0]
    assert (line.price_source, line.unit_price, line.line_total, line.preliminary) == ("contractor", Decimal("185.00"), Decimal("555.00"), False)


def test_cost_build_up_applies_overhead_then_profit():
    # labor 1.5 h × $60 × 1.3 burden = 117; + materials 40 + equipment 3 = 160 direct; × 1.10 × 1.20 = 211.20
    r = one([task("ELEC.GFCI", 2)], [obs(labor_hours=Decimal("1.5"), labor_wage=Decimal("60"), labor_burden=Decimal("1.3"),
                                        material=Decimal("40"), equipment=Decimal("3"))])
    line = r.lines[0]
    assert line.basis == "cost_build_up"
    assert line.unit_price == Decimal("211.20") and line.line_total == Decimal("422.40")


def test_bid_with_markup_is_never_marked_up_again():
    line = one([task("ELEC.PANEL.UPGRADE")], [obs("ELEC.PANEL.UPGRADE", bid=Decimal("2100"))]).lines[0]
    assert (line.basis, line.unit_price) == ("benchmark_bid", Decimal("2100.00"))


def test_raw_bid_without_markup_gets_markup():
    line = one([task("ELEC.PANEL.UPGRADE")], [obs("ELEC.PANEL.UPGRADE", bid=Decimal("1000"), bid_includes_markup=False)]).lines[0]
    assert line.unit_price == Decimal("1320.00")


def test_closest_region_wins_and_fallback_is_noted():
    city, metro = obs(region="US-CA-SANTA-MONICA", bid=Decimal("200")), obs(region="US-CA-LA", bid=Decimal("150"))
    assert one([task("ELEC.GFCI")], [metro, city]).lines[0].unit_price == Decimal("200.00")
    fallback = one([task("ELEC.GFCI")], [metro]).lines[0]
    assert fallback.unit_price == Decimal("150.00") and "US-CA-LA" in fallback.note


def test_other_regions_and_expired_references_are_ignored():
    idaho = obs(region="US-ID", bid=Decimal("90"))
    expired = obs(bid=Decimal("150"), expires_on=date(2026, 1, 1))
    line = one([task("ELEC.GFCI")], [idaho, expired]).lines[0]
    assert line.unit_price is None and line.needs == ["price"]


def test_verified_and_fresh_reference_is_not_preliminary_but_stale_is():
    fresh = one([task("ELEC.GFCI")], [obs(bid=Decimal("150"), verified=True)]).lines[0]
    stale = one([task("ELEC.GFCI")], [obs(bid=Decimal("150"), verified=True, observed_on=date(2024, 1, 1))]).lines[0]
    assert not fresh.preliminary and stale.preliminary


def test_missing_quantity_prices_the_unit_but_not_the_line():
    r = one([task("ELEC.PANEL.UPGRADE", qty=None)], [obs("ELEC.PANEL.UPGRADE", bid=Decimal("2100"))])
    assert r.lines[0].unit_price == Decimal("2100.00") and r.lines[0].line_total is None
    assert r.lines[0].needs == ["quantity"] and r.subtotal == 0 and r.unpriced_lines == 1


def test_uncataloged_task_needs_a_price():
    line = one([task(None, 2, desc="Patch drywall")]).lines[0]
    assert line.price_source == "none" and line.needs == ["price"]


@pytest.mark.parametrize("unit,warns", [("ft", False), ("pies", False), ("linear ft", False), ("each", True)])
def test_unit_mismatch_is_flagged(unit, warns):
    line = one([task("ELEC.WIRE.RUN", 100, unit=unit)]).lines[0]
    assert ("Unit differs" in (line.note or "")) == warns


def test_subtotal_rounds_per_line():
    r = one([task("ELEC.WIRE.RUN", 3), task("ELEC.GFCI", 1)],
            contractor={"ELEC.WIRE.RUN": ContractorPrice("ELEC.WIRE.RUN", Decimal("3.335"), "Wire"),
                        "ELEC.GFCI": ContractorPrice("ELEC.GFCI", Decimal("185"), "GFCI")})
    assert [l.line_total for l in r.lines] == [Decimal("10.02"), Decimal("185.00")]  # 3 × 3.34
    assert r.subtotal == Decimal("195.02") and r.priced_lines == 2


def test_price_endpoint(client, auth_headers):
    body = {"tasks": [{"task_code": "ELEC.PANEL.UPGRADE", "description_en": "Panel 200A", "quantity": 1, "unit": "job"},
                      {"task_code": None, "description_en": "Patch wall", "quantity": None, "unit": None}]}
    r = client.post("/v1/estimate/price", json=body, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["lines"][0]["unit_price"] == "2100.00" and data["lines"][0]["preliminary"] is True
    assert data["lines"][1]["needs"] == ["price", "quantity"]
    assert data["subtotal"] == "2100.00" and data["preliminary"] is True and "Preliminary" in data["disclaimer"]


def test_price_endpoint_rejects_made_up_codes(client, auth_headers):
    r = client.post("/v1/estimate/price", json={"tasks": [{"task_code": "FAKE", "description_en": "x"}]}, headers=auth_headers)
    assert r.status_code == 400


def test_pricebook_shows_your_price_and_reference_separately(client, auth_headers, fakes):
    fakes["pricing"].contractor = {"ELEC.PANEL.UPGRADE": ContractorPrice("ELEC.PANEL.UPGRADE", Decimal("2600"), "Panel")}
    entries = {e["task_code"]: e for e in client.get("/v1/pricebook", headers=auth_headers).json()["entries"]}
    panel = entries["ELEC.PANEL.UPGRADE"]
    assert panel["your_price"] == "2600.00" and panel["reference_price"] == "2100.00"
    assert entries["ELEC.GFCI"]["your_price"] is None and entries["ELEC.GFCI"]["reference_price"] is None


def test_admin_import_validation():
    sources = {"EDD": {"id": "s1", "commercial_reuse_allowed": True}, "Gordian": {"id": "s2", "commercial_reuse_allowed": False}}
    rows = [
        {"task_code": "ELEC.GFCI", "region_code": "US-CA-LA", "source_name": "EDD", "observed_on": "2026-11-01",
         "labor_hours_per_unit": "1", "labor_wage_per_hour": "55"},
        {"task_code": "ELEC.GFCI", "region_code": "US-CA-LA", "source_name": "Gordian", "observed_on": "2026-11-01", "observed_unit_bid": "1"},
        {"task_code": "NOPE", "region_code": "US-CA-LA", "source_name": "EDD", "observed_on": "2026-11-01"},
        {"task_code": "ELEC.GFCI", "region_code": "US-CA-LA", "source_name": "EDD", "observed_on": "2026-11-01", "labor_hours_per_unit": "1"},
        {"task_code": "ELEC.GFCI", "region_code": "US-CA-LA", "source_name": "EDD", "observed_on": "11/01/2026", "observed_unit_bid": "1"},
        {"task_code": "ELEC.GFCI", "region_code": "US-CA-LA", "source_name": "EDD", "observed_on": "2026-11-01", "observed_unit_bid": "-5"},
    ]
    clean, errors = validate_rows(rows, {"US-CA-LA"}, sources)
    assert len(clean) == 1 and clean[0]["source_id"] == "s1"
    assert len(errors) == 5
    assert any("commercial reuse" in e for e in errors) and any("price basis" in e for e in errors)


def test_price_accepts_tasks_with_omitted_null_fields(client, auth_headers):
    """Regression: the iOS encoder omits nil keys, so uncataloged tasks arrive without task_code/quantity/unit."""
    body = {"tasks": [{"description_en": "Patch drywall around the old panel", "description_es": "Resanar"},
                      {"task_code": "ELEC.PANEL.UPGRADE", "description_en": "Panel", "description_es": "Panel", "quantity": 1}]}
    r = client.post("/v1/estimate/price", json=body, headers=auth_headers)
    assert r.status_code == 200
    lines = r.json()["lines"]
    assert lines[0]["task_code"] is None and lines[0]["needs"] == ["price", "quantity"]
    assert lines[1]["unit_price"] == "2100.00"
