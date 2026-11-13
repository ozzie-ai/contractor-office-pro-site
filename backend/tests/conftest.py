from __future__ import annotations

import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.ai import enforce_rules
from app.auth import Authenticator
from app.config import Settings
from app.errors import ApiError
from app.main import Services, create_app
from app.pricing import ContractorPrice, Observation, OrgPricing, PricingInputs
from app.ratelimit import RateLimiter
from app.schemas import Interpretation, InterpretRequest, LineUpdate, Member, Refinement, RefineRequest, WorkItem
from app.ai import enforce_refinement

SUPABASE = "https://example.supabase.co"
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())
USER_WITH_BUSINESS = uuid.uuid4()
USER_WITHOUT_BUSINESS = uuid.uuid4()
SECRET_NOTE = "PRIVATE-NOTE gate code 4321"


def make_token(user: uuid.UUID, key=PRIVATE_KEY, issuer=f"{SUPABASE}/auth/v1", expires_in=3600) -> str:
    now = int(time.time())
    return jwt.encode({"sub": str(user), "aud": "authenticated", "iss": issuer, "iat": now, "exp": now + expires_in},
                      key, algorithm="ES256")


class FixedKey:
    def signing_key(self, token: str):
        return PRIVATE_KEY.public_key()


class FakeMembers:
    async def member_for(self, user_id):
        if user_id == USER_WITH_BUSINESS:
            return Member(user_id=user_id, member_id=uuid.uuid4(), org_id=uuid.uuid4(), role="owner")
        return None


class FakeInterpreter:
    def __init__(self):
        self.requests: list[InterpretRequest] = []
        self.error: ApiError | None = None

    async def interpret(self, request: InterpretRequest) -> Interpretation:
        self.requests.append(request)
        if self.error:
            raise self.error
        return enforce_rules(Interpretation(
            trade="electrical", project_summary_en="Panel upgrade", project_summary_es="Cambio de panel",
            tasks=[WorkItem(category="panel", task_code="ELEC.PANEL.UPGRADE", description_en="Upgrade panel to 200A",
                            description_es="Cambiar panel a 200A", quantity=1, unit="job", specifications=["200A"],
                            status="included_now", evidence="stated"),
                   WorkItem(category="panel", task_code=None, description_en="Possible grounding upgrade",
                            description_es="Posible mejora de tierra", quantity=None, unit=None, specifications=[],
                            status="included_now", evidence="photo")],
            excluded_work=[], future_work=["Subpanel"], unknown_details=["Panel location?"], confidence_notes=[]))

    async def refine(self, request: RefineRequest) -> Refinement:
        self.refine_requests = getattr(self, "refine_requests", []) + [request]
        if self.error:
            raise self.error
        raw = Refinement(
            add=[WorkItem(category="ev", task_code="ELEC.EV.CHARGER.INSTALL", description_en="Install customer-supplied EV charger",
                          description_es="Instalar cargador suministrado por el cliente", quantity=1, unit="each",
                          specifications=["customer-supplied"], status="included_now", evidence="inferred")],
            update=[LineUpdate(ref=1, quantity=80, unit="linear ft", reason_en="Answer: run is 80 ft"),
                    LineUpdate(ref=99, quantity=5, unit=None, reason_en="bogus ref"),
                    LineUpdate(ref=0, quantity=None, unit=None, reason_en="no-op")],
            exclusions=["Charger hardware supplied by customer"], remaining_questions=["Where is the panel located?"])
        return enforce_refinement(raw, {l.ref for l in request.current_lines})


class FakePricing:
    def __init__(self):
        self.contractor: dict[str, ContractorPrice] = {}

    async def inputs(self, org_id, task_codes, region_override):
        from datetime import date
        from decimal import Decimal
        return PricingInputs(
            org=OrgPricing(region_override or "US-CA-LA", Decimal("0.10"), Decimal("0.10")),
            region_chain=[region_override or "US-CA-LA", "US-CA"], contractor=dict(self.contractor),
            observations=[Observation("ELEC.PANEL.UPGRADE", "US-CA-LA", "Pilot LA planning allowance (illustrative)",
                                      date(2026, 11, 12), bid=Decimal("2100"), confidence="low",
                                      applies_to="200A panel")])


class FakeRefiner:
    """Mixed into FakeInterpreter below."""


class FakeTranscriber:
    async def transcribe(self, audio, filename, content_type, language):
        return "Cambiar el panel de 100 a 200 amperios"


@pytest.fixture
def fakes():
    return {"interpreter": FakeInterpreter(), "pricing": FakePricing()}


@pytest.fixture
def client(fakes):
    settings = Settings(openai_api_key="test", supabase_url=SUPABASE, supabase_service_key="test", ai_requests_per_hour=5)
    services = Services(settings=settings, auth=Authenticator(SUPABASE, FixedKey(), FakeMembers()),
                        interpreter=fakes["interpreter"], transcriber=FakeTranscriber(),
                        limiter=RateLimiter(settings.ai_requests_per_hour), pricing=fakes["pricing"])
    return TestClient(create_app(services))


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {make_token(USER_WITH_BUSINESS)}"}
