"""Readiness checks authentication configuration separately from optional AI."""
from fastapi.testclient import TestClient
from app.main import app


def test_readiness_distinguishes_auth_from_optional_ai(monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    missing = client.get("/ready")
    assert missing.status_code == 503
    assert missing.json() == {"detail": {"error": "auth_configuration_missing"}}
    public = client.get("/v1/capabilities")
    assert public.status_code == 200
    assert public.json()["auth_environment_configured"] is False
    assert public.json()["ai_environment_configured"] is False
    assert public.json()["deterministic_device_interpretation"] is True

    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-development-key")
    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "configured"
    caps = client.get("/v1/capabilities").json()
    assert caps["auth_environment_configured"] is True
    assert caps["ai_environment_configured"] is False
    assert caps["pricing_math_available"] is True
    assert caps["live_provider_verification"] is False

    monkeypatch.setenv("OPENAI_API_KEY", "test-only-not-real")
    caps_with_ai = client.get("/v1/capabilities")
    assert caps_with_ai.json()["ai_environment_configured"] is True
    assert "test-only-not-real" not in caps_with_ai.text
    assert "public-development-key" not in caps_with_ai.text


def test_readiness_rejects_non_https_auth_url(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://untrusted.example")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    assert TestClient(app).get("/ready").status_code == 503
