"""Consent, image validation and price separation for photo observation API."""
import asyncio
import base64
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.photo_inspection import PhotoInspectionRequest, inspect_photo

# Small fake JPEG header is sufficient for transport validation. No actual AI calls.
FAKE = base64.b64encode(b"\xff\xd8\xff" + b"X" * 96).decode()


def request_data(**changes):
    return {"image_base64": FAKE, "mime_type": "image/jpeg",
            "contractor_consent": True, "context": "Replace the photographed fixture", **changes}


def test_server_blocks_unauthenticated_photo_transfer():
    response = TestClient(app).post("/v1/photo/inspect", json=request_data())
    assert response.status_code == 401


def test_explicit_consent_required():
    response = TestClient(app).post("/v1/photo/inspect", json=request_data(contractor_consent=False))
    assert response.status_code == 422


def test_image_must_be_valid_and_within_payload_limit():
    async def run():
        with pytest.raises(HTTPException) as invalid:
            await inspect_photo(PhotoInspectionRequest(**request_data(image_base64="bad" * 35)))
        assert invalid.value.status_code == 422
        with pytest.raises(HTTPException) as mismatch:
            await inspect_photo(PhotoInspectionRequest(**request_data(mime_type="image/png")))
        assert mismatch.value.status_code == 422
    asyncio.run(run())


def test_ai_disabled_fails_closed_without_upload(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    async def run():
        with pytest.raises(HTTPException) as exc:
            await inspect_photo(PhotoInspectionRequest(**request_data()))
        assert exc.value.status_code == 503
        assert exc.value.detail == {"error": "ai_service_not_configured"}
    asyncio.run(run())


def test_mocked_image_observation_returns_review_only_no_prices(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake-test-not-a-real-key")
    class MockClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None
        async def post(self, url, headers, json):
            assert json["store"] is False
            assert json["input"][0]["content"][1]["type"] == "input_image"
            assert json["text"]["format"]["strict"] is True
            assert "price" in json["instructions"].lower()
            return httpx.Response(200, json={"status": "completed", "output": [{
                "content": [{"type": "output_text", "text": __import__("json").dumps({
                    "visible_conditions": ["A wall switch is visible"],
                    "possible_work": ["Verify existing wiring before replacement"],
                    "missing_information": ["Cannot infer wall dimensions"],
                    "limitations": ["No scale provided"]
                })}]
            }]})
    monkeypatch.setattr("app.photo_inspection.httpx.AsyncClient", lambda **kw: MockClient())
    response = asyncio.run(inspect_photo(PhotoInspectionRequest(**request_data())))
    assert response.pricing_status == "not_priced"
    assert response.approved_for_scope is False
    serialized = response.model_dump()
    assert "selling_total" not in serialized
    assert "labor_cost" not in serialized
    assert "quantity" not in serialized
