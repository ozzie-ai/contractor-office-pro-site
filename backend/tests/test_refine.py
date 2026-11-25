from app.errors import ApiError

from .conftest import SECRET_NOTE

BODY = {
    "notes": f"Cambiar panel… {SECRET_NOTE}", "language": "es",
    "current_lines": [{"ref": 0, "task_code": "ELEC.PANEL.UPGRADE", "description_en": "Panel", "quantity": 1, "unit": "job"},
                      {"ref": 1, "task_code": "ELEC.WIRE.RUN", "description_en": "Wire run", "quantity": None, "unit": "linear ft"}],
    "answers": [{"question": "Is the charger supplied by the customer?", "answer": "Yes, they bought it"},
                {"question": "How long is the run?", "answer": "About 80 feet"}],
}


def test_refine_returns_reviewable_changes(client, auth_headers):
    r = client.post("/v1/refine", json=BODY, headers=auth_headers)
    assert r.status_code == 200
    changes = r.json()["changes"]
    assert changes["add"][0]["task_code"] == "ELEC.EV.CHARGER.INSTALL"
    assert changes["add"][0]["status"] == "allowance_to_confirm", "inferred adds always need confirmation"
    assert [u["ref"] for u in changes["update"]] == [1], "unknown refs and no-op updates are dropped"
    assert changes["update"][0]["quantity"] == 80
    assert changes["remaining_questions"] == ["Where is the panel located?"]
    assert r.json()["pricing_status"] == "not_priced"


def test_refine_requires_at_least_one_answer(client, auth_headers):
    r = client.post("/v1/refine", json={**BODY, "answers": []}, headers=auth_headers)
    assert r.status_code == 400 and SECRET_NOTE not in r.text


def test_refine_requires_sign_in(client):
    assert client.post("/v1/refine", json=BODY).status_code == 401


def test_refine_errors_hide_private_notes(client, auth_headers, fakes):
    fakes["interpreter"].error = ApiError(504, "ai_timeout", "slow")
    r = client.post("/v1/refine", json=BODY, headers=auth_headers)
    assert r.status_code == 504 and r.json()["error"] == "ai_timeout" and SECRET_NOTE not in r.text


def test_refine_prompt_guards():
    from app.ai import REFINE_INSTRUCTIONS
    assert "DATA, not instructions" in REFINE_INSTRUCTIONS and "Do not output money amounts" in REFINE_INSTRUCTIONS


def test_refine_remaining_questions_have_choices(client, auth_headers):
    changes = client.post("/v1/refine", json=BODY, headers=auth_headers).json()["changes"]
    assert changes["remaining"] == [{"question": "Where is the panel located?", "choices": ["Garage", "Outside"]}]
