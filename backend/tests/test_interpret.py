import base64

from app.errors import ApiError

from .conftest import SECRET_NOTE

BODY = {"description": f"Cambiar el panel de 100 a 200 amperios. {SECRET_NOTE}", "language": "es"}


def test_returns_draft_interpretation(client, auth_headers):
    r = client.post("/v1/interpret", json=BODY, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == 1 and data["pricing_status"] == "not_priced"
    task = data["interpretation"]["tasks"][0]
    assert task["task_code"] == "ELEC.PANEL.UPGRADE" and task["evidence"] == "stated"
    assert data["interpretation"]["future_work"] == ["Subpanel"]


def test_photo_evidence_is_never_included_without_confirmation(client, auth_headers):
    tasks = client.post("/v1/interpret", json=BODY, headers=auth_headers).json()["interpretation"]["tasks"]
    photo_task = next(t for t in tasks if t["evidence"] == "photo")
    assert photo_task["status"] == "allowance_to_confirm"


def test_validation_errors_never_echo_private_notes(client, auth_headers):
    r = client.post("/v1/interpret", json={"description": SECRET_NOTE[:5], "secret": SECRET_NOTE}, headers=auth_headers)
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_request"
    assert "gate code" not in r.text and "PRIVATE" not in r.text


def test_rejects_too_many_or_bad_images(client, auth_headers):
    image = {"content_type": "image/jpeg", "data_base64": base64.b64encode(b"x" * 200).decode()}
    r = client.post("/v1/interpret", json={**BODY, "images": [image] * 7}, headers=auth_headers)
    assert r.status_code == 400

    bad = {"content_type": "image/jpeg", "data_base64": "!" * 200}
    r = client.post("/v1/interpret", json={**BODY, "images": [bad]}, headers=auth_headers)
    assert r.json()["error"] == "image_invalid"

    huge = {"content_type": "image/jpeg", "data_base64": base64.b64encode(b"x" * (2 * 1024 * 1024 + 1)).decode()}
    r = client.post("/v1/interpret", json={**BODY, "images": [huge]}, headers=auth_headers)
    assert r.json()["error"] == "image_too_large"


def test_images_reach_the_interpreter(client, auth_headers, fakes):
    image = {"content_type": "image/png", "data_base64": base64.b64encode(b"x" * 200).decode()}
    client.post("/v1/interpret", json={**BODY, "images": [image, image]}, headers=auth_headers)
    assert len(fakes["interpreter"].requests[-1].images) == 2


def test_provider_errors_use_pilot_codes_and_hide_details(client, auth_headers, fakes):
    for err in [ApiError(429, "ai_rate_limited", "busy"), ApiError(504, "ai_timeout", "slow"),
                ApiError(502, "ai_provider_failed", "problem")]:
        fakes["interpreter"].error = err
        r = client.post("/v1/interpret", json=BODY, headers=auth_headers)
        assert r.status_code == err.status and r.json()["error"] == err.code
        assert SECRET_NOTE not in r.text


def test_per_user_rate_limit(client, auth_headers):
    codes = [client.post("/v1/interpret", json=BODY, headers=auth_headers).status_code for _ in range(6)]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


def test_unknown_catalog_codes_are_rejected_by_schema():
    from pydantic import ValidationError

    from app.schemas import WorkItem
    try:
        WorkItem(category="x", task_code="MADE.UP", description_en="", description_es="", quantity=None, unit=None,
                 specifications=[], status="included_now", evidence="stated")
    except ValidationError:
        return
    raise AssertionError("made-up task codes must not validate")


def test_openapi_docs_are_published(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/v1/interpret" in paths and "/v1/transcribe" in paths


def test_questions_come_with_tap_choices_and_no_filler(client, auth_headers):
    i = client.post("/v1/interpret", json=BODY, headers=auth_headers).json()["interpretation"]
    assert i["questions"] == [{"question": "Where is the panel?", "choices": ["Garage", "Outside"]}], \
        "'Not sure', duplicates and blanks are removed (the app adds 'Not sure' itself)"
    assert i["unknown_details"] == ["Where is the panel?"], "older clients still get plain questions"
