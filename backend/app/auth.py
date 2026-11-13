"""Verifies Supabase access tokens (ES256 via the project's public JWKS) and resolves the caller's business."""
from __future__ import annotations

import time
from typing import Protocol
from uuid import UUID

import httpx
import jwt

from .config import Settings
from .errors import ApiError
from .schemas import Member


class KeyProvider(Protocol):
    def signing_key(self, token: str) -> object: ...


class JWKSKeyProvider:
    def __init__(self, supabase_url: str):
        self._client = jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)

    def signing_key(self, token: str) -> object:
        return self._client.get_signing_key_from_jwt(token).key


class MemberDirectory(Protocol):
    async def member_for(self, user_id: UUID) -> Member | None: ...


class SupabaseMemberDirectory:
    """Looks up members with the service key (server-side only), cached briefly."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient, ttl: float = 300):
        self._settings, self._http, self._ttl = settings, http, ttl
        self._cache: dict[UUID, tuple[float, Member | None]] = {}

    async def member_for(self, user_id: UUID) -> Member | None:
        hit = self._cache.get(user_id)
        if hit and time.monotonic() - hit[0] < self._ttl:
            return hit[1]
        key = self._settings.supabase_service_key
        resp = await self._http.get(
            f"{self._settings.supabase_url}/rest/v1/members",
            params={"user_id": f"eq.{user_id}", "deleted_at": "is.null", "select": "id,org_id,role", "limit": "1"},
            headers={"apikey": key, "Authorization": f"Bearer {key}"} if not key.startswith("sb_") else {"apikey": key},
            timeout=10,
        )
        if resp.status_code != 200:
            raise ApiError(503, "auth_unavailable", "Couldn't verify your account. Try again.")
        rows = resp.json()
        member = Member(user_id=user_id, member_id=rows[0]["id"], org_id=rows[0]["org_id"], role=rows[0]["role"]) if rows else None
        self._cache[user_id] = (time.monotonic(), member)
        return member


class Authenticator:
    def __init__(self, supabase_url: str, keys: KeyProvider, members: MemberDirectory):
        self._issuer = f"{supabase_url}/auth/v1"
        self._keys, self._members = keys, members

    def user_id(self, authorization: str | None) -> UUID:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise ApiError(401, "access_denied", "Sign in again.")
        token = authorization.split(" ", 1)[1].strip()
        try:
            claims = jwt.decode(token, self._keys.signing_key(token), algorithms=["ES256", "RS256"],
                                audience="authenticated", issuer=self._issuer)
            return UUID(claims["sub"])
        except (jwt.PyJWTError, KeyError, ValueError):
            raise ApiError(401, "access_denied", "Sign in again.") from None

    async def member(self, authorization: str | None) -> Member:
        user_id = self.user_id(authorization)
        member = await self._members.member_for(user_id)
        if member is None:
            raise ApiError(403, "no_business", "Set up your business in the app first.")
        return member
