# Codex 백엔드 구현 태스크

대화 히스토리 관리 기능을 구현합니다.  
설계 전문: `docs/conversation-history-design.md`

구현 순서를 반드시 지킵니다: Task 1 → 2 → 3 → 4

---

## Task 1 — `backend/app/schemas/chat.py` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```python
from typing import Optional, List, Any
from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str
    system_instruction: Optional[str] = None
    few_shot_examples: Optional[List[dict[str, str]]] = None

class UsageMetadata(BaseModel):
    prompt_token_count: Optional[int] = None
    cached_content_token_count: Optional[int] = None
    candidates_token_count: Optional[int] = None
    tool_use_prompt_token_count: Optional[int] = None
    thoughts_token_count: Optional[int] = None
    total_token_count: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    model_used: str
    thought: Optional[str] = None
    finish_reason: Optional[str] = None
    safety_ratings: Optional[List[Any]] = None
    usage_metadata: Optional[UsageMetadata] = None
```

### 변경 사항

1. `ChatHistoryMessage` 모델 추가 (role, content 필드)
2. `SummarizeRequest` 모델 추가 (messages 필드)
3. `ChatRequest`에 `history: List[ChatHistoryMessage] = []` 필드 추가

### 완성 코드

```python
from typing import Optional, List, Any
from pydantic import BaseModel


class ChatHistoryMessage(BaseModel):
    role: str      # "user" | "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    system_instruction: Optional[str] = None
    few_shot_examples: Optional[List[dict[str, str]]] = None
    history: List[ChatHistoryMessage] = []


class SummarizeRequest(BaseModel):
    messages: List[ChatHistoryMessage]


class UsageMetadata(BaseModel):
    prompt_token_count: Optional[int] = None
    cached_content_token_count: Optional[int] = None
    candidates_token_count: Optional[int] = None
    tool_use_prompt_token_count: Optional[int] = None
    thoughts_token_count: Optional[int] = None
    total_token_count: Optional[int] = None


class ChatResponse(BaseModel):
    response: str
    model_used: str
    thought: Optional[str] = None
    finish_reason: Optional[str] = None
    safety_ratings: Optional[List[Any]] = None
    usage_metadata: Optional[UsageMetadata] = None
```

### 주의사항
- `UsageMetadata`, `ChatResponse`는 변경하지 않음
- `history` 기본값은 빈 리스트 `[]` (Optional이 아님 — 항상 리스트로 처리)

---

## Task 2 — `backend/app/services/gemini.py` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```python
from google import genai
from typing import AsyncIterator, Optional
import json
import asyncio
from app.core.config import settings

def serialize_usage_metadata(usage_metadata) -> Optional[dict]:
    if not usage_metadata:
        return None
    return {
        "prompt_token_count": usage_metadata.prompt_token_count,
        "cached_content_token_count": usage_metadata.cached_content_token_count,
        "candidates_token_count": usage_metadata.candidates_token_count,
        "tool_use_prompt_token_count": usage_metadata.tool_use_prompt_token_count,
        "thoughts_token_count": usage_metadata.thoughts_token_count,
        "total_token_count": usage_metadata.total_token_count,
    }

class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        self.model_name = settings.GEMINI_MODEL_NAME

    async def generate_response_stream(
        self,
        message: str,
        system_instruction: str = None,
        few_shot_examples: list[dict] = None
    ) -> AsyncIterator[str]:
        try:
            yield json.dumps({"status": "thinking", "model": self.model_name}) + "\n"

            config_params = {}
            if system_instruction:
                config_params['system_instruction'] = system_instruction

            request_contents = []

            if few_shot_examples:
                for example in few_shot_examples:
                    if 'input' in example:
                        request_contents.append(
                            genai.types.Content(
                                role="user",
                                parts=[genai.types.Part.from_text(text=example['input'])]
                            )
                        )
                    if 'output' in example:
                        request_contents.append(
                            genai.types.Content(
                                role="model",
                                parts=[genai.types.Part.from_text(text=example['output'])]
                            )
                        )

            # Add the actual user message
            request_contents.append(
                genai.types.Content(
                    role="user",
                    parts=[genai.types.Part.from_text(text=message)]
                )
            )

            response_iterator = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=request_contents,
                config=genai.types.GenerateContentConfig(**config_params) if config_params else None
            )

            yield json.dumps({"status": "generating"}) + "\n"

            full_text = ""
            usage_metadata = None
            finish_reason = None
            thought = None
            safety_ratings = None

            async for chunk in response_iterator:
                if chunk.text:
                    full_text += chunk.text
                    yield json.dumps({"status": "streaming", "chunk": chunk.text}) + "\n"

                if chunk.candidates:
                    candidate = chunk.candidates[0]
                    if candidate.finish_reason:
                        finish_reason = str(candidate.finish_reason)
                    if candidate.safety_ratings:
                        safety_ratings = [
                            {"category": str(sr.category), "probability": str(sr.probability)}
                            for sr in candidate.safety_ratings
                        ]
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, 'thought') and part.thought:
                                thought = part.text
                                break

                if chunk.usage_metadata:
                    usage_metadata = serialize_usage_metadata(chunk.usage_metadata)

            yield json.dumps({
                "status": "complete",
                "response": full_text,
                "model_used": self.model_name,
                "thought": thought,
                "finish_reason": finish_reason,
                "safety_ratings": safety_ratings,
                "usage_metadata": usage_metadata,
            }) + "\n"

        except Exception as e:
            yield json.dumps({"status": "error", "message": str(e)}) + "\n"

gemini_service = GeminiService()
```

### 변경 사항

`generate_response_stream`에 `history: list[dict] = None` 파라미터 추가.  
`request_contents` 구성 순서:
1. few_shot_examples (기존 유지)
2. **history 삽입** ← 추가할 부분
3. 현재 user message (기존 유지)

### 변경되는 함수 시그니처 및 삽입 위치

```python
async def generate_response_stream(
    self,
    message: str,
    system_instruction: str = None,
    few_shot_examples: list[dict] = None,
    history: list[dict] = None,          # 추가
) -> AsyncIterator[str]:
```

few_shot_examples 블록이 끝난 직후, 현재 user message 추가 직전에 아래 코드 삽입:

```python
            # 대화 히스토리 삽입 (few-shot 뒤, 현재 메시지 앞)
            if history:
                for turn in history:
                    request_contents.append(
                        genai.types.Content(
                            role=turn["role"],
                            parts=[genai.types.Part.from_text(text=turn["content"])]
                        )
                    )
```

### 주의사항
- `serialize_usage_metadata`, `__init__`, 스트리밍/메타데이터 처리 로직은 변경하지 않음
- `history`가 `None`이거나 빈 리스트면 아무것도 추가하지 않음

---

## Task 3 — `backend/app/api/endpoints/chat.py` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```python
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest
from app.services.gemini import gemini_service

router = APIRouter()

from app.services.guardrail import guardrail_service
from app.services.rate_limit import DAILY_LIMIT, daily_headers, daily_limiter, enforce_limits, get_client_key


@router.get("/chat/daily-usage")
async def get_daily_usage(http_request: Request, response: Response):
    key = get_client_key(http_request)
    remaining = max(0, daily_limiter.get_remaining(key))

    for header, value in daily_headers(remaining).items():
        response.headers[header] = value

    return {
        "limit": DAILY_LIMIT,
        "remaining": remaining,
    }


@router.post("/chat")
async def chat_stream(request: ChatRequest, http_request: Request):
    limits = enforce_limits(http_request)

    await guardrail_service.check_injection(request.message)
    safe_message = guardrail_service.format_with_delimiters(request.message)

    return StreamingResponse(
        gemini_service.generate_response_stream(
            message=safe_message,
            system_instruction=request.system_instruction,
            few_shot_examples=request.few_shot_examples
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Daily-Limit": str(limits["limit"]),
            "X-Daily-Remaining": str(limits["remaining"]),
        }
    )
```

### 변경 사항

1. `import`에 `SummarizeRequest` 추가
2. `chat_stream`의 `generate_response_stream` 호출에 `history=` 인자 추가
3. 파일 맨 아래에 `POST /chat/summarize` 엔드포인트 추가

### 완성 코드

```python
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest, SummarizeRequest
from app.services.gemini import gemini_service

router = APIRouter()

from app.services.guardrail import guardrail_service
from app.services.rate_limit import DAILY_LIMIT, daily_headers, daily_limiter, enforce_limits, get_client_key
from google.genai import types as genai_types


@router.get("/chat/daily-usage")
async def get_daily_usage(http_request: Request, response: Response):
    key = get_client_key(http_request)
    remaining = max(0, daily_limiter.get_remaining(key))

    for header, value in daily_headers(remaining).items():
        response.headers[header] = value

    return {
        "limit": DAILY_LIMIT,
        "remaining": remaining,
    }


@router.post("/chat")
async def chat_stream(request: ChatRequest, http_request: Request):
    limits = enforce_limits(http_request)

    await guardrail_service.check_injection(request.message)
    safe_message = guardrail_service.format_with_delimiters(request.message)

    return StreamingResponse(
        gemini_service.generate_response_stream(
            message=safe_message,
            system_instruction=request.system_instruction,
            few_shot_examples=request.few_shot_examples,
            history=[m.model_dump() for m in request.history] if request.history else None,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Daily-Limit": str(limits["limit"]),
            "X-Daily-Remaining": str(limits["remaining"]),
        }
    )


@router.post("/chat/summarize")
async def summarize_conversation(request: SummarizeRequest):
    if len(request.messages) < 2:
        return {"summary": "대화 내용이 부족합니다."}

    recent = request.messages[-20:]

    summary_prompt = (
        "다음 대화를 핵심 주제 중심으로 한 문장(30자 이내)으로 요약해줘. "
        "요약 문장만 출력하고 다른 설명은 하지 마. "
        "예시: '리액트 상태 관리 훅 사용법 질의응답'"
    )

    contents = [
        *[
            genai_types.Content(
                role=m.role,
                parts=[genai_types.Part.from_text(text=m.content)]
            )
            for m in recent
        ],
        genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=summary_prompt)]
        ),
    ]

    response = await gemini_service.client.aio.models.generate_content(
        model=gemini_service.model_name,
        contents=contents,
    )
    return {"summary": response.text.strip()}
```

### 주의사항
- `GET /chat/daily-usage`와 기존 `POST /chat` 로직(rate_limit, guardrail)은 변경하지 않음
- `history`는 Pydantic 모델 리스트이므로 `model_dump()`로 dict로 변환 후 서비스에 전달
- `POST /chat/summarize`는 rate limit 적용하지 않음

---

## Task 4 — `backend/tests/test_history.py` 신규 생성

### 작업 유형
신규 파일 생성

### 참고: 기존 테스트 패턴 (`tests/test_rate_limit.py`)

```python
# conftest.py가 sys.path와 .env를 자동 설정하므로 별도 설정 불필요
# mock 패턴
from unittest.mock import AsyncMock, MagicMock, patch

def _allowed(remaining: int = 9) -> MagicMock:
    m = MagicMock()
    m.allowed = True
    m.remaining = remaining
    return m

# TestClient 사용 패턴
@pytest.fixture
def client(self):
    from main import app
    return TestClient(app, raise_server_exceptions=False)

# endpoint 호출 패턴
res = client.post("/api/v1/chat", json={"message": "안녕"})
assert res.status_code == 200

# 기존 테스트에서 재사용 가능한 헬퍼
from tests.test_rate_limit import _allowed
```

### 생성할 파일 전체 코드

```python
"""
대화 히스토리 관련 테스트

검증 항목:
1. 히스토리가 request_contents에 올바른 순서로 삽입되는지
2. few-shot 뒤, 현재 메시지 앞에 위치하는지
3. 히스토리 없을 때와 있을 때 request_contents 길이 차이
4. role 변환: "user"/"model" 정확히 매핑되는지
5. 빈 히스토리 전달 시 정상 동작하는지
6. /chat/summarize 엔드포인트 동작 검증
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


# ──────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────

def _history(*pairs: tuple[str, str]) -> list[dict]:
    """(user_msg, model_msg) 쌍 목록을 히스토리 형식으로 변환."""
    result = []
    for user_msg, model_msg in pairs:
        result.append({"role": "user", "content": user_msg})
        result.append({"role": "model", "content": model_msg})
    return result


def _capture_contents():
    """generate_content_stream 호출 시 전달된 contents를 캡처하는 mock."""
    captured = {}

    async def mock_stream(*args, **kwargs):
        captured["contents"] = kwargs.get("contents", args[1] if len(args) > 1 else [])
        captured["config"] = kwargs.get("config")
        yield MagicMock(
            text="테스트 응답",
            candidates=[MagicMock(
                finish_reason="STOP",
                safety_ratings=[],
                content=MagicMock(parts=[]),
            )],
            usage_metadata=MagicMock(
                prompt_token_count=10,
                candidates_token_count=5,
                total_token_count=15,
                cached_content_token_count=0,
                tool_use_prompt_token_count=0,
                thoughts_token_count=0,
            ),
        )

    return mock_stream, captured


# ──────────────────────────────────────────────
# GeminiService 단위 테스트
# ──────────────────────────────────────────────

class TestGeminiServiceHistory:

    @pytest.fixture
    def service(self):
        from app.services.gemini import GeminiService
        svc = GeminiService.__new__(GeminiService)
        svc.model_name = "gemini-test"
        svc.client = MagicMock()
        return svc

    @pytest.mark.asyncio
    async def test_히스토리_없으면_현재_메시지만_포함(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        async for _ in service.generate_response_stream("안녕"):
            pass

        contents = captured["contents"]
        assert len(contents) == 1
        assert contents[0].role == "user"
        assert contents[0].parts[0].text == "안녕"

    @pytest.mark.asyncio
    async def test_히스토리가_현재_메시지_앞에_삽입됨(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        history = _history(("이전 질문", "이전 응답"))
        async for _ in service.generate_response_stream("현재 질문", history=history):
            pass

        contents = captured["contents"]
        assert len(contents) == 3
        assert contents[0].role == "user"
        assert contents[0].parts[0].text == "이전 질문"
        assert contents[1].role == "model"
        assert contents[1].parts[0].text == "이전 응답"
        assert contents[2].role == "user"
        assert contents[2].parts[0].text == "현재 질문"

    @pytest.mark.asyncio
    async def test_few_shot_뒤에_히스토리_삽입됨(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        few_shot = [{"input": "예시질문", "output": "예시답"}]
        history = _history(("실제 이전 질문", "실제 이전 응답"))

        async for _ in service.generate_response_stream(
            "현재 질문",
            few_shot_examples=few_shot,
            history=history,
        ):
            pass

        contents = captured["contents"]
        # [예시질문, 예시답, 이전질문, 이전응답, 현재질문]
        assert len(contents) == 5
        assert contents[0].parts[0].text == "예시질문"
        assert contents[1].parts[0].text == "예시답"
        assert contents[2].parts[0].text == "실제 이전 질문"
        assert contents[3].parts[0].text == "실제 이전 응답"
        assert contents[4].parts[0].text == "현재 질문"

    @pytest.mark.asyncio
    async def test_role_변환_user_model_정확히_매핑(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        history = [
            {"role": "user", "content": "질문"},
            {"role": "model", "content": "답변"},
        ]
        async for _ in service.generate_response_stream("다음 질문", history=history):
            pass

        contents = captured["contents"]
        assert contents[0].role == "user"
        assert contents[1].role == "model"

    @pytest.mark.asyncio
    async def test_빈_히스토리_정상_동작(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        async for _ in service.generate_response_stream("질문", history=[]):
            pass

        assert len(captured["contents"]) == 1

    @pytest.mark.asyncio
    async def test_긴_히스토리_여러_턴(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        history = _history(*[(f"질문{i}", f"답변{i}") for i in range(5)])  # 5턴 = 10개
        async for _ in service.generate_response_stream("마지막 질문", history=history):
            pass

        contents = captured["contents"]
        assert len(contents) == 11  # 히스토리 10 + 현재 1
        assert contents[-1].parts[0].text == "마지막 질문"


# ──────────────────────────────────────────────
# 엔드포인트 통합 테스트 — POST /chat (히스토리 포함)
# ──────────────────────────────────────────────

class TestChatEndpointHistory:

    @pytest.fixture
    def client(self):
        from main import app
        return TestClient(app, raise_server_exceptions=False)

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    def test_히스토리_포함_요청_200_반환(
        self, mock_stream, mock_format, mock_check,
        mock_daily, mock_cooldown, client
    ):
        from tests.test_rate_limit import _allowed

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "현재 질문"
        mock_stream.return_value = iter([])

        res = client.post("/api/v1/chat", json={
            "message": "현재 질문",
            "history": [
                {"role": "user", "content": "이전 질문"},
                {"role": "model", "content": "이전 응답"},
            ]
        })
        assert res.status_code == 200

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    def test_히스토리_없이도_정상_동작(
        self, mock_stream, mock_format, mock_check,
        mock_daily, mock_cooldown, client
    ):
        from tests.test_rate_limit import _allowed

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "질문"
        mock_stream.return_value = iter([])

        res = client.post("/api/v1/chat", json={"message": "질문"})
        assert res.status_code == 200

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    def test_히스토리_generate_response_stream에_전달됨(
        self, mock_stream, mock_format, mock_check,
        mock_daily, mock_cooldown, client
    ):
        from tests.test_rate_limit import _allowed

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "현재 질문"
        mock_stream.return_value = iter([])

        client.post("/api/v1/chat", json={
            "message": "현재 질문",
            "history": [
                {"role": "user", "content": "이전 질문"},
                {"role": "model", "content": "이전 응답"},
            ]
        })

        call_kwargs = mock_stream.call_args.kwargs
        assert call_kwargs["history"] is not None
        assert len(call_kwargs["history"]) == 2
        assert call_kwargs["history"][0]["role"] == "user"
        assert call_kwargs["history"][1]["role"] == "model"


# ──────────────────────────────────────────────
# 엔드포인트 통합 테스트 — POST /chat/summarize
# ──────────────────────────────────────────────

class TestSummarizeEndpoint:

    @pytest.fixture
    def client(self):
        from main import app
        return TestClient(app, raise_server_exceptions=False)

    @patch("app.services.gemini.gemini_service.client")
    def test_요약_정상_반환(self, mock_client, client):
        mock_response = MagicMock()
        mock_response.text = "리액트 훅 사용법 질의응답"
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        res = client.post("/api/v1/chat/summarize", json={
            "messages": [
                {"role": "user", "content": "useState 언제 써?"},
                {"role": "model", "content": "단순한 값 하나일 때 씁니다."},
                {"role": "user", "content": "useReducer는요?"},
                {"role": "model", "content": "복잡한 상태 로직에 씁니다."},
            ]
        })
        assert res.status_code == 200
        assert "summary" in res.json()

    def test_메시지_2개_미만_처리(self, client):
        res = client.post("/api/v1/chat/summarize", json={
            "messages": [{"role": "user", "content": "안녕"}]
        })
        assert res.status_code == 200
        assert res.json()["summary"] == "대화 내용이 부족합니다."

    def test_빈_메시지_처리(self, client):
        res = client.post("/api/v1/chat/summarize", json={"messages": []})
        assert res.status_code == 200
        assert res.json()["summary"] == "대화 내용이 부족합니다."
```

### 주의사항
- `conftest.py`가 `sys.path`와 `.env`를 자동 설정하므로 별도 경로 설정 불필요
- `_allowed()` 헬퍼는 `test_rate_limit.py`에서 import해서 재사용
- `@pytest.mark.asyncio`는 `generate_response_stream`이 async generator이므로 필수
- 테스트 실행 명령: `cd backend && python -m pytest tests/test_history.py -v`
