import asyncio
import httpx
import pytest
from fastapi import HTTPException

import app.main as main


def test_supabase_verification_resolves_org_from_membership(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params=None):
            assert headers["Authorization"] == "Bearer verified"
            if url.endswith("/auth/v1/user"):
                return httpx.Response(200, json={"id": "user-uuid"})
            assert params["user_id"] == "eq.user-uuid"
            return httpx.Response(200, json=[{"org_id": "org-from-server"}])
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    principal = asyncio.run(main.require_principal("Bearer verified"))
    assert principal.user_id == "user-uuid"
    assert principal.org_id == "org-from-server"


def test_supabase_membership_missing_denied(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params=None):
            if url.endswith("/auth/v1/user"):
                return httpx.Response(200, json={"id": "user-uuid"})
            return httpx.Response(200, json=[])
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    with pytest.raises(HTTPException) as err:
        asyncio.run(main.require_principal("Bearer verified"))
    assert err.value.status_code == 403


def test_supabase_multiple_businesses_requires_explicit_selection(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-anon")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url, *, headers, params=None):
            if url.endswith("/auth/v1/user"):
                return httpx.Response(200, json={"id": "user-uuid"})
            return httpx.Response(200, json=[{"org_id": "first"}, {"org_id": "second"}])
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: FakeClient())
    with pytest.raises(HTTPException) as err:
        asyncio.run(main.require_principal("Bearer verified"))
    assert err.value.status_code == 409
