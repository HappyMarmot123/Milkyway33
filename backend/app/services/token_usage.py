from upstash_redis.asyncio import Redis

SHARED_TOKEN_KEY = "shared:token_usage"


class TokenUsageService:
    def __init__(self):
        self._redis: Redis | None = None

    @property
    def redis(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_env()
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
