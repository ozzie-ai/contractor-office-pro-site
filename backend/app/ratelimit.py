"""Per-user sliding-window limit on AI calls, to cap OpenAI spend. In-memory: fine for one instance."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from uuid import UUID

from .errors import ApiError


class RateLimiter:
    def __init__(self, per_hour: int, clock=time.monotonic):
        self._limit, self._clock = per_hour, clock
        self._hits: dict[UUID, deque[float]] = defaultdict(deque)

    def check(self, user_id: UUID) -> None:
        now = self._clock()
        hits = self._hits[user_id]
        while hits and now - hits[0] > 3600:
            hits.popleft()
        if len(hits) >= self._limit:
            raise ApiError(429, "rate_limited", "Too many AI requests this hour. Try again later.")
        hits.append(now)
