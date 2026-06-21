import os
from upstash_redis.asyncio import Redis

SHARED_TOKEN_KEY = "shared:token_usage"


class TokenUsageService:
    def __init__(self):
        self._redis: Redis | None = None
        self.init_error = None

    @property
    def redis(self) -> Redis:
        if self.init_error:
            raise ValueError(self.init_error)

        if self._redis is None:
            try:
                url = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL")
                token = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN")

                if not url or not token:
                    raise ValueError("Neither UPSTASH_REDIS_REST_URL/TOKEN nor KV_REST_API_URL/TOKEN is set.")

                # Strip quotes if present
                url = url.strip('"\'')
                token = token.strip('"\'')

                self._redis = Redis(url=url, token=token)
            except Exception as e:
                self.init_error = e
                raise ValueError(f"Failed to initialize Redis: {e}")
        return self._redis

    async def accumulate(self, usage: dict) -> None:
        """
        usage_metadata dict를 받아 Redis Hash에 원자적으로 누산한다.
        usage 키: prompt_token_count, candidates_token_count,
                  thoughts_token_count, cached_content_token_count, total_token_count
        """
        if not usage:
            return

        fields = {
            "total_tokens": usage.get("total_token_count") or 0,
            "prompt_tokens": usage.get("prompt_token_count") or 0,
            "candidates_tokens": usage.get("candidates_token_count") or 0,
            "thoughts_tokens": usage.get("thoughts_token_count") or 0,
            "cached_tokens": usage.get("cached_content_token_count") or 0,
        }

        pipe = self.redis.pipeline()
        for field, value in fields.items():
            if value:
                pipe.hincrby(SHARED_TOKEN_KEY, field, value)
        pipe.hincrby(SHARED_TOKEN_KEY, "request_count", 1)
        await pipe.exec()

    async def get_total(self) -> dict:
        """Redis Hash에서 전체 누산값을 반환한다."""
        data = await self.redis.hgetall(SHARED_TOKEN_KEY)
        return {
            "total_tokens": int(data.get("total_tokens", 0)),
            "prompt_tokens": int(data.get("prompt_tokens", 0)),
            "candidates_tokens": int(data.get("candidates_tokens", 0)),
            "thoughts_tokens": int(data.get("thoughts_tokens", 0)),
            "cached_tokens": int(data.get("cached_tokens", 0)),
            "request_count": int(data.get("request_count", 0)),
        }


token_usage_service = TokenUsageService()
