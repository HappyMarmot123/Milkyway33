# Codex 공유 토큰 사용량 실시간화 태스크

## 배경

현재 토큰 사용량은 각 브라우저의 IndexedDB에만 저장됩니다.
모든 사용자가 동일한 API 키를 공유하므로, 토큰 소비는 전체가 함께 부담하는 자원입니다.
이 기능은 소비된 토큰을 Upstash Redis에 누산하여 모든 사용자에게 실시간으로 공유합니다.

## 데이터 흐름

```
사용자 메시지 전송
  → Gemini 스트리밍 (gemini.py)
  → complete 이벤트에서 usage_metadata 캡처
  → Redis HINCRBY로 원자적 누산  ← 신규
  → 프론트엔드 SSE 수신

설정 탭 오픈 / 30초 폴링
  → GET /api/v1/chat/token-usage  ← 신규
  → Redis HGETALL
  → 토큰 사용량 표시 (전체 사용자 합산)
```

## Redis 데이터 구조

```
Key: "shared:token_usage"  (Hash)
Fields:
  total_tokens       → 전체 토큰 합계
  prompt_tokens      → 입력 토큰 합계
  candidates_tokens  → 출력 토큰 합계
  thoughts_tokens    → 사고 토큰 합계
  cached_tokens      → 캐시 토큰 합계
  request_count      → 누적 요청 수
```

구현 순서: Task 1 → 2 → 3 → 4 → 5 → 6

---

## Task 1 — `backend/app/services/token_usage.py` 신규 생성

### 작업 유형
신규 파일 생성

### 참고: 기존 Redis 사용 패턴 (`backend/app/services/rate_limit.py`)

```python
from upstash_redis import Redis
redis = Redis.from_env()  # UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN 환경변수 사용
```

비동기 컨텍스트(gemini.py)에서 호출되므로 `upstash_redis.asyncio` 사용.

### 생성할 파일 전체 코드

```python
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
            "total_tokens":      usage.get("total_token_count") or 0,
            "prompt_tokens":     usage.get("prompt_token_count") or 0,
            "candidates_tokens": usage.get("candidates_token_count") or 0,
            "thoughts_tokens":   usage.get("thoughts_token_count") or 0,
            "cached_tokens":     usage.get("cached_content_token_count") or 0,
        }

        pipe = self.redis.pipeline()
        for field, value in fields.items():
            if value:
                pipe.hincrby(SHARED_TOKEN_KEY, field, value)
        pipe.hincrby(SHARED_TOKEN_KEY, "request_count", 1)
        await pipe.execute()

    async def get_total(self) -> dict:
        """Redis Hash에서 전체 누산값을 반환한다."""
        data = await self.redis.hgetall(SHARED_TOKEN_KEY)
        return {
            "total_tokens":      int(data.get("total_tokens", 0)),
            "prompt_tokens":     int(data.get("prompt_tokens", 0)),
            "candidates_tokens": int(data.get("candidates_tokens", 0)),
            "thoughts_tokens":   int(data.get("thoughts_tokens", 0)),
            "cached_tokens":     int(data.get("cached_tokens", 0)),
            "request_count":     int(data.get("request_count", 0)),
        }


token_usage_service = TokenUsageService()
```

### 주의사항
- Redis 연결은 첫 호출 시 지연 초기화 (lazy init)
- `accumulate` 실패는 스트리밍에 영향을 주면 안 됨 → 호출부에서 try/except 처리 (Task 2)
- `pipeline()`은 여러 HINCRBY를 단일 요청으로 묶어 원자성 보장

---

## Task 2 — `backend/app/services/gemini.py` 수정

### 작업 유형
기존 파일 수정

### 변경 사항

1. `token_usage_service` import 추가
2. `complete` 이벤트를 yield한 직후, `usage_metadata`를 Redis에 누산

### 변경할 부분 1: import 추가 (파일 상단)

```python
# 기존 import 아래에 추가
from app.services.token_usage import token_usage_service
```

### 변경할 부분 2: complete yield 직후 누산 호출

현재 코드에서 아래 블록을 찾는다:

```python
            # Emit the final "complete" event with ALL collected data
            yield json.dumps({
                "status": "complete",
                "response": full_text,
                "model_used": self.model_name,
                "thought": thought,
                "finish_reason": finish_reason,
                "safety_ratings": safety_ratings,
                "usage_metadata": usage_metadata,
            }) + "\n"
```

이 yield 문 바로 뒤에 추가:

```python
            # 공유 토큰 사용량 Redis 누산 (실패해도 스트리밍에 영향 없음)
            if usage_metadata:
                try:
                    await token_usage_service.accumulate(usage_metadata)
                except Exception:
                    pass
```

### 주의사항
- `usage_metadata`는 이미 `serialize_usage_metadata()`를 통해 dict로 변환된 상태
- `except Exception: pass` — Redis 장애가 사용자 응답에 영향을 주지 않도록 조용히 실패
- 기존 스트리밍 로직(청크 처리, 메타데이터 수집) 일체 수정하지 않음

---

## Task 3 — `backend/app/schemas/chat.py` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```python
from typing import Optional, List, Any
from pydantic import BaseModel

class ChatHistoryMessage(BaseModel): ...
class ChatRequest(BaseModel): ...
class SummarizeRequest(BaseModel): ...
class UsageMetadata(BaseModel): ...
class ChatResponse(BaseModel): ...
```

### 추가할 스키마 (파일 맨 아래에 추가)

```python
class SharedTokenUsageResponse(BaseModel):
    total_tokens: int
    prompt_tokens: int
    candidates_tokens: int
    thoughts_tokens: int
    cached_tokens: int
    request_count: int
```

### 주의사항
- 기존 스키마 변경하지 않음

---

## Task 4 — `backend/app/api/endpoints/chat.py` 수정

### 작업 유형
기존 파일 수정

### 변경 사항

1. `SharedTokenUsageResponse`, `token_usage_service` import 추가
2. `GET /chat/token-usage` 엔드포인트 추가

### 변경할 부분 1: import 수정

```python
# 변경 전
from app.schemas.chat import ChatRequest, SummarizeRequest

# 변경 후
from app.schemas.chat import ChatRequest, SummarizeRequest, SharedTokenUsageResponse
from app.services.token_usage import token_usage_service
```

### 변경할 부분 2: 엔드포인트 추가 (파일 맨 아래에 추가)

```python
@router.get("/chat/token-usage", response_model=SharedTokenUsageResponse)
async def get_shared_token_usage():
    """전체 사용자의 누적 토큰 사용량을 반환합니다."""
    data = await token_usage_service.get_total()
    return SharedTokenUsageResponse(**data)
```

### 주의사항
- rate limit 적용하지 않음 (읽기 전용, 폴링 엔드포인트)
- `GET /chat/daily-usage`와 유사한 패턴이지만 Redis Hash에서 읽음

---

## Task 5 — `src/api/chat.ts` 수정

### 작업 유형
기존 파일 수정

### 변경 사항

파일 맨 아래에 `fetchSharedTokenUsage()` 함수 추가.

### 추가할 코드

```ts
export interface SharedTokenUsage {
  totalTokens: number;
  inputTokens: number;       // prompt_tokens
  outputTokens: number;      // candidates_tokens
  thoughtsTokens: number;
  cachedTokens: number;
  requestCount: number;
}

export async function fetchSharedTokenUsage(): Promise<SharedTokenUsage> {
  const res = await fetch(`${API_BASE_URL}/chat/token-usage`);
  if (!res.ok) {
    return {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
    };
  }
  const data = await res.json();
  return {
    totalTokens:    data.total_tokens,
    inputTokens:    data.prompt_tokens,
    outputTokens:   data.candidates_tokens,
    thoughtsTokens: data.thoughts_tokens,
    cachedTokens:   data.cached_tokens,
    requestCount:   data.request_count,
  };
}
```

### 주의사항
- 에러 시 0으로 채운 기본값 반환 (UI가 깨지지 않도록)
- 기존 `fetchDailyUsage`, `streamChat`, `summarizeConversation` 함수는 변경하지 않음

---

## Task 6 — `src/components/features/SettingsPanel.tsx` 수정

### 작업 유형
기존 파일 수정

### 현재 방식 vs 변경 후

| | 현재 | 변경 후 |
|---|---|---|
| 데이터 출처 | `chatRepository.getTotalTokenUsage()` (로컬 IndexedDB) | `fetchSharedTokenUsage()` (백엔드 Redis) |
| 갱신 주기 | 컴포넌트 마운트 시 1회 | 마운트 시 + 30초 폴링 |
| 표시 범위 | 내 브라우저 사용량 | 전체 사용자 합산 |

### 변경 사항

1. `import` 수정: `chatRepository` 토큰 관련 호출 제거, `fetchSharedTokenUsage` 추가
2. `loadTokenUsage` 함수: 백엔드 호출로 교체
3. `useEffect`: 30초 폴링 추가
4. `tokenUsage` state 타입을 `SharedTokenUsage | null`로 변경
5. 토큰 사용량 카드에 "실시간 공유" 배지 추가
6. 더 이상 사용하지 않는 `modelUsage` state 및 모델별 테이블 제거

### 변경할 부분 1: import

```ts
// 제거
import type { TokenUsageEntity } from "@/lib/db";

// 추가
import { fetchSharedTokenUsage, type SharedTokenUsage } from "@/api/chat";
import { Users } from "lucide-react";
```

### 변경할 부분 2: state 및 로직 교체

```ts
// 제거
const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 });
const [modelUsage, setModelUsage] = useState<TokenUsageEntity[]>([]);

// 추가
const [tokenUsage, setTokenUsage] = useState<SharedTokenUsage | null>(null);

const loadTokenUsage = useCallback(async () => {
  const usage = await fetchSharedTokenUsage();
  setTokenUsage(usage);
}, []);

useEffect(() => {
  void loadTokenUsage();
  const timer = setInterval(() => void loadTokenUsage(), 30_000);
  return () => clearInterval(timer);
}, [loadTokenUsage]);
```

### 변경할 부분 3: 토큰 사용량 카드 JSX

CardHeader의 제목 옆에 배지 추가, 모델별 테이블 제거:

```tsx
{/* 카드 헤더 제목 영역 */}
<div className="min-w-0">
  <div className="flex items-center gap-2">
    <CardTitle className="text-base sm:text-lg">토큰 사용량</CardTitle>
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 font-medium shrink-0">
      <Users className="h-2.5 w-2.5" />
      실시간 공유
    </span>
  </div>
  <CardDescription className="text-xs sm:text-sm">
    전체 사용자의 누적 토큰 통계
  </CardDescription>
</div>

{/* CardContent — TokenUsage 컴포넌트 */}
<TokenUsage
  usage={tokenUsage}
  maxTokens={1_000_000}
  modelId="gemini-2.5-flash-lite"
/>
```

모델별 테이블(`modelUsage.length > 0 && ...`) 블록은 완전히 제거.

### 주의사항
- `TokenUsage` 컴포넌트는 `usage` prop이 `null`이면 `null`을 반환함 → 로딩 중 빈 상태 자연스럽게 처리됨
- `chatRepository.getTotalTokenUsage()`, `chatRepository.getTokenUsageByModel()` 호출 제거
- `chatRepository` import는 `saveSettings`, `getSettings` 등 다른 용도로 여전히 필요 — 완전히 제거하지 말 것
- 30초 폴링은 컴포넌트 언마운트 시 `clearInterval`로 정리됨
