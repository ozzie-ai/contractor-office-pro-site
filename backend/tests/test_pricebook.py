import asyncio
import httpx

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pricebook import PriceBookCreate, list_pricebook


@pytest.fixture(autouse=True)
def reset_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_pricebook_needs_configuration(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    with pytest.raises(HTTPException) as err:
        asyncio.run(list_pricebook("org1", "Bearer abc", 50))
    assert err.value.status_code == 503


def test_ratebook_rejects_client_org_and_invalid_price():
    with pytest.raises(Exception):
        PriceBookCreate.model_validate({"kind": "material", "name_en": "GFCI", "unit": "ea",
            "unit_cost": 10, "unit_price": 15, "org_id": "someone-else"})
    with pytest.raises(Exception):
        PriceBookCreate.model_validate({"kind": "material", "name_en": "GFCI", "unit": "ea",
            "unit_cost": 10, "unit_price": 0})


def test_ratebook_requires_user_auth():
    client = TestClient(app)
    assert client.get("/v1/pricebook").status_code == 401
    assert client.post("/v1/pricebook", json={}).status_code in (401, 422)


def test_list_pricebook_scopes_to_verified_org(monkeypatch):
    import app.pricebook as pb
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params):
            assert params["org_id"] == "eq.our-org"
            assert params["deleted_at"] == "is.null"
            assert headers["Authorization"] == "Bearer caller-jwt"
            return httpx.Response(200, json=[{
                "id": "item-1", "kind": "material", "name_en": "GFCI", "unit": "ea",
                "unit_cost": 17, "unit_price": 35, "category": "electrical",
            }])
    monkeypatch.setattr(pb.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    rows = asyncio.run(pb.list_pricebook("our-org", "Bearer caller-jwt", 50))
    assert len(rows) == 1 and rows[0].source == "contractor_entered"


def test_create_ratebook_inserts_only_verified_org(monkeypatch):
    import app.pricebook as pb
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, *, headers, json):
            assert json["org_id"] == "our-org"
            assert json["name_en"] == "GFCI"
            assert headers["Authorization"] == "Bearer caller-jwt"
            return httpx.Response(201, json=[{"id": "item-1", **json}])
    monkeypatch.setattr(pb.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    entry = pb.PriceBookCreate(kind="material", name_en="GFCI", unit="ea", unit_cost=17, unit_price=35)
    saved = asyncio.run(pb.create_pricebook_entry("our-org", "Bearer caller-jwt", entry))
    assert saved.unit_price == 35


def test_ratebook_error_does_not_leak_remote_sql_or_customer_data(monkeypatch):
    import app.pricebook as pb
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, *, headers, json):
            return httpx.Response(403, json={"internal": "sql policy secret"})
    monkeypatch.setattr(pb.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    from fastapi import HTTPException
    entry = pb.PriceBookCreate(kind="material", name_en="GFCI", unit="ea", unit_cost=17, unit_price=35)
    with pytest.raises(HTTPException) as err:
        asyncio.run(pb.create_pricebook_entry("our-org", "Bearer jwt", entry))
    assert err.value.status_code == 403
    assert "sql policy secret" not in str(err.value.detail)
