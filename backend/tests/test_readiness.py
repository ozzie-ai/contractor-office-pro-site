"""Liveness stays public; readiness never exposes configuration secrets."""
from fastapi.testclient import TestClient
from app.main import app


def test_readiness_distinguishes_missing_configuration(monkeypatch):
    for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    missing = client.get("/ready")
    assert missing.status_code == 503
    assert missing.json() == {"detail": {"error": "backend_configuration_missing"}}
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-development-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-not-real")
    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "configured"
    assert "test-only-not-real" not in ready.text
    assert "public-development-key" not in ready.text
