"""Research references are read-only planning data, not selling rates."""
import asyncio
import httpx
from fastapi.testclient import TestClient
import app.main as main
import app.research as research


def sample():
    return {"reference_id":"COP-PL-001","reference_kind":"reviewed_budget",
            "trade":"Plumbing","service":"Replace toilet","unit":"each",
            "locality":"US national","low_usd":"200.00","high_usd":"500.00",
            "planning_rate_usd":None,"cost_basis":"labor","scope":"Existing install",
            "exclusions":"Toilet purchase","evidence_note":"Preliminary",
            "checked_on":"2026-11-09","recheck_on":"2027-02-07",
            "review_status":"reviewed_preliminary_budget","budget_usable":True,
            "automatic_final_quote":False}


def test_research_requires_business_authentication():
    assert TestClient(main.app).get("/v1/research-references").status_code == 401


def test_research_scoped_jwt_returns_only_reference_not_ratebook(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL","https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY","public-key")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,url,*,headers,params):
            assert url.endswith("/rest/v1/cop_research_references")
            assert headers["Authorization"] == "Bearer caller-jwt"
            assert params["budget_usable"] == "eq.true"
            assert params["limit"] == "30"
            assert "unit_price" not in params["select"]
            return httpx.Response(200,json=[sample()])
    monkeypatch.setattr(research.httpx,"AsyncClient",lambda **kwargs:FakeClient())
    main.app.dependency_overrides[main.require_principal]=lambda:main.Principal(user_id="u",org_id="o")
    try:
        resp=TestClient(main.app).get("/v1/research-references",headers={"Authorization":"Bearer caller-jwt"})
        assert resp.status_code == 200, resp.text
        assert resp.json()[0]["automatic_final_quote"] is False
        assert resp.json()[0]["low_usd"] == "200.00"
        assert "unit_price" not in resp.text
    finally:
        main.app.dependency_overrides.clear()


def test_research_rejects_unsafe_final_quote_flag(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL","https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY","public-key")
    class FakeClient:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,url,*,headers,params):
            return httpx.Response(200,json=[{**sample(),"automatic_final_quote":True}])
    monkeypatch.setattr(research.httpx,"AsyncClient",lambda **kwargs:FakeClient())
    from fastapi import HTTPException
    try:
        asyncio.run(research.list_research_references("Bearer jwt",30,True))
    except HTTPException as e:
        assert e.status_code == 503
    else:
        assert False,"Unsafe data should fail closed"
