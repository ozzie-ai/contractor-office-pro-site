import asyncio
import uuid

import httpx

from app.auth import SupabaseMemberDirectory
from app.config import Settings


def directory(responses: list[list[dict]]) -> tuple[SupabaseMemberDirectory, list[int]]:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(200, json=responses[min(len(calls) - 1, len(responses) - 1)])

    settings = Settings(openai_api_key="x", supabase_url="https://example.supabase.co", supabase_service_key="sb_secret_x")
    return SupabaseMemberDirectory(settings, httpx.AsyncClient(transport=httpx.MockTransport(handler))), calls


def test_user_who_just_set_up_business_is_found_immediately():
    user, org, member = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    d, _ = directory([[], [{"id": str(member), "org_id": str(org), "role": "owner"}]])
    assert asyncio.run(d.member_for(user)) is None
    found = asyncio.run(d.member_for(user))
    assert found is not None and found.org_id == org


def test_found_members_are_cached():
    user = uuid.uuid4()
    d, calls = directory([[{"id": str(uuid.uuid4()), "org_id": str(uuid.uuid4()), "role": "owner"}]])
    asyncio.run(d.member_for(user))
    asyncio.run(d.member_for(user))
    assert len(calls) == 1
