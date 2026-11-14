"""Product slice: spoken scope -> structured takeoff -> priced draft -> approved safe projection.

Uses safe local test values; never exercises a real customer or charges any account.
"""
from fastapi.testclient import TestClient

from app.main import Principal, app, require_principal
from app.pricing import EstimateResult, customer_projection


def test_five_outlets_workflow_without_external_model_or_live_store(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app.dependency_overrides[require_principal] = lambda: Principal(user_id="test-user", org_id="test-org")
    try:
        client = TestClient(app)
        speech = "Cambiar cinco tomacorrientes, dos son GFCI"
        interpreted = client.post("/v1/interpret", json={"description": speech})
        assert interpreted.status_code == 200, interpreted.text
        job = interpreted.json()["interpretation"]
        assert [item["quantity"] for item in job["tasks"]] == ["3", "2"]
        assert job["unknown_details"]
        assert "price" not in job or job.get("price") is None

        # Contractor provides explicit per-unit test inputs, after reviewing
        # the open questions; the interpreter never guesses costs.
        items = []
        for task in job["tasks"]:
            gfci = "GFCI" in task["description_en"]
            items.append({
                "task_code": "ELEC.GFCI" if gfci else "ELEC.RECEPTACLE.STANDARD",
                "description_en": task["description_en"],
                "description_es": task["description_es"],
                "quantity": task["quantity"], "unit": task["unit"],
                "direct_cost": {
                    "labor_hours_per_unit": "0.75" if gfci else "0.6",
                    "loaded_labor_rate": "60",
                    "material_cost_per_unit": "30" if gfci else "15",
                    "source": "planning_allowance",
                }
            })

        draft = client.post("/v1/estimate/price", json={
            "items": items, "overhead_pct": 10, "profit_pct": 20,
            "mobilization_direct_cost": 75, "mobilization_source": "planning_allowance",
            "customer_language": "en",
        })
        assert draft.status_code == 200, draft.text
        result = EstimateResult.model_validate(draft.json())
        assert result.status == "ready_for_contractor_review"
        assert str(result.selling_total) == "498.96"
        assert result.preliminary is True
        assert "Cambiar cinco tomacorrientes" not in draft.text  # raw private dictation never returned

        projection = customer_projection(result, approved=True)
        assert projection["total"] == "498.96"
        assert len(projection["scope"]) == 2
        assert "material_cost_per_unit" not in str(projection)
        assert "labor_hours" not in str(projection)
        assert "planning_allowance" not in str(projection)
    finally:
        app.dependency_overrides.clear()
