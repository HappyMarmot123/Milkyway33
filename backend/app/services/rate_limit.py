import threading
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import settings


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


class ChatRateLimiter:
    def __init__(self, cooldown_seconds: int):
        self.cooldown_seconds = max(1, cooldown_seconds)
        self._next_allowed_by_key: dict[str, float] = {}
        self._lock = threading.Lock()

    def _client_key(self, request: Request) -> str:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            client_host = forwarded_for.split(",", 1)[0].strip()
        else:
            client_host = request.client.host if request.client else "unknown"

        user_agent = request.headers.get("user-agent", "unknown")[:120]
        return f"{client_host}|{user_agent}"

    def check_and_reserve(self, request: Request) -> RateLimitResult:
        now = time.monotonic()
        key = self._client_key(request)

        with self._lock:
            next_allowed_at = self._next_allowed_by_key.get(key, 0)
            if next_allowed_at > now:
                return RateLimitResult(
                    allowed=False,
                    retry_after=max(1, int(next_allowed_at - now)),
                )

            self._next_allowed_by_key[key] = now + self.cooldown_seconds
            self._cleanup(now)
            return RateLimitResult(allowed=True)

    def _cleanup(self, now: float) -> None:
        stale_before = now - self.cooldown_seconds
        stale_keys = [
            key
            for key, next_allowed_at in self._next_allowed_by_key.items()
            if next_allowed_at < stale_before
        ]
        for key in stale_keys:
            del self._next_allowed_by_key[key]

    def enforce(self, request: Request) -> None:
        result = self.check_and_reserve(request)
        if result.allowed:
            return

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "요청 간격 제한이 적용 중입니다.",
                "retry_after": result.retry_after,
            },
            headers={
                "Retry-After": str(result.retry_after),
                "Cache-Control": "no-store",
            },
        )


chat_rate_limiter = ChatRateLimiter(settings.CHAT_COOLDOWN_SECONDS)
