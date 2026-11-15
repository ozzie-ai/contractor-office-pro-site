"""Static interface contract between the Expo client and authenticated FastAPI service.

    This is a code-level test; external Supabase and AI deployment still need live QA.
"""
from pathlib import Path
from app.main import app

ROOT = Path(__file__).resolve().parents[2]


def test_expo_bridge_targets_backend_routes_and_environment_contract():
    bridge = (ROOT / "mobile" / "src" / "sharedEngine.ts").read_text()
    routes = {route.path for route in app.routes}
    for path in ("/v1/interpret", "/v1/estimate/price", "/v1/pricebook"):
        assert path in routes
    assert "base+'/v1/interpret'" in bridge
    assert "base+'/v1/estimate/price'" in bridge
    for name in ("EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_COP_BACKEND_URL"):
        assert name in bridge
    assert "Bearer '+session.accessToken" in bridge
    # Protect the server secret boundary.
    assert "OPENAI_API_KEY" not in bridge
    assert "SUPABASE_SERVICE_ROLE_KEY" not in bridge
