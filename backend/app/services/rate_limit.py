import time

from fastapi import HTTPException, Request, status
from upstash_ratelimit import FixedWindow, Ratelimit
from upstash_redis import Redis


redis = Redis.from_env()

DAILY_LIMIT = 13
CHAT_COOLDOWN_SECONDS = 10

cooldown_limiter = Ratelimit(
    redis=redis,
    limiter=FixedWindow(max_requests=1, window=CHAT_COOLDOWN_SECONDS),
    prefix="cooldown",
)

daily_limiter = Ratelimit(
    redis=redis,
    limiter=FixedWindow(max_requests=DAILY_LIMIT, window=86400),   # 24시간
    prefix="daily",
)


def get_client_key(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()

    return request.client.host if request.client else "unknown"


def get_retry_after_seconds(reset_at: float, fallback: int) -> int:
    if not reset_at:
        return fallback

    return max(1, int(reset_at - time.time()))


def daily_headers(remaining: int) -> dict[str, str]:
    return {
        "X-Daily-Limit": str(DAILY_LIMIT),
        "X-Daily-Remaining": str(max(0, remaining)),
    }


def raise_daily_limit() -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "message": "오늘의 채팅 횟수를 모두 사용했습니다. 내일 다시 이용해주세요.",
        },
        headers={
            "Retry-After": "86400",
            "Cache-Control": "no-store",
            **daily_headers(0),
        },
    )


def enforce_limits(request: Request) -> dict[str, int]:
    key = get_client_key(request)
    daily_remaining = daily_limiter.get_remaining(key)

    if daily_remaining <= 0:
        raise_daily_limit()

    cooldown = cooldown_limiter.limit(key)
    if not cooldown.allowed:
        retry_after = get_retry_after_seconds(cooldown.reset, CHAT_COOLDOWN_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "요청 간격 제한이 적용 중입니다.",
                "retry_after": retry_after,
            },
            headers={
                "Retry-After": str(retry_after),
                "Cache-Control": "no-store",
                **daily_headers(daily_remaining),
            },
        )

    daily = daily_limiter.limit(key)
    if not daily.allowed:
        raise_daily_limit()

    return {
        "limit": DAILY_LIMIT,
        "remaining": daily.remaining,
    }
