import time
import os
import logging

from fastapi import HTTPException, Request, status
from upstash_ratelimit import FixedWindow, Ratelimit
from upstash_redis import Redis
from app.core.config import settings

logger = logging.getLogger(__name__)

DAILY_LIMIT = 13
CHAT_COOLDOWN_SECONDS = settings.CHAT_COOLDOWN_SECONDS

redis = None
cooldown_limiter = None
daily_limiter = None
init_error = None

try:
    url = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN")

    if not url or not token:
        raise ValueError("Neither UPSTASH_REDIS_REST_URL/TOKEN nor KV_REST_API_URL/TOKEN is set.")

    # Strip quotes if present
    url = url.strip('"\'')
    token = token.strip('"\'')

    redis = Redis(url=url, token=token)
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
except Exception as e:
    init_error = e
    logger.error(f"Failed to initialize Upstash Redis Rate Limiter: {e}")


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


def check_init_error():
    if init_error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": f"Rate limiter initialization error: {str(init_error)}. Please configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL and KV_REST_API_TOKEN) in Vercel environment variables.",
            }
        )


def get_daily_remaining(key: str) -> int:
    check_init_error()
    return daily_limiter.get_remaining(key)


def enforce_limits(request: Request) -> dict[str, int]:
    check_init_error()
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
