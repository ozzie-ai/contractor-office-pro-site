"""Bootstrap requires a verified JWT and creates only the signed-in user's org."""
import httpx
from fastapi.testclient import TestClient
import app.main as main


def test_bootstrap_denies_missing_token():
    client = TestClient(main.app)
    assert client.post("/v1/account/bootstrap", json={
        "business_name": "Test Business", "display_name": "Test Owner"
    }).status_code == 401


def test_bootstrap_verifies_jwt_and_uses_supabase_scoped_rpc(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-test")
    called = {"rpc": False}
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params=None):
            assert headers["Authorization"] == "Bearer verified"
            if url.endswith("/auth/v1/user"):
                return httpx.Response(200, json={"id": "test-user"})
            assert url.endswith("/rest/v1/members")
            return httpx.Response(200, json=[{"org_id": "server-owned-org"}])
        async def post(self, url, *, headers, json):
            called["rpc"] = True
            assert url.endswith("/rest/v1/rpc/create_org_for_user")
            assert headers["Authorization"] == "Bearer verified"
            assert "service_role" not in str(headers)
            assert json["p_org_name"] == "Contractor Test Company"
            assert json["p_display_name"] == "Contractor"
            assert json["p_language"] == "es"
            assert json["p_org_id"] != json["p_member_id"]
            return httpx.Response(200, json="server-owned-org")
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    result = TestClient(main.app).post("/v1/account/bootstrap",
      headers={"Authorization": "Bearer verified"},
      json={"business_name": "Contractor Test Company",
            "display_name": "Contractor", "language": "es"})
    assert result.status_code == 200, result.text
    assert result.json() == {"status": "authorized"}
    assert called["rpc"] is True
