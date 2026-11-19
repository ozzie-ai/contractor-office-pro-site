"""The Expo client must prove backend membership before showing AI connected."""
from fastapi.testclient import TestClient
from app.main import app, Principal, require_principal


def test_backend_account_status_requires_auth_and_active_membership():
    client = TestClient(app)
    assert client.get("/v1/account/status").status_code == 401
    app.dependency_overrides[require_principal] = lambda: Principal(user_id="test-user", org_id="test-org")
    try:
        response = client.get("/v1/account/status")
        assert response.status_code == 200
        assert response.json() == {"status": "authorized"}
        assert "test-org" not in response.text
    finally:
        app.dependency_overrides.clear()
