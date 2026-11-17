from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import Principal, app, require_principal
from app.pricing import EstimateRequest, customer_projection, price_estimate


def d(value):
    return Decimal(str(value))


def standard(code, quantity, material, hours, source="contractor_entered"):
    return {
        "task_code": code,
        "description_en": "Replace electrical receptacles",
        "description_es": "Reemplazar tomacorrientes",
        "quantity": quantity,
        "unit": "each",
        "direct_cost": {
            "labor_hours_per_unit": hours, "loaded_labor_rate": 60,
            "material_cost_per_unit": material, "source": source,
        },
    }


def test_five_outlets_one_trip_and_margin_math():
    request = EstimateRequest.model_validate({
        "items": [standard("outlet.standard", 3, 15, "0.6"), standard("outlet.gfci", 2, 30, "0.75")],
        "overhead_pct": 10, "profit_pct": 20,
        "mobilization_direct_cost": 75, "mobilization_source": "contractor_entered",
    })
    result = price_estimate(request)
    assert result.status == "ready_for_contractor_review"
    assert result.preliminary is True
    assert [l.quantity for l in result.lines] == [d(3), d(2)]
    assert result.direct_total == d("378.00")
    assert result.selling_total == d("498.96")
    assert result.mobilization_selling_total == d("99.00")
    assert result.missing == []


def test_missing_measurements_and_unpriced_work_block_full_total():
    req = EstimateRequest.model_validate({"items": [
        standard("outlet.standard", 3, 15, 1),
        {"task_code": "ev.cable", "description_en": "Run cable to charger", "unit": "linear ft", "quantity": None},
    ]})
    result = price_estimate(req)
    assert result.status == "incomplete"
    assert result.selling_total is None
    assert any("Confirm quantity" in m for m in result.missing)
    assert any("Enter contractor cost" in m for m in result.missing)


def test_selling_override_does_not_receive_markup_again():
    req = EstimateRequest.model_validate({"items": [{
        "task_code": "panel.replace", "description_en": "Replace main panel",
        "unit": "job", "quantity": 1, "unit_selling_price_override": "1750.00",
    }], "overhead_pct": 30, "profit_pct": 25})
    assert price_estimate(req).selling_total == d("1750.00")


def test_duplicate_ev_breaker_is_blocked():
    req = EstimateRequest.model_validate({"items": [
        standard("breaker.ev40", 1, 45, 1), standard("breaker.ev40", 1, 45, 1),
    ]})
    result = price_estimate(req)
    assert result.status == "incomplete"
    assert any("Duplicate task code" in m for m in result.missing)


def test_mix_future_subpanel_excluded_now():
    items = [standard("panel.existing20", 20, 18, "0.3"),
             standard("ev.breaker40", 1, 40, 1),
             standard("ev.wire100ft", 100, 3, "0.12"),
             standard("future.breaker100", 1, 110, 1),
             {**standard("future.subpanel", 1, 900, 10), "excluded": True}]
    result = price_estimate(EstimateRequest.model_validate({"items": items}))
    assert result.status == "ready_for_contractor_review"
    assert [x.task_code for x in result.lines] == ["panel.existing20", "ev.breaker40", "ev.wire100ft", "future.breaker100"]


def test_client_projection_only_approved_and_allowlisted():
    result = price_estimate(EstimateRequest.model_validate({"items": [standard("outlet.gfci", 2, 35, 1)]}))
    with pytest.raises(ValueError):
        customer_projection(result, approved=False)
    projection = customer_projection(result, approved=True)
    assert "direct_total" not in projection
    assert "labor" not in str(projection).lower()
    assert "material_cost_per_unit" not in str(projection)
    assert "source" not in str(projection)
    assert projection["document_type"] == "preliminary_estimate"


def test_invalid_inputs_rejected_not_silently_fixed():
    with pytest.raises(Exception):
        EstimateRequest.model_validate({"items": [standard("outlet.standard", -2, 15, 1)]})
    with pytest.raises(Exception):
        EstimateRequest.model_validate({"items": [standard("outlet.standard", 1, 15, 1)], "overhead_pct": 150})
    with pytest.raises(Exception):
        EstimateRequest.model_validate({"items": [standard("outlet.standard", 1, 15, 1)], "org_id": "victim"})
    with pytest.raises(Exception):
        EstimateRequest.model_validate({"items": [standard("outlet.standard", 1, 15, 1)], "mobilization_direct_cost": 50})


def test_endpoint_rejects_unauthenticated_requests():
    app.dependency_overrides.clear()
    client = TestClient(app)
    response = client.post("/v1/estimate/price", json={"items": [standard("outlet.standard", 1, 10, 1)]})
    assert response.status_code == 401


def test_endpoint_authenticated_contractors_get_private_draft_only():
    app.dependency_overrides[require_principal] = lambda: Principal(user_id="u1", org_id="org1")
    try:
        client = TestClient(app)
        response = client.post("/v1/estimate/price", json={"items": [standard("outlet.standard", 1, 10, 1)]})
        assert response.status_code == 200, response.text
        obj = response.json()
        assert obj["status"] == "ready_for_contractor_review"
        assert obj["preliminary"] is True
        assert "transcript" not in response.text
    finally:
        app.dependency_overrides.clear()


def test_interpret_route_requires_auth_even_with_valid_description():
    client = TestClient(app)
    response = client.post("/v1/interpret", json={"description": "Change five outlets including two GFCI"})
    assert response.status_code == 401


def test_interpret_model_rejects_unrequested_money_fields():
    from app.interpret import Interpretation
    with pytest.raises(Exception):
        Interpretation.model_validate({
            "trade": "electrical", "project_summary_en": "Replace outlets",
            "project_summary_es": "Cambiar tomacorrientes", "tasks": [],
            "excluded_work": [], "future_work": [], "unknown_details": [], "confidence_notes": [],
            "total": 99999,
        })


def test_same_task_different_rooms_do_not_count_as_duplicates():
    a = standard("paint.wall", 100, 4, "0.1")
    req = EstimateRequest.model_validate({"items": [
        {**a, "scope_id": "bedroom-1"}, {**a, "scope_id": "bedroom-2"}
    ]})
    assert price_estimate(req).status == "ready_for_contractor_review"


def test_override_does_not_report_zero_direct_cost():
    req = EstimateRequest.model_validate({"items": [{"task_code": "paint.1", "unit": "job", "quantity": 1,
        "description_en": "Paint a room", "unit_selling_price_override": 200}]})
    result = price_estimate(req)
    assert result.selling_total == d(200)
    assert result.direct_total is None


def test_customer_projection_uses_selected_spanish_language():
    req = EstimateRequest.model_validate({"items": [standard("outlet.gfci", 2, 35, 1)], "customer_language": "es"})
    result = price_estimate(req)
    assert customer_projection(result, approved=True)["scope"][0]["description"] == "Reemplazar tomacorrientes"
